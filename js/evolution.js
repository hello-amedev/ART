'use strict';

/*
 * 進化の管理。
 *
 * 一定間隔ごとに世代交代イベントが起こる:
 *   1. 現在時刻に最も合わない種族が退場(フェードアウト)
 *   2. 時刻に合っている種族ほど親に選ばれやすい(ルーレット選択)
 *   3. 親 2 種族の交叉 + 突然変異で新種族が誕生(フェードイン)
 *
 * 選択圧は「時刻」。1 日の中で基準そのものが回り続けるので、
 * 進化はどこにも収束せず、永遠に移ろい続ける。
 *
 * 進化の状態は localStorage に保存され、再起動後も続きから育つ。
 */

const TARGET_SPECIES = 5;

class Evolution {
  constructor() {
    this.species = [];
    this.generation = 1;
    this.genTimer = 0;
    this.storageKey = 'art-evolution-v2'; // 遺伝子構成が変わったら番号を上げる(旧データを無効化)
    this.demoStartHour = Math.random() * 24;
    this.simOffsetMs = 0; // App.simulate() 用の仮想経過時間(デモモードのみ作用)
  }

  // 仮想時刻(0..24)。デモモードでは 1 日が約 3 分で回る
  hour(nowMs) {
    if (Flags.demo) {
      return (this.demoStartHour + ((nowMs + this.simOffsetMs) / 1000) * (24 / 180)) % 24;
    }
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  perSpeciesCount() {
    return Math.max(40, Math.round(Settings.particleCount / TARGET_SPECIES));
  }

  init(env) {
    if (!Flags.demo && this.load(env)) return;
    this.firstSpawn(env);
  }

  firstSpawn(env) {
    this.species = [];
    this.generation = 1;
    const hour = env.hour;
    for (let i = 0; i < TARGET_SPECIES; i++) {
      // 現在時刻寄りの 2 種 + 1 日に散らした 3 種で始める
      const bias = i < 2 ? hour : (hour + (i - 1) * (24 / TARGET_SPECIES)) % 24;
      const g = Genome.random(bias);
      // 初期世代は色相のずれを意図的に散らし、最初から多彩にする
      g.hueOffset = Genome.clampGene(
        'hueOffset',
        -80 + (i / (TARGET_SPECIES - 1)) * 160 + Genome.gauss() * 15
      );
      this.species.push(new Species(g, this.perSpeciesCount(), this.generation, env));
    }
    this.save();
  }

  tick(dt, env) {
    // 消えきった種族を取り除く
    this.species = this.species.filter(s => !(s.state === 'out' && s.opacity <= 0));

    const interval = Flags.demo ? 14 : Settings.evolutionMinutes * 60;
    this.genTimer += dt;
    if (this.genTimer >= interval) {
      this.genTimer = 0;
      this.step(env);
    }

    // 想定より減っていたら新規参入で補う
    const aliveCount = this.species.reduce((n, s) => n + (s.state !== 'out' ? 1 : 0), 0);
    if (aliveCount < TARGET_SPECIES) {
      const g = Genome.random(env.hour);
      this.species.push(new Species(g, this.perSpeciesCount(), this.generation, env, { fadeIn: true }));
    }
  }

  // 世代交代イベント
  step(env) {
    const alive = this.species.filter(s => s.state !== 'out');
    if (alive.length < 2) return;
    // 選択は「少し先の時刻」を基準にする。
    // 壁紙は常に 1.5 時間先に備えて進化し、時間の波を追いかけ続ける
    const hour = (env.hour + 1.5) % 24;

    const scored = alive.map(s => ({ s, f: Genome.fitness(s.genome, hour) }));
    // ニッチ分化(fitness sharing): 活動ピークが他種族と被るほど割引。
    // これがないと全種族が現在時刻型に収束して多様性が死ぬ
    for (const e of scored) {
      let crowd = 0;
      for (const o of scored) {
        if (o === e) continue;
        const d = Genome.circularDist(e.s.genome.dayPhase, o.s.genome.dayPhase, 24);
        crowd += Math.max(0, 1 - d / 6);
      }
      e.f = e.f / (1 + crowd * 0.6);
    }
    scored.sort((a, b) => a.f - b.f);

    // 最も時刻に合わない種族が静かに退場
    scored[0].s.state = 'out';

    // 残りから適応度比例で親を 2 種族選ぶ(+0.05 は全滅回避の下駄)
    const pool = scored.slice(1);
    const pickParent = () => {
      let total = 0;
      for (const e of pool) total += e.f + 0.05;
      let r = Math.random() * total;
      for (const e of pool) {
        r -= e.f + 0.05;
        if (r <= 0) return e.s;
      }
      return pool[pool.length - 1].s;
    };
    const pa = pickParent();
    let pb = pickParent();
    let guard = 8;
    while (pb === pa && pool.length > 1 && guard-- > 0) pb = pickParent();

    const childGenome = Genome.mutate(Genome.crossover(pa.genome, pb.genome));
    this.generation++;
    // 子の粒子は親 2 種族の粒子の現在位置から湧き出す(交叉が画面に見える)
    this.species.push(new Species(childGenome, this.perSpeciesCount(), this.generation, env, {
      fadeIn: true,
      parents: [pa, pb],
    }));
    this.save();
  }

  save() {
    if (Flags.demo) return; // 早回しデモの進化で本物の保存を上書きしない
    try {
      const data = {
        v: 2,
        generation: this.generation,
        genomes: this.species
          .filter(s => s.state !== 'out')
          .map(s => ({ g: s.genome, gen: s.generation, p: s.parentGens })),
        savedAt: Date.now(),
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      // 保存できない環境(プライベートモード等)でも壁紙自体は動かす
    }
  }

  load(env) {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.v !== 2 || !Array.isArray(data.genomes) || data.genomes.length < 2) return false;
      this.generation = data.generation || 1;
      this.species = data.genomes.map(e => {
        const genome = {};
        for (const key of Genome.KEYS) {
          const v = e.g ? e.g[key] : undefined;
          genome[key] = Genome.clampGene(key, typeof v === 'number' ? v : Genome.GENES[key].min);
        }
        return new Species(genome, this.perSpeciesCount(), e.gen || 1, env, {
          parentGens: Array.isArray(e.p) ? e.p : null,
        });
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  reset(env) {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) { /* noop */ }
    this.firstSpawn(env);
  }
}
