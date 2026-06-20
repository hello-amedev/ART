'use strict';

/*
 * 種族(同じ遺伝子を共有する光の粒子のグループ)と、近傍計算用の 3D 空間グリッド。
 *
 * 粒子は 3D 空間を「速度ベクトル(単位方向)」で動き、流れ場の方向へ
 * 少しずつしか向きを変えられない(agility 制限)。この鈍さが滑らかな軌跡を生む。
 * 粒子は漂う中心の近くから湧き、放射状に外へ流れ、外縁を越えたら中心へ戻る
 * (循環するライフサイクル)。
 *
 * 各粒子は位相(phase)を持ち、近くの同種族と弱く同期する(蛍の同期に近い)。
 * 位相は色味のごく小さなゆらぎにだけ反映し、明るさ・位置には一切触れない。
 * 「同期した面がほのかに色を揃える波」が立ち現れては崩れるのを見るための核。
 */

const PIERCE_GAIN = 0.45;          // 渦の通り抜けの基本の強さ(慣性で旋回を最大何割削るか)
const PIERCE_EVENT = 0.5;          // 渦イベント時の上乗せ(大きな渦の時だけ群れが直線貫通)
const AIM_GAIN = 1.0;              // 低従順種が渦輪へ寄る基準強度
const AIM_MAX = 0.20;              // 狙いの上限ブレンド率(流れを必ず残す。高いと魚群寄り)
const AIM_CORE = 0.55;             // 輪までの距離(rho0 比)これより内で狙いを放す=慣性で通過

class SpatialGrid {
  constructor(cellSize) {
    this.cell = cellSize;
    this.map = new Map();
  }

  clear() { this.map.clear(); }

  // 3D セル → 整数キー(ハッシュ衝突は近傍走査の実距離・種族判定で無害化)
  _key(cx, cy, cz) {
    return ((cx & 1023) << 20) ^ ((cy & 1023) << 10) ^ (cz & 1023);
  }

  insert(p, sid) {
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    const cz = Math.floor(p.z / this.cell);
    const k = this._key(cx, cy, cz);
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    p._sid = sid;
    arr.push(p);
  }

  // (x,y,z) から半径 r 内の同種族を走査。cb が true を返したら打ち切り(近傍数の上限用)
  forNeighbors(x, y, z, r, sid, self, cb) {
    const cell = this.cell;
    const c0 = Math.floor((x - r) / cell), c1 = Math.floor((x + r) / cell);
    const d0 = Math.floor((y - r) / cell), d1 = Math.floor((y + r) / cell);
    const e0 = Math.floor((z - r) / cell), e1 = Math.floor((z + r) / cell);
    const r2 = r * r;
    for (let cz = e0; cz <= e1; cz++) {
      for (let cy = d0; cy <= d1; cy++) {
        for (let cx = c0; cx <= c1; cx++) {
          const arr = this.map.get(this._key(cx, cy, cz));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const q = arr[i];
            if (q === self || q._sid !== sid) continue;
            const dx = q.x - x, dy = q.y - y, dz = q.z - z;
            const dd = dx * dx + dy * dy + dz * dz;
            if (dd < r2 && cb(q, dx, dy, dz, dd)) return;
          }
        }
      }
    }
  }
}

class Species {
  static nextId = 1;

  // opts.fadeIn     … 透明から浮かび上がる(誕生)
  // opts.parents    … 親 2 種族。粒子が親たちの現在位置(3D)から湧き出す(交叉の可視化)
  // opts.parentGens … 復元時に系譜だけ引き継ぐ([親世代, 親世代])
  // opts.nova       … 大きな突然変異の誕生(計器の ✦ 用のタイマー)
  // opts.ageSec     … 復元時に齢を引き継ぐ
  constructor(genome, count, generation, env, opts = {}) {
    this.genome = genome;
    this.generation = generation;
    this.id = Species.nextId++;
    this.opacity = opts.fadeIn ? 0 : 1;
    this.state = opts.fadeIn ? 'in' : 'alive';
    this.activity = 0.5;
    this.vigor = 0.5;
    this.nova = opts.nova ? 1 : 0;
    this.ageSec = opts.ageSec || 0;
    this.particles = [];
    this.parentGens = opts.parentGens ||
      (opts.parents ? opts.parents.map(s => s.generation) : null);

    // 固有振動数(位相の自然な進み)。種族ごとに少し違えることで、
    // 同期が「画面全体の一様な呼吸」に倒れにくくする(生物感の回避)
    this.omega = 0.55 + Genome.gauss() * 0.22;

    // 誕生の湧き出し元 = 親 2 種族の粒子の現在位置(3D)
    this.birthPool = null;
    if (opts.parents && opts.parents.length) {
      this.birthPool = [];
      for (const parent of opts.parents)
        for (const q of parent.particles) this.birthPool.push(q.x, q.y, q.z);
    }

    for (let i = 0; i < count; i++) this.particles.push(this.spawnParticle(env));
    this.birthPool = null;
  }

