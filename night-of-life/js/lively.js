'use strict';

/*
 * Lively Wallpaper との連携と、実行時設定。
 *
 * Lively はページ読み込み時に LivelyProperties.json の全項目を
 * livelyPropertyListener(name, value) で一度ずつ通知し、以降は
 * ユーザーが設定画面を操作するたびに呼んでくる。
 * ブラウザで直接開いた場合は一切呼ばれず、以下のデフォルト値で動く。
 */

// スマホ等の小さな画面 / モバイル端末では粒子を控えめにして描画負荷を下げる。
// これはブラウザで直接開いた時の初期値。Lively は LivelyProperties.json の値で上書きする
const isSmallScreen =
  Math.min(window.innerWidth || 9999, window.innerHeight || 9999) < 560 ||
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

const Settings = {
  particleCount: isSmallScreen ? 4000 : 5500,
  evolutionMinutes: 3,
  brightness: 1.0,   // 1.0 = 100%
  trailLength: 0.5,  // 0..1(軌跡の長さ)
  ecoMode: false,    // true で 30fps に間引き
  showHud: true,     // 右下のシステム表示(世代・時刻・種族チップ)
  cameraZoom: 1.0,    // 1.0 = 基準距離。> 1 で引き(全体俯瞰)、< 1 で寄り(没入)
  // ブルーム強度(Step 2-2)。2026-06-20 にオプションを撤去して 0.5 固定の常時 ON に。
  // 100% 超でちらちらするため 50% で確定、オプションを残す価値が無いというあめさん判断。
  // WebGL2 + HDR FBO 拡張が揃っていない環境では描画側で bypass、
  // オービット中は描画側で dragBoost=15 を打ち消す補正が走る
  bloomStrength: 0.5,
};

// 実行時エラーの収集(開発用 ?debug の診断表示で見せる)。Lively 内では DevTools が見られないため、
// エラーは画面に出せるよう貯めておく
const ErrorLog = [];
window.addEventListener('error', (e) => {
  ErrorLog.push(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`);
  if (ErrorLog.length > 5) ErrorLog.shift();
});
window.addEventListener('unhandledrejection', (e) => {
  ErrorLog.push(`rejection: ${e.reason}`);
  if (ErrorLog.length > 5) ErrorLog.shift();
});

// URL パラメータ:
//   ?demo       … 1 日が約 3 分で回る早回しモード(進化の確認用)
//   ?debug      … 左下に世代・種族の状態を表示
//   ?bloom=0    … ブルームを強制 OFF(キルスイッチ。bloomReady=false に倒す)
//   ?bloomDebug=1 … fboBloomB を全画面に貼って中身を可視化(UI には出さない)
//   ?ffmin=2.5  … 遠景の針の最低長(物理px)。既定 2.5、0〜3.0 にクランプ。点々対策(案A)の床
//   ?ffsoft=1.0 … 針の先端の内向きにじみ幅(CSS px)。既定 1.0、0〜3.0 にクランプ。点々対策(案A)
//   ?ssaa=1.3   … スーパーサンプリング倍率(内部を倍率^2 で描いて画面へ縮小)。既定 1.3、1.0〜2.0。
//                 1.0 で無効=現状と一致。かき傷/色ノイズを縮小時の平均でならす(WebGL2 経路のみ)
//   ?dcsat=0.5  … 最奥の彩度を沈める量(0〜1)。既定 0.5。色ノイズ抑制(density-contrast)の主役
//   ?dca=0.2    … 最奥の明度を沈める量(0〜1)。既定 0.2。density-contrast の補助(控えめ)
const Flags = {
  demo: /[?&]demo/.test(location.search),
  debug: /[?&]debug/.test(location.search),
  event: /[?&]event/.test(location.search),     // 渦イベントを常時オン(通り抜けの確認用)
  killBloom: /[?&]bloom=0/.test(location.search),
  bloomDebug: /[?&]bloomDebug=1/.test(location.search),
  // 遠景の点々対策(案A)の開発用ツマミ。UI には出さず、URL でだけ生調整できる。
  // 値が無ければ安全側の固定値(物理 2.5px 床 / 先端にじみ 1.0px)
  farMinLenPhys: (() => {
    const m = /[?&]ffmin=([0-9.]+)/.exec(location.search);
    return m ? Math.min(3.0, Math.max(0, parseFloat(m[1]) || 0)) : 2.5;
  })(),
  farEndFadeCss: (() => {
    const m = /[?&]ffsoft=([0-9.]+)/.exec(location.search);
    return m ? Math.min(3.0, Math.max(0, parseFloat(m[1]) || 0)) : 1.0;
  })(),
  // 遠景のざわつき対策・第2弾の開発用ツマミ(既定はこの値で出荷=Lively 壁紙もこの値で動く)
  ssaa: (() => {
    const m = /[?&]ssaa=([0-9.]+)/.exec(location.search);
    return m ? Math.min(2.0, Math.max(1.0, parseFloat(m[1]) || 1.0)) : 1.3;
  })(),
  dcSat: (() => {
    const m = /[?&]dcsat=([0-9.]+)/.exec(location.search);
    return m ? Math.min(1.0, Math.max(0, parseFloat(m[1]) || 0)) : 0.5;
  })(),
  dcAlpha: (() => {
    const m = /[?&]dca=([0-9.]+)/.exec(location.search);
    return m ? Math.min(1.0, Math.max(0, parseFloat(m[1]) || 0)) : 0.2;
  })(),
};

function livelyPropertyListener(name, val) {
  switch (name) {
    case 'particleCount':
      // 上限 15000(画面サイズが大きいと粒子密度が薄まって「スカスカ」に見えるため、
      // ユーザーが大画面で密度を稼げるよう上限を拡張)。render-gl.js は MAX=30000 まで
      // バッファ確保済みなので、シェーダー側は無改修で増やせる
      Settings.particleCount = Math.min(15000, Math.max(100, val | 0));
      if (window.App) App.applyParticleCount();
      break;
    case 'evolutionMinutes':
      Settings.evolutionMinutes = Math.max(1, val | 0);
      break;
    case 'brightness':
      Settings.brightness = (val | 0) / 100;
      break;
    case 'trailLength':
      Settings.trailLength = Math.min(0.95, Math.max(0.05, (val | 0) / 100));
      break;
    case 'ecoMode':
      Settings.ecoMode = !!val;
      break;
    case 'showHud':
      Settings.showHud = !!val;
      break;
    case 'cameraZoom':
      Settings.cameraZoom = Math.max(0.5, Math.min(3.0, (val | 0) / 100));
      if (window.App) App.applyCameraZoom();
      break;
    case 'bottomMargin':
      // Lively の壁紙はタスクバーの裏まで描画されるため、
      // 右下/左下の表示をタスクバー分だけ持ち上げる
      document.documentElement.style.setProperty(
        '--bottom-offset',
        `${Math.max(0, val | 0)}px`
      );
      break;
    case 'forceNova':
      if (window.App) App.forceNova();
      break;
    case 'resetEvolution':
      if (window.App) App.resetEvolution();
      break;
  }
}
window.livelyPropertyListener = livelyPropertyListener;
