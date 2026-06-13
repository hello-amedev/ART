'use strict';

/*
 * 種族(同じ遺伝子を共有する光の粒子のグループ)と、
 * 群れ計算用の空間グリッド。
 *
 * 粒子は「向き + 速さ」で動き、目標方向へ少しずつしか
 * 旋回できない(agility 制限)。この制限が絹のような
 * 滑らかな軌跡を生む。
 */

class SpatialGrid {
  constructor(cellSize) {
    this.cell = cellSize;
    this.map = new Map();
  }

  clear() {
    this.map.clear();
  }

  _key(cx, cy) {
    return cx * 8192 + cy;
  }

  insert(p, sid) {
    const cx = (p.x / this.cell) | 0;
    const cy = (p.y / this.cell) | 0;
    const k = this._key(cx, cy);
    let arr = this.map.get(k);
    if (!arr) {
      arr = [];
      this.map.set(k, arr);
    }
    p._sid = sid;
    arr.push(p);
  }

  // (x, y) から半径 r 内にいる同種族の粒子を走査する。
  // コールバックが true を返したら打ち切り(近傍数の上限用)。
  forNeighbors(x, y, r, sid, self, cb) {
    const c0 = ((x - r) / this.cell) | 0;
    const c1 = ((x + r) / this.cell) | 0;
    const r0 = ((y - r) / this.cell) | 0;
    const r1 = ((y + r) / this.cell) | 0;
    const r2 = r * r;
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const arr = this.map.get(this._key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const q = arr[i];
          if (q === self || q._sid !== sid) continue;
          const dx = q.x - x;
          const dy = q.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < r2 && cb(q, dx, dy, d2)) return;
        }
      }
    }
  }
}

class Species {
  static nextId = 1;

  // opts.fadeIn     … 透明から浮かび上がる(誕生)
  // opts.parents    … 親 2 種族。粒子が親たちの現在位置から湧き出す(交叉の可視化)。
  //                    「2 つの流れの中から新しい色が生まれてくる」が画面で見える
  // opts.parentGens … 復元時に系譜だけ引き継ぐ([親世代, 親世代])
  // opts.nova       … 大変異の誕生。しばらく「新星の輝き」(ひときわ明るい筆致)をまとう
  // opts.ageSec     … 復元時に生きてきた時間(齢)を引き継ぐ
  constructor(genome, count, generation, env, opts = {}) {
    this.genome = genome;
    this.generation = generation;
    this.id = Species.nextId++;
    this.opacity = opts.fadeIn ? 0 : 1;
    this.state = opts.fadeIn ? 'in' : 'alive'; // 'in' | 'alive' | 'out'
    this.activity = 0.5;                       // 時刻適応度からくる元気さ 0..1
    this.isNovaBirth = !!opts.nova;            // 大変異として生まれたか(誕生演出の制御に使う)
    this.nova = opts.nova ? 1 : 0;             // 新星の輝きの燃料(1 → 0 へ減衰)。保存されない
    this.novaGlow = 0;                         // 実際の輝きの強さ 0..1(燃料から算出。swell→fade)
    this.ageSec = opts.ageSec || 0;            // 生きてきた時間(画面に存在した累積秒)
    this.particles = [];
    this.parentGens = opts.parentGens ||
      (opts.parents ? opts.parents.map(s => s.generation) : null);

    // 誕生の湧き出し元 = 親 2 種族の粒子の現在位置(誕生時のみ使い、すぐ捨てる)
    this.birthPool = null;
    if (opts.parents && opts.parents.length) {
      this.birthPool = [];
      for (const parent of opts.parents) {
        for (const q of parent.particles) this.birthPool.push(q.x, q.y);
      }
    }

    for (let i = 0; i < count; i++) {
      this.particles.push(this.spawnParticle(env));
    }
    this.birthPool = null;
  }

  spawnParticle(env) {
    let x, y;
    if (this.birthPool && this.birthPool.length >= 2) {
      const k = ((Math.random() * (this.birthPool.length / 2)) | 0) * 2;
      x = this.birthPool[k] + Genome.gauss() * 24;
      y = this.birthPool[k + 1] + Genome.gauss() * 24;
    } else {
      x = Math.random() * env.w;
      y = Math.random() * env.h;
    }
    // 初期の向きはその場の風向きに揃える(筆致の美しさは向きの揃いで決まる。
    // ランダム向きだと旋回の遅い粒子が揃うまで画面が乱れる)
    const flowA = env.field && env.field.angles.length
      ? env.field.angleAt(x, y)
      : Math.random() * Genome.TAU;
    return {
      x, y,
      a: flowA + Genome.gauss() * 0.3,     // 進行方向(= 筆致の向き)
      hueJ: Genome.gauss(),                // 色相の個体差(-1..1)
      sizeJ: 0.7 + Math.random() * 0.6,
      spdJ: 0.8 + Math.random() * 0.4,
      _sid: 0,
    };
  }

  setCount(n, env) {
    while (this.particles.length < n) this.particles.push(this.spawnParticle(env));
    if (this.particles.length > n) this.particles.length = n;
  }

  // 画面サイズ変更時、構図を保ったまま新しいサイズへ引き伸ばす
  rescale(sx, sy) {
    for (const p of this.particles) {
      p.x *= sx;
      p.y *= sy;
    }
  }

  get usesFlocking() {
    const g = this.genome;
    return (g.cohesion + g.alignment + g.separation) > 0.25;
  }

