'use strict';

/*
 * 3D value noise + fBm。
 * フローフィールド(風の地図)の元になる、滑らかに変化する乱数。
 * 外部ライブラリなしで完結させるため自前実装。
 */
const Noise = (() => {

  // 整数格子点を決定的に 0..1 の値へつぶすハッシュ
  function hash3(ix, iy, iz) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1440662683);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  // 格子 8 頂点のトリリニア補間
  function value3(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);

    const v000 = hash3(ix, iy, iz),         v100 = hash3(ix + 1, iy, iz);
    const v010 = hash3(ix, iy + 1, iz),     v110 = hash3(ix + 1, iy + 1, iz);
    const v001 = hash3(ix, iy, iz + 1),     v101 = hash3(ix + 1, iy, iz + 1);
    const v011 = hash3(ix, iy + 1, iz + 1), v111 = hash3(ix + 1, iy + 1, iz + 1);

    const x00 = v000 + (v100 - v000) * fx;
    const x10 = v010 + (v110 - v010) * fx;
    const x01 = v001 + (v101 - v001) * fx;
    const x11 = v011 + (v111 - v011) * fx;

    const y0 = x00 + (x10 - x00) * fy;
    const y1 = x01 + (x11 - x01) * fy;

    return y0 + (y1 - y0) * fz; // 0..1
  }

  // 周波数を重ねて自然な揺らぎにする(fractal Brownian motion)
  function fbm3(x, y, z, octaves) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += value3(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm; // 0..1
  }

  return { value3, fbm3 };
})();