  // 中心付近(または親の位置)から湧く。初速はその場の流れに揃える
  spawnParticle(env) {
    let x, y, z;
    if (this.birthPool && this.birthPool.length >= 3) {
      const k = ((Math.random() * (this.birthPool.length / 3)) | 0) * 3;
      x = this.birthPool[k] + Genome.gauss() * 30;
      y = this.birthPool[k + 1] + Genome.gauss() * 30;
      z = this.birthPool[k + 2] + Genome.gauss() * 30;
    } else {
      // 空間全体(中心原点の球)に均等分布。中心ソースから一方向へ流れ去って
      // 画面が偏らないよう、最初から空間を満たす(あとは循環の流れに乗る)
      const rr = env.worldR * Math.pow(Math.random(), 1 / 3);
      const u = Math.random() * Genome.TAU, w = Math.random() * 2 - 1;
      const s = Math.sqrt(1 - w * w);
      x = Math.cos(u) * s * rr;
      y = w * rr;
      z = Math.sin(u) * s * rr;
    }
    const p = {
      x, y, z, vx: 0, vy: 0, vz: 0,
      phase: Math.random() * Genome.TAU,
      hueJ: Genome.gauss(),
      sizeJ: 0.7 + Math.random() * 0.6,
      spdJ: 0.8 + Math.random() * 0.4,
      exitOffset: Math.random(),  // 0..1。種族退場時に粒子ごとに消えるタイミングをずらすための個別の番号
      _sid: 0,
    };
    const fv = env._tmp;
    env.field.flowAt(x, y, z, fv);
    const m = Math.hypot(fv[0], fv[1], fv[2]) + 1e-6;
    p.vx = fv[0] / m; p.vy = fv[1] / m; p.vz = fv[2] / m;
    return p;
  }

  setCount(n, env) {
    while (this.particles.length < n) this.particles.push(this.spawnParticle(env));
    if (this.particles.length > n) this.particles.length = n;
  }

  // 中心原点系なので画面サイズ変更で粒子を動かす必要はない(構図は投影側で保つ)
  rescale() { /* noop */ }

  get usesFlocking() {
    const g = this.genome;
    return (g.cohesion + g.alignment + g.separation) > 0.25;
  }