  update(dt, env) {
    const g = this.genome;
    const dtF = Math.min(dt * 60, 1.8); // 60fps を 1 とするステップ倍率
    const demo = (typeof Flags !== 'undefined' && Flags.demo);

    this.ageSec += dt; // 齢を刻む(無常さの可視化: 観測パネルに表示)

    // 新星の輝き(大変異の誕生演出)。燃料 nova は一方向に減るだけ。
    // 見た目の強さ novaGlow は「素早く立ち上がり → ゆっくり尾を引いて消える」一発の閃光
    // (誕生という一度きりの出来事。周期的な明滅とは別物なので禁じ手には当たらない)
    if (this.nova > 0) {
      const novaSec = demo ? 15 : 90;
      this.nova = Math.max(0, this.nova - dt / novaSec);
      const age01 = 1 - this.nova;                       // 0(誕生)→ 1(燃え尽き)
      this.novaGlow = Math.sin(Math.PI * Math.pow(age01, 0.32)); // 約 1 割の時点で最大
    } else {
      this.novaGlow = 0;
    }

    // 誕生・退場のフェード(デモモードでは世代交代も速いので短縮)。
    // 大変異の誕生だけは「点火」のように素早く立ち上がり、輝きのピークに間に合わせる
    const fadeInSec = this.isNovaBirth ? (demo ? 1.5 : 10) : (demo ? 8 : 40);
    const fadeOutSec = demo ? 8 : 40;
    if (this.state === 'in') {
      this.opacity += dt / fadeInSec;
      if (this.opacity >= 1) {
        this.opacity = 1;
        this.state = 'alive';
      }
    } else if (this.state === 'out') {
      this.opacity -= dt / fadeOutSec;
      if (this.opacity < 0) this.opacity = 0;
    }

    // 時刻適応度 → 活動度(急変させず、ゆっくり目覚め / まどろむ)。
    // 退場する種族は衰える: だんだん動きが鈍り、輝きを失いながら消えていく
    const targetAct = this.state === 'out'
      ? 0.1
      : 0.3 + 0.7 * Math.pow(Math.min(1, Genome.fitness(g, env.hour)), 0.8);
    const followRate = this.state === 'out' ? 0.08 : 0.5;
    this.activity += (targetAct - this.activity) * Math.min(1, dt * followRate);

    // 無機質に、ゆっくりと。動きの有機性は流れ場の弧だけが作る
    const speed = 0.42 * g.speed * (0.45 + 0.55 * this.activity);
    const flock = this.usesFlocking;
    const R = g.flockRadius;
    const grid = env.grid;
    const inertia = (1 - g.flowObedience) * 0.9;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // まれに風に舞い上がって別の場所へ転生する(平均 30 秒)。
      // これがないと同じ粒が同じ渦を周回し続けて「轍」を刻み、
      // 渦の中心に粒が溜まり続ける
      if (Math.random() < dt * 0.033) {
        const np = this.spawnParticle(env);
        p.x = np.x;
        p.y = np.y;
        p.a = np.a;
        continue;
      }

      // 風 + 自分の慣性
      const fa = env.field.angleAt(p.x, p.y);
      let vx = Math.cos(fa) * g.flowObedience + Math.cos(p.a) * inertia;
      let vy = Math.sin(fa) * g.flowObedience + Math.sin(p.a) * inertia;

      // 群れ(同種族のみ)。「寄り集まる」は弱く、「磁場に揃う」整列を主役に
      if (flock) {
        let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, n = 0;
        grid.forNeighbors(p.x, p.y, R, this.id, p, (q, dx, dy, d2) => {
          n++;
          cx += dx; cy += dy;
          ax += Math.cos(q.a); ay += Math.sin(q.a);
          const d = Math.sqrt(d2) + 0.001;
          const f = 1 - d / R;
          sx -= (dx / d) * f;
          sy -= (dy / d) * f;
          return n >= 7;
        });
        if (n > 0) {
          const cl = Math.hypot(cx, cy) + 0.001;
          vx += (cx / cl) * g.cohesion * 0.25;
          vy += (cy / cl) * g.cohesion * 0.25;
          const al = Math.hypot(ax, ay) + 0.001;
          vx += (ax / al) * g.alignment * 0.8;
          vy += (ay / al) * g.alignment * 0.8;
          vx += sx * g.separation * 0.7;
          vy += sy * g.separation * 0.7;
        }
      }

      // 目標方向へ、旋回性能の範囲でだけ曲がる
      const target = Math.atan2(vy, vx);
      let da = target - p.a;
      while (da > Math.PI) da -= Genome.TAU;
      while (da < -Math.PI) da += Genome.TAU;
      const maxTurn = g.agility * dtF * (0.6 + 0.4 * this.activity);
      if (da > maxTurn) da = maxTurn;
      else if (da < -maxTurn) da = -maxTurn;
      p.a += da;

      p.x += Math.cos(p.a) * speed * p.spdJ * dtF;
      p.y += Math.sin(p.a) * speed * p.spdJ * dtF;

      // 画面端は反対側へワープ
      const m = 48;
      if (p.x < -m) p.x += env.w + m * 2;
      else if (p.x > env.w + m) p.x -= env.w + m * 2;
      if (p.y < -m) p.y += env.h + m * 2;
      else if (p.y > env.h + m) p.y -= env.h + m * 2;
    }
  }
}
