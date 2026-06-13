'use strict';

/*
 * Lively Wallpaper との連携と、実行時設定。
 *
 * Lively はページ読み込み時に LivelyProperties.json の全項目を
 * livelyPropertyListener(name, value) で一度ずつ通知し、以降は
 * ユーザーが設定画面を操作するたびに呼んでくる。
 * ブラウザで直接開いた場合は一切呼ばれず、以下のデフォルト値で動く。
 */

const Settings = {
  particleCount: 1200,
  evolutionMinutes: 3,
  brightness: 1.0,   // 1.0 = 100%
  trailLength: 0.5,  // 0..1(軌跡の長さ)
  ecoMode: false,    // true で 30fps に間引き
  showHud: true,     // 右下のシステム表示(世代・時刻・種族チップ)
  diagMode: false,   // 左下に診断情報(不具合調査用。Lively の設定からオンにできる)
};

// 実行時エラーの収集(診断表示用)。Lively 内では DevTools が見られないため、
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
//   ?demo  … 1 日が約 3 分で回る早回しモード(進化の確認用)
//   ?debug … 左下に世代・種族の状態を表示
const Flags = {
  demo: /[?&]demo/.test(location.search),
  debug: /[?&]debug/.test(location.search),
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
    case 'diagMode':
      Settings.diagMode = !!val;
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
