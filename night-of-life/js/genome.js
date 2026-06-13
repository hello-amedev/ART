'use strict';

/*
 * 遺伝子の定義と遺伝的アルゴリズムの基本操作。
 *
 * 各遺伝子は min..max の範囲に必ずクランプされる。
 * この範囲が「この世界の物理法則」= どんな進化をしても
 * 美しさの底が抜けないことを保証する制約になっている。
 */
const Genome = (() => {

  const TAU = Math.PI * 2;

  const GENES = {
    // --- 色彩 ---
    hueOffset:     { min: -110,  max: 110 },          // 基調色相(時刻で決まる)からのずれ(度)
    hueSpread:     { min: 6,     max: 48 },           // 種族内の色相のばらつき幅
    satBase:       { min: 0.55,  max: 0.95 },         // 彩度
    lumBase:       { min: 0.55,  max: 0.78 },         // 明度(暗すぎる筆致は「汚れた轍」に見える)
    glowSize:      { min: 0.7,   max: 1.7 },          // 光の太さ係数
    strokeLen:     { min: 7,     max: 22 },           // 光の線の長さ(px)。短いと「点=頭」に見えて生物感が出る
    // --- 動き ---
    speed:         { min: 0.3,   max: 1.6 },          // 巡航速度係数
    flowObedience: { min: 0.3,   max: 1.0 },          // 風への従順さ(低いと我が道を行く)
    agility:       { min: 0.008, max: 0.045 },        // 旋回の機敏さ(rad/step)
    // --- 群れ(ボイド)---
    cohesion:      { min: 0,     max: 1 },            // 仲間に寄る
    alignment:     { min: 0,     max: 1 },            // 仲間と向きを揃える
    separation:    { min: 0.15,  max: 1 },            // 仲間と距離を取る(下限は密集白飛びの防止)
    flockRadius:   { min: 26,    max: 90 },           // 仲間と認識する距離(px)
    // --- 時間帯 ---
    dayPhase:      { min: 0,     max: 24, circular: true }, // 活動ピーク時刻
    phaseWidth:    { min: 2.5,   max: 7 },            // 活動時間の幅(時間)
  };

  const KEYS = Object.keys(GENES);

  // -1..1 の擬似ガウス(三角分布で十分)
  function gauss() {
    return (Math.random() + Math.random() + Math.random()) * (2 / 3) - 1;
  }

  function circularDist(a, b, period) {
    const d = Math.abs(a - b) % period;
    return Math.min(d, period - d);
  }

  function clampGene(key, v) {
    const def = GENES[key];
    if (def.circular) {
      const range = def.max - def.min;
      return ((v - def.min) % range + range) % range + def.min;
    }
    return Math.min(def.max, Math.max(def.min, v));
  }

  // 完全ランダムな遺伝子。biasHour を渡すと活動時間帯をその周辺に寄せる
  function random(biasHour) {
    const g = {};
    for (const key of KEYS) {
      const def = GENES[key];
      g[key] = def.min + Math.random() * (def.max - def.min);
    }
    if (biasHour !== undefined) {
      g.dayPhase = clampGene('dayPhase', biasHour + gauss() * 2.5);
    }
    return g;
  }

  // 交叉: 遺伝子ごとに 親A / 親B / ブレンド のいずれかを受け継ぐ
  function crossover(a, b) {
    const child = {};
    for (const key of KEYS) {
      const r = Math.random();
      if (r < 0.4) {
        child[key] = a[key];
      } else if (r < 0.8) {
        child[key] = b[key];
      } else if (GENES[key].circular) {
        // 円環値(時刻)は短い弧の側で混ぜる
        const period = GENES[key].max - GENES[key].min;
        let diff = b[key] - a[key];
        if (diff > period / 2) diff -= period;
        if (diff < -period / 2) diff += period;
        child[key] = clampGene(key, a[key] + diff * Math.random());
      } else {
        const t = Math.random();
        child[key] = a[key] * (1 - t) + b[key] * t;
      }
    }
    return child;
  }

  // 遺伝子の突然変異。ときおり「大きな突然変異」が起こり、親とまるで違う新しい系統が生まれる
  // (計器に ✦ が灯る一族)。forceBig は動作確認用(設定の「突然変異を 1 回起こす」ボタン)
  function mutate(g, forceBig) {
    const out = Object.assign({}, g);
    const big = forceBig || Math.random() < 0.15;
    const rate = big ? 0.65 : 0.18;
    for (const key of KEYS) {
      if (Math.random() >= rate) continue;
      const def = GENES[key];
      const range = def.max - def.min;
      const amount = big ? range * (0.2 + Math.random() * 0.45) : range * 0.07;
      out[key] = clampGene(key, out[key] + gauss() * amount);
    }
    // 活動時間帯は必ず少し揺らす(時間帯ニッチの探索を絶やさないため)
    out.dayPhase = clampGene('dayPhase', out.dayPhase + gauss() * 1.2);
    out._bigMutation = big;
    return out;
  }

  // 大きな突然変異の「色の飛躍」: 親 2 種の色相ずれの重心と反対側、範囲の端寄りへ飛ばす。
  // 大きな突然変異が「見たことのない色の一族」として一目で分かるようにするための専用処理。
  // 通常の交叉・突然変異だけでは色が親の中間に寄り、変異が視覚的に埋もれてしまう
  function leapHue(a, b) {
    const def = GENES.hueOffset;
    const mid = (a + b) / 2;
    const dir = mid >= 0 ? -1 : 1;                       // 親たちと反対の色域へ
    const target = dir * def.max * (0.7 + Math.random() * 0.3); // 端から 70〜100%
    return clampGene('hueOffset', target + gauss() * 10);
  }

  // 適応度 = 現在時刻と活動ピーク時刻の近さ(円環ガウス)。
  // 活動時間が狭い種族ほどピークが高い(スペシャリスト)、
  // 広い種族は常にそこそこ(ジェネラリスト)というトレードオフを入れる。
  // これがないと全種族が「幅最大のジェネラリスト」に収束してしまう
  function fitness(g, hour) {
    const d = circularDist(hour, g.dayPhase, 24);
    const s = g.phaseWidth;
    const peak = Math.pow(4 / s, 0.45);
    return Math.exp(-(d * d) / (2 * s * s)) * peak;
  }

  return { GENES, KEYS, random, crossover, mutate, leapHue, fitness, circularDist, gauss, clampGene, TAU };
})();
