'use strict';

/*
 * メインループと描画。
 *
 * 描画は「全消去」ではなく、背景色を薄く重ねて古い光を
 * ゆっくり沈めていく方式。これが軌跡(残像)になる。
 * 粒子は加算合成(lighter)で重なるほど輝く。
 *
 * 基調色相は時刻とともに 1 日かけて色相環をめぐる。
 * 種族の色は「基調色相 + 遺伝子のずれ」で決まるので、
 * どの時間帯でも画面全体の調和が保たれる。
 */

(() => {
  const TAU = Math.PI * 2;
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const debugEl = document.getElementById('debug');
  const hudEl = document.getElementById('hud');
  const hudMetaEl = hudEl.querySelector('.meta');
  const hudRowsEl = hudEl.querySelector('.rows');
  const hudLogEl = hudEl.querySelector('.log');

  const field = new FlowField();
  const grid = new SpatialGrid(48);
  const evolution = new Evolution();

  // 各モジュールに渡す共有環境
  const env = { w: 0, h: 0, hour: 12, time: 0, field, grid };

  function resize() {
    const oldW = env.w, oldH = env.h;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
    // スマホなど狭い画面では少しズームアウトして、光の流れが見える範囲を広げる。
    // 論理世界(env.w/env.h)を表示より広く取り、その分だけ等倍で縮小して描く(歪みなし)
    const zoom = (typeof isSmallScreen !== 'undefined' && isSmallScreen) ? 0.72 : 1;
    env.w = Math.round(vw / zoom);
    env.h = Math.round(vh / zoom);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    const s = zoom * dpr; // 論理座標 → 実ピクセル(x/y 同じスケールなので歪まない)
    ctx.setTransform(s, 0, 0, s, 0, 0);
    field.resize(env.w, env.h);
    // 粒子を新しい画面サイズへ等比で再配置(放置すると旧領域に固まる)
    if (oldW > 0 && (oldW !== env.w || oldH !== env.h)) {
      const sx = env.w / oldW, sy = env.h / oldH;
      for (const sp of evolution.species) sp.rescale(sx, sy);
    }
    paintFull();
  }

  // 時刻 → 基調色相。深夜の藍 → 明け方の紫紅 → 朝の金色 →
  // 昼の空色 → 夕の茜 → 宵の紫 → 夜の藍、と 1 日でめぐる
  // 中間色(緑・黄)の帯は美しく見せにくいので、キーを細かく置いて素早く通過させる
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

  // 生きてきた時間(齢)をストップウォッチ式 m:ss で。単位漢字を使わず一貫表記。
  // 無常さ — 誰が古株で誰が新参かが、増え続ける一つの数で分かる
  function ageText(sec) {
    const m = (sec / 60) | 0;
    const s = (sec % 60) | 0;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // 0..1 系の値を「先頭の 0 を省いた素の数値」に(.67 / 1.23)。
  // デバッグ表示と同じ「機械的な数値の羅列」の質感にするための整形
  function dec2(v) {
    return v.toFixed(2).replace(/^0\./, '.');
  }

  // h: 0..360, s/l: 0..1 → [r, g, b](0..255 整数)
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

  // 背景色は RGB 値でも持つ(澱スナップでピクセル比較に使うため)
  function bgRgb(hour) {
    const dl = daylightFactor(hour);
    return hslToRgb(baseHue(hour), 0.32, (3 + dl * 2.2) / 100);
  }

  function bgFill(hour, alpha) {
    const c = bgRgb(hour);
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  }

  function paintFull() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bgFill(env.hour, 1);
    ctx.fillRect(0, 0, env.w, env.h);
  }

  // 軌跡の長さ → 背景を重ねる濃さ(薄いほど軌跡が長く残る)。
  // 0.012 を下回ると古い光が「澱」として堆積し背景が灰色に浮くので下限を保つ。
  // 短めの尾 = 筆致が画面に置かれては消える、絵画的な質感
  function fadeAlpha() {
    return 0.03 + 0.1 * Math.pow(1 - Settings.trailLength, 2);
  }

  // 半透明合成の 8bit 丸めで、消えたはずの軌跡が「澱」として薄く残り続ける。
  // 対策: 毎回 1 タイルずつ、背景との差がごく小さいピクセルだけを背景値へ
  // スナップする。画面全体を数秒で一巡し、目に見える変化は一切ない
  // (差 ±2 程度の「ほぼ消えた光」しか触らないため)。
  // 以前の「定期的に強いフェードを入れる」方式は明滅が見えて連続性を壊すため廃止
  const SWEEP_DIV = 8;       // 8x8 = 64 タイル
  let sweepTile = 0;
  let sweepSkip = 0;

  function sweepResidue(hour) {
    sweepSkip = (sweepSkip + 1) % 4; // 4 フレームに 1 タイル(負荷分散)
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
    const hour = env.hour;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bgFill(hour, fadeAlpha());
    ctx.fillRect(0, 0, env.w, env.h);

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt'; // 丸い線端は「頭」に見えて生物感が出る。平らに切って硬質に

    const hue0 = baseHue(hour);
    const satMod = 0.92 + daylightFactor(hour) * 0.08;
    const bright = Settings.brightness;

    for (const sp of evolution.species) {
      if (sp.opacity <= 0.005) continue;
      const g = sp.genome;
      // 突然変異で生まれた一族も特別な発光はさせない。変異のインパクトは「親と違う冴えた色」
      // そのもので見せる(強く光らせると色が飛んで、かえって変異が分からなくなるため)
      const alphaBase = 0.15 * sp.opacity * (0.35 + 0.65 * sp.activity) * bright;
      const coreAlpha = alphaBase.toFixed(3);
      const sat = Math.min(96, g.satBase * 100 * satMod) | 0;
      const lum = (Math.min(78, g.lumBase * 100 + 6)) | 0;

      // 粒子は進行方向を向いた「前後対称の短い光の針」として描く。
      // 頭も尾もないシルエット = 無機的な筆致。彗星型は生物っぽく見える
      for (const p of sp.particles) {
        const hue = ((hue0 + g.hueOffset + p.hueJ * g.hueSpread + 720) % 360) | 0;
        const half = g.strokeLen * p.sizeJ * 0.5;
        const ca = Math.cos(p.a) * half;
        const sa = Math.sin(p.a) * half;
        ctx.strokeStyle = `hsla(${hue},${sat}%,${lum}%,${coreAlpha})`;
        // 細く。「点」でなく「線」に見える太さ
        ctx.lineWidth = g.glowSize * p.sizeJ * 0.55;
        ctx.beginPath();
        ctx.moveTo(p.x - ca, p.y - sa);
        ctx.lineTo(p.x + ca, p.y + sa);
        ctx.stroke();
      }
    }

    sweepResidue(hour);
  }

  function rebuildGrid() {
    grid.clear();
    for (const sp of evolution.species) {
      if (!sp.usesFlocking) continue; // 群れない種族は登録不要
      for (const p of sp.particles) grid.insert(p, sp.id);
    }
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
    if (dt > 0.05) dt = 0.05; // 復帰直後などの巨大なステップを抑制

    env.time += dt;
    env.hour = evolution.hour(now);

    field.update(dt);
    evolution.tick(dt, env);
    rebuildGrid();
    for (const sp of evolution.species) sp.update(dt, env);
    draw();

    updateHud(dt);
    if (Flags.debug) updateDebug();
    else if (!debugEl.hidden) debugEl.hidden = true;
  }

  // 右下の常設システム表示(観測パネル)。
  // 種族ごとに 1 行: 色チップ / 世代と系譜(#42‹38×35 = 38 世代と 35 世代の子) /
  // 活動度バー / 活動ピーク時刻 / 状態(IN=誕生中, OUT=退場中)。
  // チップとバーの明るさは「目覚め度」— 夜行性の種族の行は夜に灯る
  let hudTimer = 1; // 起動 1 秒後に初回更新

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
    hudMetaEl.textContent =
      `A NIGHT OF LIFE   gen ${evolution.generation} · ${hh}:${mm}${Flags.demo ? ' · demo' : ''}`;

    const sps = evolution.species;
    const hue0 = baseHue(h);

    // 行は種族 id で対応付けて使い回す(バー幅の transition を活かす)
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
          // 色チップ(identity)/ 世代 / 掛け合わせ親 / 活動 / 適応 /
          // 速さ / 群れ / 筆の長さ / 齢 / 状態。すべて素の数値・等幅整列
          // (デバッグ表示と同じ機械的な羅列。spd/flk/len は画面で見える違いと対応)
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
        hudRowsEl.appendChild(row); // 配列順に並べ直し(既存ノードは移動になる)

        const g = sp.genome;
        const hue = (((hue0 + g.hueOffset) % 360) + 360) % 360;
        // チップは常に純粋な遺伝子色(活動や誕生/退場で薄めない = どの色の種族か常に分かる)
        const chipCol = `hsl(${hue | 0}, ${(g.satBase * 100) | 0}%, ${(g.lumBase * 100 + 8) | 0}%)`;
        row.children[0].style.backgroundColor = chipCol;             // chip(identity・純色)
        // 相続グロー: 誕生中(in)は行が自分の色(=親から受け継いだ色)でうっすら灯り、
        // 馴染むにつれ消える。新しい血が入った瞬間が台帳でも分かる
        row.style.backgroundColor = sp.state === 'in'
          ? `hsla(${hue | 0}, ${(g.satBase * 100) | 0}%, ${(g.lumBase * 100 + 8) | 0}%, ${((1 - sp.opacity) * 0.22).toFixed(3)})`
          : '';
        row.children[1].textContent = sp.generation;                 // 世代(今の種族)
        row.children[2].textContent = sp.parentGens                  // 掛け合わせ親(系譜)
          ? `${sp.parentGens[0]}×${sp.parentGens[1]}`
          : '';
        row.children[3].textContent = dec2(sp.activity);             // 活動(いまの目覚め度)
        row.children[4].textContent = dec2(sp.vigor);                // 家系の勢い(子を残せているか)
        row.children[5].textContent = dec2((g.speed - 0.3) / 1.3);   // 速さ(0..1 正規化)
        row.children[6].textContent = dec2((g.cohesion + g.alignment) / 2); // 群れ(0..1)
        row.children[7].textContent = dec2((g.strokeLen - 7) / 15);  // 筆の長さ(0..1)
        row.children[8].textContent = ageText(sp.ageSec);            // 齢(m:ss)

        // state: 退場(↓out)を最優先、次に突然変異の印(✦ マークのみ)、誕生(in)
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
        // 1 行のエラーで観測パネル全体が止まらないように。内容は ?debug で見える
        ErrorLog.push('hud row: ' + e.message);
        if (ErrorLog.length > 5) ErrorLog.shift();
      }
    }

    for (const [sid, el] of existing) {
      if (!seen.has(sid)) el.remove();
    }

    // 事象ログ: 直近の誕生(↑)/退場(↓)/突然変異(✦)/参入(+)を新しい順に。
    // 高さを動かさないため常に 3 行ぶん描く(無いぶんは空行で予約)。
    // 経過秒(+Ns)が刻々と増え、止まっていても「観察者の手帳」が静かに動く
    const show = evolution.eventLog.slice(-3).reverse();
    let logHtml = '';
    for (let i = 0; i < 3; i++) {
      const e = show[i];
      if (!e) { logHtml += '<div class="ev">&nbsp;</div>'; continue; }
      const age = Math.max(0, env.time - e.time) | 0;
      const cls = e.glyph === '✦' ? 'ev nova' : 'ev';
      logHtml += `<div class="${cls}">${e.glyph} ${e.label}<span class="evt"> +${age}s</span></div>`;
    }
    hudLogEl.innerHTML = logHtml;
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
    // 環境の不具合調査用の診断情報(開発用。?debug 指定時のみ。
    // Lively 内では DevTools が見られないため画面に出せるようにしてある)
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
    resetEvolution() {
      evolution.reset(env);
      paintFull();
    },
    // 動作確認用: いますぐ世代交代を 1 回起こし、大きな突然変異(親と違う色の一族)を強制する。
    // 大きな突然変異は確率 15% でしか起きないため、確認の手段として用意
    forceNova() {
      evolution.genTimer = 0;
      evolution.step(env, true);
      return 'forced a big-mutation birth';
    },
    // デバッグ用: seconds 秒ぶんを一気にシミュレートして描く。
    // rAF が止まる環境(オフスクリーン確認など)でも絵と進化を検証できる
    simulate(seconds) {
      const step = 1 / 60;
      const n = Math.round(seconds / step);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        env.time += step;
        evolution.simOffsetMs += step * 1000;
        env.hour = evolution.hour(performance.now());
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