  update(dt, env) {
    const g = this.genome;
    const demo = (typeof Flags !== 'undefined' && Flags.demo);
    this.ageSec += dt;

    if (this.nova > 0) {
      const novaSec = demo ? 15 : 90;
      this.nova = Math.max(0, this.nova - dt / novaSec);
    }
    const fadeInSec = demo ? 8 : 40, fadeOutSec = demo ? 8 : 40;
    if (this.state === 'in') {
      this.opacity += dt / fadeInSec;
      if (this.opacity >= 1) { this.opacity = 1; this.state = 'alive'; }
    } else if (this.state === 'out') {
      this.opacity -= dt / fadeOutSec;
      if (this.opacity < 0) this.opacity = 0;
    }

    // 退場中も活動度は時刻適合度で決める(動きを止めずに粒子ごとの α 倍率でウィンクアウトする)。
    // 「ぴたっと止まって消える」現象を避け、流れに乗ったまま静かに消えていく振る舞いにする
    const targetAct = 0.3 + 0.7 * Math.pow(Math.min(1, Genome.fitness(g, env.hour)), 0.8);
    this.activity += (targetAct - this.activity) * Math.min(1, dt * 0.5);

    const speed = 38 * g.speed * (0.45 + 0.55 * this.activity);       // px/s 相当
    const turnBase = Math.min(1, g.agility * 80 * dt * (0.6 + 0.4 * this.activity)); // 基準の旋回率
    const obey = g.flowObedience;                                     // 風への従順さ(低いほど我が道)
    // 渦が大きく高まった時だけ通り抜けを強め、クランプも緩める = 群れが目的を持って飛び込む特別イベント
    const vortex = env.field.vortex || 0;
    const pierceGain = PIERCE_GAIN + vortex * PIERCE_EVENT;
    const pierceCap = 0.5 + vortex * 0.4;
    const aimBase = (1 - obey) * AIM_GAIN;   // 低従順ほど強く渦輪へ寄る
    const aimEvent = vortex * vortex * vortex; // イベント時だけ鋭く短く立ち上げる(collapse 抑制)
    const rho0 = env.field.rho0;
    const Rmax = env.worldR;
    const fv = env._tmp;

    // 位相同期(色味だけに使う)。負荷分散のため 1 フレームに半数ずつ更新する
    const K = 1.5;
    const Rn = g.flockRadius * 1.4;
    const grid = env.grid;
    const parity = env._syncParity;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // 流れ場の方向へ滑らかに向きを変える。ただし流れが急カーブする所(dot 小)で
      // 従順さの低い種族は旋回を絞り、慣性で渦を貫いて反対側へ抜ける(渦の通り抜け)
      env.field.flowAt(p.x, p.y, p.z, fv);
      const fm = Math.hypot(fv[0], fv[1], fv[2]) + 1e-6;
      const fhx = fv[0] / fm, fhy = fv[1] / fm, fhz = fv[2] / fm;

      // 渦イベント時、低従順種族は「最寄りの渦輪上の点(fv[3..5])」へ目標を傾ける。
      // 進行方向の前方にある時だけ狙い(手前で合流)、輪の直近では狙いを放す(中心近くを
      // 慣性で通り抜け、穴へは吸い込まれない)。狙い先が点でなく輪なので一点集中しない
      let gx = fhx, gy = fhy, gz = fhz;
      if (aimEvent > 0.001 && aimBase > 0.001) {
        const tx = fv[3] - p.x, ty = fv[4] - p.y, tz = fv[5] - p.z;
        const td = Math.hypot(tx, ty, tz) + 1e-6;
        const thx = tx / td, thy = ty / td, thz = tz / td;
        const ahead = thx * p.vx + thy * p.vy + thz * p.vz; // 渦輪が前方にある時だけ正
        if (ahead > 0) {
          const core = AIM_CORE * rho0;
          const near = td < core ? td / core : 1;           // 輪の直近で狙いを 0 へ
          const aim = Math.min(AIM_MAX, aimEvent * aimBase * ahead * near);
          if (aim > 0) {
            gx = fhx + (thx - fhx) * aim;
            gy = fhy + (thy - fhy) * aim;
            gz = fhz + (thz - fhz) * aim;
            const gl = Math.hypot(gx, gy, gz) + 1e-6;
            gx /= gl; gy /= gl; gz /= gl;
          }
        }
      }

      // 貫通の旋回絞りは「流れ基準」で判定(狙い方向で判定すると合流時に追従が発散するため)
      const dot = fhx * p.vx + fhy * p.vy + fhz * p.vz;   // 流れと進行方向の一致度
      const bend = 1 - (dot * 0.5 + 0.5);                 // 0(直線)〜1(逆向き=急カーブ)
      let inertia = (1 - obey) * bend;
      if (inertia > pierceCap) inertia = pierceCap;       // 通常は穏やか、渦イベント時は緩める
      const turn = turnBase * (1 - pierceGain * inertia);
      p.vx += (gx - p.vx) * turn;                          // 狙い(またはそのまま流れ)へ追従
      p.vy += (gy - p.vy) * turn;
      p.vz += (gz - p.vz) * turn;
      const vm = Math.hypot(p.vx, p.vy, p.vz) + 1e-6;
      p.vx /= vm; p.vy /= vm; p.vz /= vm;                 // 単位方向に保つ
      p.x += p.vx * speed * p.spdJ * dt;
      p.y += p.vy * speed * p.spdJ * dt;
      p.z += p.vz * speed * p.spdJ * dt;

      // 位相: 固有振動 + 近傍同期(色だけに反映。位置・明るさには使わない)。
      // omega は密集度で 1..1.6 倍にブースト → 密集している局所ほど位相が速く進む →
      // 場所ごとに違うペースの色相波になり、画面全体で同期しない(2026-06-20 オプション撤去で常時 ON)。
      // 密集度キャッシュ p._density は parity 半数更新の間も保持(初回 undefined は 0 として扱う)
      let dphase = this.omega * (1 + (p._density || 0) * 0.6);
      if (K > 0 && (i & 1) === parity) {
        let sumSin = 0, n = 0;
        grid.forNeighbors(p.x, p.y, p.z, Rn, this.id, p, (q) => {
          sumSin += Math.sin(q.phase - p.phase); n++;
          return n >= 8;
        });
        if (n > 0) {
          dphase += K * (sumSin / n);
          p._density = n / 8;  // 0..1 にキャッシュ(次フレーム反対 parity 側でも reuse)
        } else {
          p._density = 0;
        }
      }
      p.phase += dphase * dt;
      if (p.phase > 1e6) p.phase -= 1e6;

      // 球の外へ出たら空間内へ再投入(消すのでなく循環させ続ける)。
      // まれな転生は轍・吹き溜まりの防止(頻度は低めにして循環を長く見せる)
      const pr = Math.hypot(p.x, p.y, p.z);
      if (pr > Rmax || Math.random() < dt * 0.006) {
        const np = this.spawnParticle(env);
        p.x = np.x; p.y = np.y; p.z = np.z;
        p.vx = np.vx; p.vy = np.vy; p.vz = np.vz;
      }
    }
  }
}
