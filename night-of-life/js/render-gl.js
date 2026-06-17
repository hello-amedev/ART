'use strict';

/*
 * WebGL2 レンダラー(既定の描画経路)。
 *
 * 既定で tryCreateRenderGL() が走り、成功時は main.js がこのレンダラーに描画を委ねる。
 * ?gl=0 を付けると明示的に Canvas 2D 経路へ opt-out できる。WebGL2 未対応・初期化失敗時は
 * 自動で Canvas 2D にフォールバックする。物理(species/genome/evolution/field)・
 * OBSERVATORIUM・lively/webui 設定は触らない。
 *
 * 描画原則: 投影式・色式・大気遠近・背景フェード・加算合成は 2D 版と同式を維持しつつ、
 * HDR FBO (RGBA16F) を標準採用して 8-bit 量子化由来の残光固着を回避。ブルーム・被写界深度は
 * Step 2-2 以降で積む。
 */

(() => {
  const TAU = Math.PI * 2;

  // --- 時刻 → 色のテーブルと変換(main.js と同値の鏡像。Step2-2 でブルーム導入時に
  //     共通化を検討するが、今は依存ゼロを優先して各 path にコピーで保つ) ---
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

  function daylightFactor(hour) {
    return 0.5 - 0.5 * Math.cos(((hour - 4) / 24) * TAU);
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

  // --- シェーダー(GLSL ES 3.00) ---

  const PARTICLE_VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in float a_corner;     // 0..3 を 4 頂点に割り当て
layout(location = 1) in vec3 a_pos;         // 粒子のワールド位置
layout(location = 2) in vec3 a_vel;         // 単位方向
layout(location = 3) in vec4 a_color;       // CPU で確定させた RGBA(大気遠近適用済み)
layout(location = 4) in float a_halfLen;    // strokeLen * sizeJ * 0.5
layout(location = 5) in float a_lineBase;   // glowSize * 0.55 * sizeJ

uniform vec2 u_resolution;
uniform float u_camDist;
uniform float u_focal;
uniform float u_caz;
uniform float u_saz;
uniform float u_cel;
uniform float u_sel;
uniform float u_refSc;

out vec4 v_color;
out float v_perpNorm;   // -1 .. +1(クワッド内で perp 方向の正規化位置。エッジ AA に使う)
out float v_halfW;      // 線幅の半分(px)。インスタンス間で一定だがインスタンス内では varying として渡す

// ワールド点 → (sx, sy, sc, vz)。main.js の pr() と同式
vec4 project(vec3 p) {
  float x1 =  p.x * u_caz + p.z * u_saz;
  float z1 = -p.x * u_saz + p.z * u_caz;
  float y2 = p.y * u_cel - z1 * u_sel;
  float z2 = p.y * u_sel + z1 * u_cel;
  float vz = z2 + u_camDist;
  float sc = u_focal / max(vz, 1.0);
  float sx = u_resolution.x * 0.5 + x1 * sc;
  float sy = u_resolution.y * 0.5 - y2 * sc;
  return vec4(sx, sy, sc, vz);
}

void main() {
  vec3 off = a_vel * a_halfLen;
  vec4 A = project(a_pos - off);
  vec4 B = project(a_pos + off);

  // どちらかの端点がカメラ後方ならクリップ外へ退避
  if (A.w < 1.0 || B.w < 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_color = vec4(0.0);
    v_perpNorm = 0.0;
    v_halfW = 0.0;
    return;
  }

  // 画面上の線方向と垂直方向(両端で同一の perp を使うことで twist を防ぐ)
  vec2 along = B.xy - A.xy;
  float alen = length(along);
  vec2 dir = (alen > 1e-4) ? (along / alen) : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);

  // 4 頂点を A-/A+/B-/B+ に割り当て(TRIANGLE_STRIP)
  bool isA = (a_corner < 1.5);
  vec2 endpt = isA ? A.xy : B.xy;
  float sgn = (a_corner == 0.0 || a_corner == 2.0) ? -1.0 : 1.0;

  // 線幅は 2D 版の max(1.0, lineBase * scc/refSc) と同式(1px 未満はピクセル境界で
  // AA が効かずジャギーが出るため、表現の細さより輪郭の滑らかさを優先)
  float scc = 0.5 * (A.z + B.z);
  float halfW = 0.5 * max(1.0, a_lineBase * (scc / u_refSc));

  vec2 posPx = endpt + perp * sgn * halfW;

  // ピクセル → クリップ空間(Y は反転)
  vec2 clip = vec2(
    (posPx.x / u_resolution.x) * 2.0 - 1.0,
    1.0 - (posPx.y / u_resolution.y) * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
  v_perpNorm = sgn;     // -1 (corner 0,2) / +1 (corner 1,3) → クワッド内で -1..+1 に補間
  v_halfW = halfW;
}`;

  const PARTICLE_FRAG_SRC = `#version 300 es
precision mediump float;
in vec4 v_color;
in float v_perpNorm;
in float v_halfW;
out vec4 outColor;

void main() {
  // 距離ベース AA: 線の中心からの距離(px)が v_halfW を超える手前 1px で滑らかにフェード。
  // HDR FBO 描画では MSAA が効かないので、自前で輪郭をぼかしてジャギーを抑える
  float dist = abs(v_perpNorm) * v_halfW;
  float aa = 1.0 - smoothstep(max(0.0, v_halfW - 1.0), v_halfW, dist);
  // 加算合成 (blendFunc(ONE, ONE)) で 2D 版の hsla * 'lighter' と同等の効果を出すため、
  // RGB を α で前乗算して吐く(dst.rgb += rgb * alpha * aa が成立する)
  float a = v_color.a * aa;
  outColor = vec4(v_color.rgb * a, a);
}`;

  const BG_VERT_SRC = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

  const BG_FRAG_SRC = `#version 300 es
precision mediump float;
uniform vec4 u_bgColor;
out vec4 outColor;
void main() {
  outColor = u_bgColor;
}`;

  // HDR FBO → screen の最終転写(blit)。FBO の RGBA16F を 8-bit screen に貼り直す。
  // ここで初めて 1 回だけ 8-bit 量子化が走るので、累積残光が固着しない
  const BLIT_VERT_SRC = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

  const BLIT_FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_src;
out vec4 outColor;
void main() {
  // FBO の RGB をそのまま出力。8-bit screen への書き出しで自動的に [0,1] にクランプ
  outColor = vec4(texture(u_src, v_uv).rgb, 1.0);
}`;

  function compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('[render-gl] shader compile failed: ' + log);
    }
    return sh;
  }

  function linkProgram(gl, vsSrc, fsSrc) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      throw new Error('[render-gl] program link failed: ' + log);
    }
    return prog;
  }

  class RenderGL {
    constructor(canvas, gl) {
      this.canvas = canvas;
      this.gl = gl;
      this.MAX = 30000;      // 6000 粒子 × 5 種族 + 多少の余裕(将来 25000 化に向けて確保)
      this.STRIDE = 12;      // floats per instance: pos3 + vel3 + rgba + halfLen + lineBase
      this.instanceBuf = new Float32Array(this.MAX * this.STRIDE);
      this.instanceCount = 0;

      // HDR FBO 状態(EXT_color_buffer_half_float が取れた時だけ有効。取れなければ 8-bit 直描画)
      this.useHDR = false;
      this.fbo = null;
      this.fboTex = null;
      this.fboW = 0;
      this.fboH = 0;
      this.programBlit = null;
      this.uSrcTex = null;
    }

    init() {
      const gl = this.gl;

      // パーティクル描画プログラム
      this.programParticle = linkProgram(gl, PARTICLE_VERT_SRC, PARTICLE_FRAG_SRC);
      this.uRes     = gl.getUniformLocation(this.programParticle, 'u_resolution');
      this.uCamDist = gl.getUniformLocation(this.programParticle, 'u_camDist');
      this.uFocal   = gl.getUniformLocation(this.programParticle, 'u_focal');
      this.uCaz     = gl.getUniformLocation(this.programParticle, 'u_caz');
      this.uSaz     = gl.getUniformLocation(this.programParticle, 'u_saz');
      this.uCel     = gl.getUniformLocation(this.programParticle, 'u_cel');
      this.uSel     = gl.getUniformLocation(this.programParticle, 'u_sel');
      this.uRefSc   = gl.getUniformLocation(this.programParticle, 'u_refSc');

      // 背景フェードプログラム
      this.programBg = linkProgram(gl, BG_VERT_SRC, BG_FRAG_SRC);
      this.uBgColor  = gl.getUniformLocation(this.programBg, 'u_bgColor');

      // 静的: 4 頂点のコーナーインデックス
      this.vboCorner = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vboCorner);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 2, 3]), gl.STATIC_DRAW);

      // 動的: パーティクルインスタンスバッファ
      this.vboInstance = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vboInstance);
      gl.bufferData(gl.ARRAY_BUFFER, this.MAX * this.STRIDE * 4, gl.DYNAMIC_DRAW);

      // VAO(パーティクル): a_corner は per-vertex、その他は per-instance
      this.vaoParticle = gl.createVertexArray();
      gl.bindVertexArray(this.vaoParticle);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vboCorner);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 4, 0);
      gl.vertexAttribDivisor(0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vboInstance);
      const stride = this.STRIDE * 4;
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 12);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 24);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 40);
      gl.vertexAttribDivisor(4, 1);
      gl.enableVertexAttribArray(5);
      gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 44);
      gl.vertexAttribDivisor(5, 1);
      gl.bindVertexArray(null);

      // 静的: 背景用フルスクリーンクワッド(クリップ空間)
      this.vboBg = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vboBg);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,   1, -1,   -1, 1,   1, 1,
      ]), gl.STATIC_DRAW);

      // VAO(背景)。vboBg は直前の bufferData でバインド済みだが、
      // 「ARRAY_BUFFER は VAO バインドで変わらない」前提に依存しない明示バインドで意図を残す
      this.vaoBg = gl.createVertexArray();
      gl.bindVertexArray(this.vaoBg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vboBg);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.bindVertexArray(null);

      // 基本ステート: 深度・カル無し、加算合成準備
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);

      // HDR FBO(RGBA16F)を試す。取れれば描画は FBO に向けて行い、最終フレームだけ
      // 画面へ blit する。これで 8-bit 量子化由来の残光固着を回避できる。
      // 拡張未対応なら useHDR=false のまま 8-bit 直描画(現状の挙動と同じ)
      const halfFloatExt = gl.getExtension('EXT_color_buffer_half_float');
      if (halfFloatExt) {
        this.programBlit = linkProgram(gl, BLIT_VERT_SRC, BLIT_FRAG_SRC);
        this.uSrcTex = gl.getUniformLocation(this.programBlit, 'u_src');
        this.useHDR = true;
        console.info('[render-gl] HDR FBO (RGBA16F) mode enabled');
      } else {
        console.warn('[render-gl] EXT_color_buffer_half_float unavailable; 8-bit direct path (residue may accumulate)');
      }

      return true;
    }

    resize(physW, physH) {
      this.gl.viewport(0, 0, physW, physH);
      if (this.useHDR) this._createFBO(physW, physH);
    }

    // FBO テクスチャ + framebuffer を作り直す(canvas サイズが変わるたびに必要)
    _createFBO(physW, physH) {
      const gl = this.gl;
      if (this.fboTex) gl.deleteTexture(this.fboTex);
      if (this.fbo) gl.deleteFramebuffer(this.fbo);

      this.fboTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
      // 内部 RGBA16F(半精度浮動小数)で確保。NEAREST フィルタ = 1:1 blit なので拡大縮小なし
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, physW, physH, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);

      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn('[render-gl] FBO incomplete (0x' + status.toString(16) + '); falling back to 8-bit direct path');
        gl.deleteTexture(this.fboTex);
        gl.deleteFramebuffer(this.fbo);
        this.fboTex = null;
        this.fbo = null;
        this.useHDR = false;
        return;
      }
      this.fboW = physW;
      this.fboH = physH;
    }

    // 起動時・リセット時: 画面全体を当時刻の背景色で塗る
    paintFull(hour) {
      const gl = this.gl;
      const c = bgRgb(hour);
      const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
      if (this.useHDR && this.fbo) {
        // FBO 側も初期化(次フレーム以降の背景フェードの起点になる)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.fboW, this.fboH);
        gl.clearColor(r, g, b, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      // 画面側も同じ色で塗る(blit 前の真っ黒を見せないため)
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(r, g, b, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    draw(env, evolution, Settings) {
      const gl = this.gl;
      const hour = env.hour;

      // HDR モードでは FBO に向けて描く(8-bit 量子化は最後の blit 時の 1 回だけ)
      if (this.useHDR && this.fbo) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.fboW, this.fboH);
      }

      // 1) 背景フェード。HDR モードでは指数減衰が完遂してしまうので fadeA を緩めて
      //    軌跡の余韻を残す。8-bit 直描画モードは量子化対策として 2D 版と同じ係数を維持
      const c = bgRgb(hour);
      const fadeA = this.useHDR
        ? 0.018 + 0.08 * Math.pow(1 - Settings.trailLength, 2)
        : 0.03 + 0.1 * Math.pow(1 - Settings.trailLength, 2);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.programBg);
      gl.uniform4f(this.uBgColor, c[0] / 255, c[1] / 255, c[2] / 255, fadeA);
      gl.bindVertexArray(this.vaoBg);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);

      // 2) パーティクル加算合成
      this._packParticles(env, evolution, Settings);
      if (this.instanceCount > 0) {
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(this.programParticle);

        // フレーム共通 uniform
        const cam = env.cam;
        gl.uniform2f(this.uRes, env.vw, env.vh);
        gl.uniform1f(this.uCamDist, env.camDist);
        gl.uniform1f(this.uFocal, env.focal);
        gl.uniform1f(this.uCaz, Math.cos(cam.az));
        gl.uniform1f(this.uSaz, Math.sin(cam.az));
        gl.uniform1f(this.uCel, Math.cos(cam.el));
        gl.uniform1f(this.uSel, Math.sin(cam.el));
        gl.uniform1f(this.uRefSc, env.focal / env.camDist);

        // インスタンスデータを上書き(orphan + サブアレイで送る)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboInstance);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          this.instanceBuf.subarray(0, this.instanceCount * this.STRIDE),
          gl.DYNAMIC_DRAW
        );

        gl.bindVertexArray(this.vaoParticle);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
        gl.bindVertexArray(null);
      }

      // 3) HDR: FBO の内容を画面に転写(ここで初めて 8-bit 量子化が走るので残光は累積しない)
      if (this.useHDR && this.fbo) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.disable(gl.BLEND);                       // blit はソースをそのまま貼る
        gl.useProgram(this.programBlit);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
        gl.uniform1i(this.uSrcTex, 0);
        gl.bindVertexArray(this.vaoBg);             // フルスクリーンクワッドを使い回す
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
        gl.enable(gl.BLEND);                        // 次フレームの合成のために復帰
      }
    }

    _packParticles(env, evolution, Settings) {
      const buf = this.instanceBuf;
      const STRIDE = this.STRIDE;
      const MAX = this.MAX;

      const hour = env.hour;
      const hue0 = baseHue(hour);
      const satMod = 0.92 + daylightFactor(hour) * 0.08;
      const bright = Settings.brightness;
      const colorSync = Settings.colorSync !== false;

      // 中心点投影で dn を出す。2D 版は (A.vz + B.vz) / 2 だが、vz は (x,y,z) の
      // アフィン線形関数(回転 → 平行移動)なので f((A+B)/2) = (f(A)+f(B))/2 が
      // 数学的に成立 = 粒子中心の vz と endpoint 中点の vz は厳密に同値。色式は 2D 版と完全に同一
      const cam = env.cam;
      const caz = Math.cos(cam.az), saz = Math.sin(cam.az);
      const cel = Math.cos(cam.el), sel = Math.sin(cam.el);
      const CD = env.camDist;
      const span = (CD + env.worldR - 1) || 1;

      let idx = 0;
      const species = evolution.species;
      for (let si = 0; si < species.length; si++) {
        const sp = species[si];
        if (sp.opacity <= 0.005) continue;
        const g = sp.genome;
        // 種族包絡を α 基本値から外し、粒子ループ内で状態別の per-particle pEnv を掛ける
        const baseRaw = 0.15 * (0.35 + 0.65 * sp.activity) * bright;
        const fadeProgress = sp.state === 'out' ? (1 - sp.opacity) : 0;
        const isOut = sp.state === 'out';
        const isIn  = sp.state === 'in';
        const sat0 = Math.min(96, g.satBase * 100 * satMod);
        const lum0 = Math.min(78, g.lumBase * 100 + 6);
        const lineBase = g.glowSize * 0.55;

        const particles = sp.particles;
        for (let pi = 0; pi < particles.length; pi++) {
          if (idx >= MAX) { this.instanceCount = idx; return; }
          const p = particles[pi];

          // 中心点の vz から dn を出す
          const z1c = -p.x * saz + p.z * caz;
          const z2c = p.y * sel + z1c * cel;
          const vzc = z2c + CD;
          let dn = (vzc - 1) / span;
          if (dn < 0) dn = 0; else if (dn > 1) dn = 1;

          // 色合成(2D 版と同式。整数化のタイミングも一致させる)
          let hue = hue0 + g.hueOffset + p.hueJ * g.hueSpread;
          if (colorSync) hue += Math.sin(p.phase) * 8;
          // 奥ほど藍(250)へ霞む大気遠近(最短弧でブレンド)
          let diff = 250 - hue;
          diff = ((diff % 360) + 540) % 360 - 180;
          hue = ((hue + diff * dn * 0.4) % 360 + 360) % 360;
          const sat = (sat0 * (1 - dn * 0.35)) | 0;
          let lum = lum0 * (1 - dn * 0.42);
          if (lum < 24) lum = 24;
          lum = lum | 0;
          // per-particle 包絡: 退場時はウィンクアウト(exitOffset 順に消える)、誕生時は種族 opacity 一律
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

          // 2D 版は hsla(...) 文字列をブラウザに渡して RGB 化させる。
          // ここでは同一の hslToRgb で先に RGB を出してインスタンスに渡す
          const rgb = hslToRgb(hue | 0, sat / 100, lum / 100);

          const o = idx * STRIDE;
          buf[o + 0] = p.x;
          buf[o + 1] = p.y;
          buf[o + 2] = p.z;
          buf[o + 3] = p.vx;
          buf[o + 4] = p.vy;
          buf[o + 5] = p.vz;
          buf[o + 6] = rgb[0] / 255;
          buf[o + 7] = rgb[1] / 255;
          buf[o + 8] = rgb[2] / 255;
          buf[o + 9] = alpha;
          buf[o + 10] = g.strokeLen * p.sizeJ * 0.5;
          buf[o + 11] = lineBase * p.sizeJ;
          idx++;
        }
      }
      this.instanceCount = idx;
    }
  }

  function tryCreateRenderGL(canvas) {
    let gl = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: true,
        preserveDrawingBuffer: true,
        premultipliedAlpha: false,
        desynchronized: true,
      });
    } catch (e) {
      console.warn('[render-gl] WebGL2 context creation threw:', e);
      return null;
    }
    if (!gl) {
      console.warn('[render-gl] WebGL2 unavailable; falling back to Canvas 2D');
      return null;
    }
    try {
      const r = new RenderGL(canvas, gl);
      r.init();
      console.info('[render-gl] WebGL2 path active');
      return r;
    } catch (e) {
      console.warn('[render-gl] init failed; falling back to Canvas 2D:', e);
      return null;
    }
  }

  window.tryCreateRenderGL = tryCreateRenderGL;
})();
