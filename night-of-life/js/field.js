'use strict';

/*
 * 3D の流れ場(風の地図)。
 *
 * 流れは「循環(渦の輪 = トーラス)」を主役にする。粒子は中心から外へ
 * 噴き出す(=一方向に流れ去って単調になる)のではなく、軸のまわりを
 * 周回しつつ断面内でも循環することで、手前へ大きく流れてきて奥へ回り込み、
 * また戻ってくる。3 つの成分の重み付き合成:
 *   周回(toroidal) … 軸まわりにぐるりと回る(回り込みの主成分)
 *   断面循環(poloidal) … 渦の輪の断面内で巻く(手前で湧き上がり奥で沈む)
 *   揺らぎ(curl)   … 3D ノイズによる有機的な曲がり(溜まらない流体感)
 *
 * 配合・渦軸・渦中心は超低周波で移ろうので、流れの模様が一定周期に
 * 陥らずに巡る(『一定の法則ではなく、自然に模様が立ち現れては崩れる』)。
 * 周回成分は常に主成分として残し、ダイナミックな回り込みを絶やさない。
 */
class FlowField {
  constructor() {
    this.t = Math.random() * 100;       // ノイズの時間(起動ごとに別の風)
    this.timeScale = 0.02;              // 揺らぎ自体の変化速度
    this.spatialScale = 0.0032;         // 空間スケール(大きいほど画面内に細かい渦が増える)
    this.mixT = Math.random() * 100;    // 配合・軸・中心の超低周波位相
    this.w = 1; this.h = 1; this.d = 1;
    this.rho0 = 1;                       // 渦の輪の半径
    this.flare = 0.30;                   // 軸方向への開き(砂時計状に縦へ散らす=白飛び緩和)
    this.waist = 0.10;                   // 中央のくびれ(浅め。深いと中央芯が逆に濃くなる)
    this.vortex = 0;                     // 渦の高まり(0..1)。高い時=大きな渦のイベント中
    this.cx = 0; this.cy = 0; this.cz = 0;          // 渦中心の漂い
    this._m = { tor: 0.55, pol: 0.25, cur: 0.20 };  // 現在の配合(合計 1)
    this._ax = 0; this._ay = 1; this._az = 0;       // 渦の軸(単位)
  }

  resize(w, h, d) {
    this.w = w; this.h = h; this.d = d;
    this.rho0 = Math.min(w, h) * 0.42;
  }

  update(dt) {
    this.t += dt * this.timeScale;
    this.mixT += dt * 0.012;            // 超低周波(数分スケールで巡る)
    const m = this.mixT;
    // 渦中心はゆっくり漂う(決め絵にしない。ただし控えめ)
    this.cx = Math.cos(m * 0.27) * this.w * 0.06;
    this.cy = Math.sin(m * 0.31) * this.h * 0.05;
    this.cz = Math.sin(m * 0.23) * this.d * 0.06;
    // 配合。周回(tor)は常に主成分として高めに保ち、回り込みを絶やさない。
    // 断面循環(pol)と揺らぎ(cur)を超低周波で上下させて模様を移ろわせる
    const tor = 0.38 + 0.18 * (0.5 + 0.5 * Math.sin(m * 0.50));
    const pol = 0.20 + 0.28 * (0.5 + 0.5 * Math.sin(m * 0.37 + 2.1));
    const cur = 0.24 + 0.34 * (0.5 + 0.5 * Math.sin(m * 0.29 + 4.0));
    const s = tor + pol + cur;
    this._m.tor = tor / s; this._m.pol = pol / s; this._m.cur = cur / s;
    // 渦の軸(ゆっくり傾く。おおむね縦軸まわりで、傾きは控えめ)
    const a = m * 0.33;
    const ax = Math.sin(a) * 0.4, ay = 1, az = Math.cos(a) * 0.4;
    const am = Math.hypot(ax, ay, az);
    this._ax = ax / am; this._ay = ay / am; this._az = az / am;
    // 渦イベントの強度。2 つの遅い波(周期およそ 5.5 分と 8 分)が高めに揃った時だけ
    // 立ち上がる = 不規則に、数分眺めるうち時々来る特別な一瞬。普段は 0(穏やか)。
    // この時だけ通り抜けの群れが直線的に渦へ飛び込む(規則的な明滅にしないため2波の重ね)
    const e = 0.55 * Math.sin(m * 1.6) + 0.45 * Math.sin(m * 1.05 + 2.3);
    const v = (e - 0.45) / 0.5;
    this.vortex = v < 0 ? 0 : (v > 1 ? 1 : v);
    if (typeof Flags !== 'undefined' && Flags.event) this.vortex = 1; // ?event で常時イベント(確認用)
  }

