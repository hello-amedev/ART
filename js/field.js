'use strict';

/*
 * フローフィールド(風の地図)。
 * 画面をグリッドに区切り、各セルに「風の向き」を持たせる。
 * ノイズの 3 次元目に時間を入れることで、風自体もゆっくり生きて動く。
 *
 * 負荷対策: 全セルを毎フレーム計算せず、1 フレームに 1/4 ずつ
 * ローリング更新する(風はゆっくり変わるのでこれで十分滑らか)。
 */
class FlowField {
  constructor() {
    this.cell = 36;              // セルの一辺(px)
    this.cols = 0;
    this.rows = 0;
    this.angles = new Float32Array(0);
    this.t = Math.random() * 100; // 風の時間(起動ごとに別の風)
    this.spatialScale = 0.0011;   // 空間スケール(小さいほど大きな渦)
    this.timeScale = 0.022;       // 風の変化速度(遅すぎると粒子が同じ渦に捕まり跡が濃くなる)
    this.updateSlice = 0;
  }

  resize(w, h) {
    // 画面の少し外側まで風を持っておく(端での滞留・不自然な流れを防ぐ)
    this.off = 64;
    this.cols = Math.ceil((w + this.off * 2) / this.cell) + 1;
    this.rows = Math.ceil((h + this.off * 2) / this.cell) + 1;
    this.angles = new Float32Array(this.cols * this.rows);
    this.fillAll();
  }

  fillAll() {
    for (let r = 0; r < this.rows; r++) this.fillRow(r);
  }

  fillRow(r) {
    const s = this.spatialScale;
    const eps = this.cell * s;
    const y = (r * this.cell - this.off) * s;
    for (let c = 0; c < this.cols; c++) {
      const x = (c * this.cell - this.off) * s;
      const n0 = Noise.fbm3(x, y, this.t, 3);
      const nx = Noise.fbm3(x + eps, y, this.t, 3);
      const ny = Noise.fbm3(x, y + eps, this.t, 3);
      // カールノイズ(勾配に垂直 = 流体的で溜まらない)を主成分に、
      // ノイズ値を直接角度にした流れ(束を作る)を少し混ぜる。
      // カールだけだと均一でのっぺり、直接だけだと吹き溜まりで白飛びする。
      const ca = Math.atan2(-(nx - n0), ny - n0);
      const da = n0 * Math.PI * 4;
      const bx = Math.cos(ca) * 0.8 + Math.cos(da) * 0.2;
      const by = Math.sin(ca) * 0.8 + Math.sin(da) * 0.2;
      this.angles[r * this.cols + c] = Math.atan2(by, bx);
    }
  }

  update(dt) {
    this.t += dt * this.timeScale;
    // 1 フレームに全行の 1/4 だけ更新
    const slice = Math.ceil(this.rows / 4);
    const start = this.updateSlice * slice;
    const end = Math.min(start + slice, this.rows);
    for (let r = start; r < end; r++) this.fillRow(r);
    this.updateSlice = (this.updateSlice + 1) % 4;
  }

  angleAt(x, y) {
    let c = ((x + this.off) / this.cell) | 0;
    let r = ((y + this.off) / this.cell) | 0;
    if (c < 0) c = 0; else if (c >= this.cols) c = this.cols - 1;
    if (r < 0) r = 0; else if (r >= this.rows) r = this.rows - 1;
    return this.angles[r * this.cols + c];
  }
}
