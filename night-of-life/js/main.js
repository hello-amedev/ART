'use strict';

/*
 * メインループと描画(3D 版)。
 *
 * 粒子は中心原点の 3D 空間を流れ、ゆっくりオービットするカメラから
 * 透視投影で画面に落とす。光は前後対称の短い針として描き、加算合成
 * (lighter)で重なるほど輝く。背景を薄く重ねて古い光を沈めることで
 * 軌跡(残像)になる。加算合成は順序に依らないので、奥行きのソートはしない
 * (遮蔽もしない=光は重なって明るくなるのが正しい)。
 *
 * 奥行きは「z で針の長さ・太さ・明るさ・彩度を一様にスケール」+「奥ほど
 * 藍へ霞む大気遠近」で語る(新しい色は足さない)。基調色相は時刻とともに
 * 1 日かけて色相環をめぐる。位相同期は色相のごく小さなゆらぎとしてだけ
 * 重ねる(明るさ・位置には触れない)。
 */

(() => {
  const TAU = Math.PI * 2;
  const canvas = document.getElementById('canvas');
  // 既定で WebGL2 レンダラーを試す(?gl=0 で明示的に opt-out)。
  // コンテキスト種別は排他なので、WebGL2 取得に成功した時だけ 2D コンテキストの取得を抑止する。
  // WebGL2 未対応・初期化失敗時は自動で Canvas 2D 経路へフォールバックする
  const disableGL = /[?&]gl=0/.test(location.search);
  const glRenderer = (!disableGL && typeof tryCreateRenderGL === 'function')
    ? tryCreateRenderGL(canvas)
    : null;
  const ctx = glRenderer ? null : canvas.getContext('2d');
  const debugEl = document.getElementById('debug');
  const hudEl = document.getElementById('hud');
  const hudMetaEl = hudEl.querySelector('.meta');
  const hudRowsEl = hudEl.querySelector('.rows');

  const field = new FlowField();
  const grid = new SpatialGrid(90);
  const evolution = new Evolution();

  // 各モジュールに渡す共有環境
  const env = {
    vw: 0, vh: 0,            // 表示(CSS px)
    w: 0, h: 0, d: 0,        // 世界の箱(中心原点)
    worldR: 0, coreR: 0,     // 外縁半径 / 中心湧き半径
    camDist: 0, focal: 0,    // カメラ距離 / 焦点距離(画角)
    cam: { az: 0.6, el: 0.34 },
    hour: 12, time: 0,
    field, grid,
    _tmp: [0, 0, 0, 0, 0, 0], // flowAt の出力バッファ(0..2=流れ / 3..5=最寄りの渦輪点)
    _syncParity: 0,          // 位相同期を 1 フレームに半数ずつ回すための偶奇
  };

  function resize() {
    const dprCap = (typeof isSmallScreen !== 'undefined' && isSmallScreen) ? 2.5 : 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    // 2D 側: 論理 px = CSS px に揃える / GL 側: viewport を物理ピクセルに合わせる
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (glRenderer) glRenderer.resize(canvas.width, canvas.height);
    env.vw = vw; env.vh = vh;
    const base = Math.hypot(vw, vh);
    env.w = base * 1.1; env.h = base * 1.1; env.d = base * 1.1;
    env.worldR = base * 0.66;            // この半径を越えた粒子は空間内へ再投入
    env.coreR = base * 0.06;             // 親なし誕生時の散らばり半径(互換用)
    env.baseCamDist = base * 0.72;       // 基準距離。Settings.cameraZoom で倍率を掛ける
    env.camDist = env.baseCamDist * Settings.cameraZoom;
    env.focal = Math.min(vw, vh) * 0.78; // 広めの画角で没入感を出す
    field.resize(env.w, env.h, env.d);
    paintFull();
  }

  // 時刻 → 基調色相。深夜の藍 → 明け方の紫紅 → 朝の金色 →
  // 昼の空色 → 夕の茜 → 宵の紫 → 夜の藍、と 1 日でめぐる
  const HUE_KEYS = [
    [0, 252], [4.5, 268], [6.5, 330], [8, 38], [11, 185], [15, 200],
    [17.5, 45], [19.5, 8], [21, 305], [22.5, 252], [24, 252],
  ];

  function baseHue(hour) {
    for (let i = 0; i < HUE_KEYS.length - 1; i++) {
      const h0 = HUE_KEYS[i][0], v0 = HUE_KEYS[i][1];
      const h1 = HUE_KEYS[i + 1][0], v1 = HUE_KEYS[i + 1][1];
      if (hour >= h0 && hour <= h1) {
        let t = (hour - h0) / (h1 - h0);
        t = t * t * (3 - 2 * t);
        let diff = v1 - v0;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        return ((v0 + diff * t) % 360 + 360) % 360;
      }
    }
    return HUE_KEYS[0][1];
  }

  // 昼夜の明暗(明け方 4 時が最も暗く、昼 16 時が最も明るい)
  function daylightFactor(hour) {
    return 0.5 - 0.5 * Math.cos(((hour - 4) / 24) * TAU);
  }

  function ageText(sec) {
    const m = (sec / 60) | 0;
    const s = (sec % 60) | 0;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function dec2(v) {
    return v.toFixed(2).replace(/^0\./, '.');
  }

  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = l - c / 2;
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255),
    ];
  }

  function bgRgb(hour) {
    const dl = daylightFactor(hour);
    return hslToRgb(baseHue(hour), 0.32, (3 + dl * 2.2) / 100);
  }

  function bgFill(hour, alpha) {
    const c = bgRgb(hour);
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  }

  function paintFull() {
    if (glRenderer) { glRenderer.paintFull(env.hour); return; }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bgFill(env.hour, 1);
    ctx.fillRect(0, 0, env.vw, env.vh);
  }

  // 軌跡の長さ → 背景を重ねる濃さ(薄いほど軌跡が長く残る)
  function fadeAlpha() {
    return 0.03 + 0.1 * Math.pow(1 - Settings.trailLength, 2);
  }

  // 半透明合成の 8bit 丸めで残る「澱」を、背景との差がごく小さいピクセルだけ
  // 背景値へスナップして掃除する(投影後の 2D 画面に効くので 3D 化後も有効)
  const SWEEP_DIV = 8;
  let sweepTile = 0;
  let sweepSkip = 0;

  function sweepResidue(hour) {
    // WebGL 側はそもそも 2D 半透明合成の 8bit 丸めを経由しないので澱が出ない
    if (glRenderer) return;
    sweepSkip = (sweepSkip + 1) % 4;
    if (sweepSkip !== 0) return;
    const W = canvas.width, H = canvas.height;
    const tw = Math.ceil(W / SWEEP_DIV), th = Math.ceil(H / SWEEP_DIV);
    const tx = (sweepTile % SWEEP_DIV) * tw;
    const ty = ((sweepTile / SWEEP_DIV) | 0) * th;
    sweepTile = (sweepTile + 1) % (SWEEP_DIV * SWEEP_DIV);
    const w = Math.min(tw, W - tx), h = Math.min(th, H - ty);
    if (w <= 0 || h <= 0) return;
    const bgc = bgRgb(hour);
    const img = ctx.getImageData(tx, ty, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - bgc[0], dg = d[i + 1] - bgc[1], db = d[i + 2] - bgc[2];
      if (dr * dr + dg * dg + db * db <= 18) {
        d[i] = bgc[0];
        d[i + 1] = bgc[1];
        d[i + 2] = bgc[2];
      }
    }
    ctx.putImageData(img, tx, ty);
  }

  function draw() {
    if (glRenderer) {
      // WebGL2 経路: 背景フェード + 粒子加算合成を 1 ステップで行う
      glRenderer.draw(env, evolution, Settings);
      return;
    }
    const hour = env.hour;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bgFill(hour, fadeAlpha());
    ctx.fillRect(0, 0, env.vw, env.vh);

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt'; // 丸い線端は「頭」に見えて生物感が出る。平らに切って硬質に

    const hue0 = baseHue(hour);
    const satMod = 0.92 + daylightFactor(hour) * 0.08;
    const bright = Settings.brightness;

    const cam = env.cam;
    const caz = Math.cos(cam.az), saz = Math.sin(cam.az);
    const cel = Math.cos(cam.el), sel = Math.sin(cam.el);
    const SX = env.vw / 2, SY = env.vh / 2, FOC = env.focal, CD = env.camDist;
    const far = CD + env.worldR, span = (far - 1) || 1;
    const refSc = FOC / CD;
    const O = env._O || (env._O = {});
    const A = env._A || (env._A = {});
    const B = env._B || (env._B = {});

    // ワールド点 → 画面。方位回転(y 軸)→ 仰角(x 軸)→ 透視投影
    function pr(x, y, z, o) {
      const x1 = x * caz + z * saz;
      const z1 = -x * saz + z * caz;
      const y2 = y * cel - z1 * sel;
      const z2 = y * sel + z1 * cel;
      const vz = z2 + CD;
      o.vz = vz;
      if (vz < 1) return;
      const sc = FOC / vz;
      o.sx = SX + x1 * sc;
      o.sy = SY - y2 * sc;
      o.sc = sc;
    }

    for (const sp of evolution.species) {
      if (sp.opacity <= 0.005) continue;
      const g = sp.genome;
      // 突然変異の一族も特別な発光はさせない。変異は「親と違う冴えた色」そのもので見せる。
      // 種族包絡(sp.opacity)はここでは外し、粒子ループ内で状態に応じた per-particle pEnv を掛ける
      const baseRaw = 0.15 * (0.35 + 0.65 * sp.activity) * bright;
      const fadeProgress = sp.state === 'out' ? (1 - sp.opacity) : 0;
      const isOut = sp.state === 'out';
      const isIn  = sp.state === 'in';
      const sat0 = Math.min(96, g.satBase * 100 * satMod);
      const lum0 = Math.min(78, g.lumBase * 100 + 6);
      const lineBase = g.glowSize * 0.55;

      for (const p of sp.particles) {
        // 前後対称の針。両端を個別に投影し、その中点を粒子の画面位置とする
        // (中心の投影を省いて 1 粒子あたりの投影を 2 回に抑える)
        const half = g.strokeLen * p.sizeJ * 0.5;
        pr(p.x - p.vx * half, p.y - p.vy * half, p.z - p.vz * half, A);
        pr(p.x + p.vx * half, p.y + p.vy * half, p.z + p.vz * half, B);
        if (A.vz < 1 || B.vz < 1) continue; // カメラ後方
        const sxc = (A.sx + B.sx) * 0.5, syc = (A.sy + B.sy) * 0.5;
        if (sxc < -120 || sxc > env.vw + 120 || syc < -120 || syc > env.vh + 120) continue;
        let dn = ((A.vz + B.vz) * 0.5 - 1) / span; if (dn < 0) dn = 0; else if (dn > 1) dn = 1; // 0=手前 1=奥
        const scc = (A.sc + B.sc) * 0.5;

        let hue = hue0 + g.hueOffset + p.hueJ * g.hueSpread;
        hue += Math.sin(p.phase) * 8; // 同期した近傍がほのかに色を揃える(±8°)
        // 奥ほど藍(250)へ霞む大気遠近(最短弧でブレンド。新しい色は足さない)
        let diff = 250 - hue; diff = ((diff % 360) + 540) % 360 - 180;
        hue = ((hue + diff * dn * 0.4) % 360 + 360) % 360;
        const sat = (sat0 * (1 - dn * 0.35)) | 0;
        let lum = lum0 * (1 - dn * 0.42); if (lum < 24) lum = 24;
        // per-particle 包絡: 退場中はウィンクアウト(粒子の exitOffset 順に消える)、誕生中は種族 opacity 一律
        let pEnv;
        if (isOut) {
          pEnv = 1 - (fadeProgress - p.exitOffset * 0.7) / 0.3;
          if (pEnv < 0) pEnv = 0; else if (pEnv > 1) pEnv = 1;
        } else if (isIn) {
          pEnv = sp.opacity;
        } else {
          pEnv = 1;
        }
        const alpha = baseRaw * pEnv * (1 - dn * 0.6);

        ctx.strokeStyle = `hsla(${hue | 0},${sat}%,${lum | 0}%,${alpha.toFixed(3)})`;
        // 1px 未満はピクセル境界で AA が効かずジャギーが出るため最小 1.0px に保つ
        ctx.lineWidth = Math.max(1.0, lineBase * p.sizeJ * (scc / refSc));
        ctx.beginPath();
        ctx.moveTo(A.sx, A.sy);
        ctx.lineTo(B.sx, B.sy);
        ctx.stroke();
      }
    }

    sweepResidue(hour);
  }

  function rebuildGrid() {
    grid.clear();
    // 近傍は「色の同期」(位相同期の色相ゆらぎ)のためだけに使う
    for (const sp of evolution.species)
      for (const p of sp.particles) grid.insert(p, sp.id);
  }

  let last = performance.now();
  let ecoSkip = false;

  function frame(now) {
    requestAnimationFrame(frame);
    if (Settings.ecoMode) {
      ecoSkip = !ecoSkip;
      if (ecoSkip) return; // 30fps に間引く
    }
    let dt = (now - last) / 1000;
    last = now;
    if (dt <= 0) return;
    if (dt > 0.05) dt = 0.05;

    env.time += dt;
    env.hour = evolution.hour(now);
    env._syncParity ^= 1;

    field.update(dt);
    evolution.tick(dt, env);
    rebuildGrid();
    for (const sp of evolution.species) sp.update(dt, env);
    draw();

    updateHud(dt);
    if (Flags.debug) updateDebug();
    else if (!debugEl.hidden) debugEl.hidden = true;
  }

  // 右下の常設システム表示(観測パネル)。種族ごとに 1 行
  let hudTimer = 1;

  function updateHud(dt) {
    if (!Settings.showHud) {
      if (!hudEl.hidden) hudEl.hidden = true;
      return;
    }
    hudTimer += dt;
    if (hudTimer < 1) return;
    hudTimer = 0;
    hudEl.hidden = false;

    const h = env.hour;
    const hh = String(h | 0).padStart(2, '0');
    const mm = String(((h % 1) * 60) | 0).padStart(2, '0');
    // 左: タイトル + 控えめなバージョン / 右: 世代 + 時刻(+ demo)。CSS で flex 分割
    const info = `gen ${evolution.generation} · ${hh}:${mm}${Flags.demo ? ' · demo' : ''}`;
    hudMetaEl.innerHTML =
      '<span class="ttl">A NIGHT OF LIFE <span class="ver">v2.0.0</span></span>' +
      `<span class="info">${info}</span>`;

    const sps = evolution.species;
    const hue0 = baseHue(h);

    const existing = new Map();
    for (const el of Array.from(hudRowsEl.children)) existing.set(el.dataset.sid, el);
    const seen = new Set();

    for (const sp of sps) {
      const sid = String(sp.id);
      seen.add(sid);
      try {
        let row = existing.get(sid);
        if (!row) {
          row = document.createElement('div');
          row.className = 'row';
          row.dataset.sid = sid;
          row.innerHTML =
            '<span class="chip"></span>' +
            '<span class="gen"></span>' +
            '<span class="from"></span>' +
            '<span class="act"></span>' +
            '<span class="vig"></span>' +
            '<span class="spd"></span>' +
            '<span class="flk"></span>' +
            '<span class="len"></span>' +
            '<span class="age"></span>' +
            '<span class="state"></span>';
        }
        hudRowsEl.appendChild(row);

        const g = sp.genome;
        const hue = (((hue0 + g.hueOffset) % 360) + 360) % 360;
        const chipCol = `hsl(${hue | 0}, ${(g.satBase * 100) | 0}%, ${(g.lumBase * 100 + 8) | 0}%)`;
        row.children[0].style.backgroundColor = chipCol;
        row.style.backgroundColor = sp.state === 'in'
          ? `hsla(${hue | 0}, ${(g.satBase * 100) | 0}%, ${(g.lumBase * 100 + 8) | 0}%, ${((1 - sp.opacity) * 0.22).toFixed(3)})`
          : '';
        row.children[1].textContent = sp.generation;
        row.children[2].textContent = sp.parentGens
          ? `${sp.parentGens[0]}×${sp.parentGens[1]}`
          : '';
        row.children[3].textContent = dec2(sp.activity);
        row.children[4].textContent = dec2(sp.vigor);
        row.children[5].textContent = dec2((g.speed - 0.3) / 1.3);
        row.children[6].textContent = dec2((g.cohesion + g.alignment) / 2);
        row.children[7].textContent = dec2((g.strokeLen - 7) / 15);
        row.children[8].textContent = ageText(sp.ageSec);

        const stateEl = row.children[9];
        if (sp.state === 'out') {
          stateEl.textContent = '↓out';
          stateEl.classList.remove('nova');
        } else if (sp.nova > 0) {
          stateEl.textContent = '✦';
          stateEl.classList.add('nova');
        } else {
          stateEl.textContent = sp.state === 'in' ? 'in' : '·';
          stateEl.classList.remove('nova');
        }
      } catch (e) {
        ErrorLog.push('hud row: ' + e.message);
        if (ErrorLog.length > 5) ErrorLog.shift();
      }
    }

    for (const [sid, el] of existing) {
      if (!seen.has(sid)) el.remove();
    }
  }

  function updateDebug() {
    debugEl.hidden = false;
    const h = env.hour;
    const lines = [
      `time ${String(h | 0).padStart(2, '0')}:${String(((h % 1) * 60) | 0).padStart(2, '0')}` +
      `  gen ${evolution.generation}${Flags.demo ? '  [DEMO]' : ''}`,
    ];
    for (const sp of evolution.species) {
      const f = Genome.fitness(sp.genome, h);
      lines.push(
        ` #${String(sp.generation).padStart(3)} ${sp.state.padEnd(5)}` +
        ` fit ${f.toFixed(2)} act ${sp.activity.toFixed(2)}` +
        ` peak ${sp.genome.dayPhase.toFixed(1)}h w ${sp.genome.phaseWidth.toFixed(1)}`
      );
    }
    if (Flags.debug) {
      let storageState = 'NG';
      let savedCount = '-';
      try {
        localStorage.setItem('__art_test', '1');
        localStorage.removeItem('__art_test');
        storageState = 'OK';
        const raw = localStorage.getItem(evolution.storageKey);
        savedCount = raw ? String((JSON.parse(raw).genomes || []).length) : 'none';
      } catch (e) {
        storageState = 'NG ' + e.name;
      }
      lines.push('--- diag ---');
      lines.push(
        `species ${evolution.species.length} | hud rows ${hudRowsEl.children.length}` +
        ` | saved ${savedCount} | storage ${storageState}`
      );
      lines.push(
        `dpr ${(window.devicePixelRatio || 1).toFixed(2)}` +
        ` | win ${window.innerWidth}x${window.innerHeight}` +
        ` | canvas ${canvas.width}x${canvas.height}`
      );
      lines.push(
        `particleCount ${Settings.particleCount} | perSpecies ${evolution.perSpeciesCount()}` +
        ` | evoMin ${Settings.evolutionMinutes} | hud ${Settings.showHud}`
      );
      lines.push(ErrorLog.length ? 'errors:' : 'errors: none');
      for (const er of ErrorLog) lines.push(' ' + er);
    }
    debugEl.textContent = lines.join('\n');
  }

  // Lively の設定画面から呼ばれる操作
  window.App = {
    applyParticleCount() {
      const per = evolution.perSpeciesCount();
      for (const sp of evolution.species) sp.setCount(per, env);
    },
    applyCameraZoom() {
      // スライダー変更を即座に反映する(基準距離は resize 時に保存済み)
      env.camDist = env.baseCamDist * Settings.cameraZoom;
    },
    resetEvolution() {
      evolution.reset(env);
      paintFull();
    },
    // 動作確認用: いますぐ世代交代を 1 回起こし、大きな突然変異を強制する
    forceNova() {
      evolution.genTimer = 0;
      evolution.step(env, true);
      return 'forced a big-mutation birth';
    },
    // デバッグ用: seconds 秒ぶんを一気にシミュレートして描く(rAF が止まる環境でも検証できる)
    simulate(seconds) {
      const step = 1 / 60;
      const n = Math.round(seconds / step);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        env.time += step;
        evolution.simOffsetMs += step * 1000;
        env.hour = evolution.hour(performance.now());
        env._syncParity ^= 1;
        field.update(step);
        evolution.tick(step, env);
        rebuildGrid();
        for (const sp of evolution.species) sp.update(step, env);
        draw();
      }
      const ms = performance.now() - t0;
      updateHud(1);
      if (Flags.debug) updateDebug();
      return `simulated ${seconds}s (${n} frames) in ${ms.toFixed(0)}ms = ${(ms / n).toFixed(2)}ms/frame`;
    },
  };

  window.addEventListener('resize', resize);

  resize();
  env.hour = evolution.hour(performance.now());
  evolution.init(env);
  paintFull();
  requestAnimationFrame(frame);
})();