  // (x,y,z) の流れベクトル(非正規化)を out[0..2] に書く
  flowAt(x, y, z, out) {
    const px = x - this.cx, py = y - this.cy, pz = z - this.cz;
    const ax = this._ax, ay = this._ay, az = this._az;

    // 周回(toroidal) = axis × p(軸まわりの接線)
    let tx = ay * pz - az * py;
    let ty = az * px - ax * pz;
    let tz = ax * py - ay * px;
    const tl = Math.hypot(tx, ty, tz) + 1e-6;
    tx /= tl; ty /= tl; tz /= tl;

    // 断面循環(poloidal): 軸方向成分 pd と、軸に垂直な径 r を取り、
    // 渦の輪の中心線(半径 rho0)のまわりを断面内で回す
    const pd = px * ax + py * ay + pz * az;          // 軸方向座標
    const rxv = px - pd * ax, ryv = py - pd * ay, rzv = pz - pd * az;
    const rlen = Math.hypot(rxv, ryv, rzv) + 1e-6;
    const erx = rxv / rlen, ery = ryv / rlen, erz = rzv / rlen; // 径方向単位
    // 軸方向の位置で渦輪の半径を変える(砂時計状に縦へ開き、密度を z 方向へ散らす)
    const az01 = pd / (this.d * 0.5);
    const rhoEff = this.rho0 * (1 + this.flare * (az01 * az01 - this.waist));
    const u = rlen - rhoEff;                          // 中心線からの径オフセット
    // 断面内の円運動 (径, 軸) = (-pd, u) を正規化し、径方向 e_r と軸 a に展開
    let cr = -pd, ca = u;
    const cl = Math.hypot(cr, ca) + 1e-6;
    cr /= cl; ca /= cl;
    const polx = erx * cr + ax * ca;
    const poly = ery * cr + ay * ca;
    const polz = erz * cr + az * ca;

    // 揺らぎ(3D ノイズ。divergence-free でなくてよい — 有機的な曲がりが目的)
    const s = this.spatialScale, t = this.t;
    const nx = Noise.fbm3(x * s + 11.3, y * s, z * s + t, 1) - 0.5;
    const ny = Noise.fbm3(x * s, y * s + 27.7, z * s + t, 1) - 0.5;
    const nz = Noise.fbm3(x * s, y * s, z * s + t + 41.1, 1) - 0.5;

    const m = this._m;
    out[0] = m.tor * tx + m.pol * polx + m.cur * nx * 2.8;
    out[1] = m.tor * ty + m.pol * poly + m.cur * ny * 2.8;
    out[2] = m.tor * tz + m.pol * polz + m.cur * nz * 2.8;
    // 渦の通り抜け用: この点に最も近い「渦輪上の点」(絶対座標)を out[3..5] に公開。
    // 穴(軸の中心)でなく渦そのものの輪を狙わせ、合流を「渦への飛び込み」に見せる
    out[3] = this.cx + erx * rhoEff + pd * ax;
    out[4] = this.cy + ery * rhoEff + pd * ay;
    out[5] = this.cz + erz * rhoEff + pd * az;
  }
}
