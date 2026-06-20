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
  // ブルーム強度(Step 2-2)。既定 0 で opt-in(既存ユーザーの見た目を勝手に変えない)。
  // 0..1.5(0=完全 OFF / 1.0=設計値 / 1.5=最大)。WebGL2 + HDR FBO + OES_texture_half_float_linear が
  // 揃っていない環境では描画側で bypass。オービット中は描画側で dragBoost=15 を打ち消す補正が走る
  bloomStrength: 0,
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
const Flags = {
  demo: /[?&]demo/.test(location.search),
  debug: /[?&]debug/.test(location.search),
  event: /[?&]event/.test(location.search),     // 渦イベントを常時オン(通り抜けの確認用)
  killBloom: /[?&]bloom=0/.test(location.search),
  bloomDebug: /[?&]bloomDebug=1/.test(location.search),
};

function livelyPropertyListener(name, val) {
  switch (name) {
    case 'particleCount':
      Settings.particleCount = Math.max(100, val | 0);
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
    case 'bloomStrength':
      // ON/OFF の二値(ON で 50% 相当)。100% 超のちらつき(実機 FB)を受けて上限 50 に固定。
      // 旧クライアントの数値(0..150)もそのまま受け取れるよう Number 互換を残す
      // (起動時の 1 回だけ古い値で動き、次の save() で boolean に書き換わる)。
      // 副作用関数は呼ばない(render-gl.js の draw() が毎フレーム Settings.bloomStrength を直接読む)
      if (typeof val === 'boolean') {
        Settings.bloomStrength = val ? 0.5 : 0;
      } else {
        Settings.bloomStrength = Math.max(0, Math.min(1.5, (Number(val) || 0) / 100));
      }
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
