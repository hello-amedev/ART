'use strict';

/*
 * Web(ブラウザ)版だけの設定パネル。
 *
 * - 右上の歯車アイコン(マウスを動かすと淡く現れる)をクリックすると設定パネルが開く。
 *   作品の鑑賞中はパネルもアイコンも目立たない位置でフェードアウトする。
 * - パネルは × ボタン / 歯車アイコン再クリック / マウスが離れて少し経つと自動で閉じる。
 * - Lively 壁紙として動いている時は出さない。Lively はページ読み込み時に
 *   livelyPropertyListener を呼んでくるので、それを捕捉したら「壁紙だ」と判断して
 *   アイコンもパネルも撤去する(壁紙は DOM のマウスイベントも来ないので二重に出ない)。
 * - 各操作は lively.js の livelyPropertyListener とまったく同じ経路で Settings に
 *   反映する(値のクランプや applyParticleCount などの副作用をそのまま再利用)。
 * - 選んだ値は web 専用の localStorage キーに保存し、次回も再現する
 *   (進化データ art-evolution-v2 とは別管理)。
 * - ブラウザの既定言語が ja でなければラベル類は英語に切り替わる(設定パネル内のみ。
 *   OBSERVATORIUM の列名や入口ページは別系統)。
 *
 * 読み込み順は index.html で lively.js → main.js → webui.js の最後。
 */

(() => {
  // lively.js が定義した本来のリスナー。これを直接呼べば壁紙判定を踏まずに設定を反映できる
  const realListener = window.livelyPropertyListener;
  // 読み込み順異常(lively.js より前)などで前提が崩れていたら何もしない。
  // Settings は lively.js が定義するグローバルで、各コントロールの初期値読み取りに使う
  if (typeof realListener !== 'function' || typeof Settings === 'undefined') return;

  // ブラウザの既定言語で日本語か英語かを決める。ja・ja-JP 等は日本語、それ以外は英語
  const isJa = ((navigator.language || navigator.userLanguage || 'ja') + '')
    .toLowerCase().startsWith('ja');

  const STR = isJa ? {
    title: 'SETTINGS',
    iconAria: '設定を開く',
    closeAria: '閉じる',
    particleCount: '粒子の量',
    cameraZoom: 'カメラの距離(100=既定)',
    evolutionMinutes: '世代交代の間隔(分)',
    brightness: '明るさ(%)',
    trailLength: '軌跡の長さ(%)',
    ecoMode: '省電力モード',
    showHud: 'システム表示(世代・種族)',
    forceNova: '突然変異を起こす',
    resetEvolution: '進化をリセット',
    resetConfirm: '進化を第 1 世代からやり直します。よろしいですか?',
  } : {
    title: 'SETTINGS',
    iconAria: 'Open settings',
    closeAria: 'Close',
    particleCount: 'Particles',
    // 英語ラベルは Consolas 11px で 244px パネル幅に収まる長さに揃える。
    // 値の意味はスライダーの数値表示(右側 .val)で補えるので括弧書きは省く
    cameraZoom: 'Camera distance',
    evolutionMinutes: 'Generation interval (min)',
    brightness: 'Brightness (%)',
    trailLength: 'Trail length (%)',
    ecoMode: 'Eco mode',
    showHud: 'System display',
    forceNova: 'Trigger mutation',
    resetEvolution: 'Reset evolution',
    resetConfirm: 'Reset evolution from generation 1. Are you sure?',
  };

  let isWallpaperHost = false; // Lively がホストとして設定を流し込んできたら true
  let iconEl = null;
  let panel = null;
  let styleEl = null;
  let panelOpen = false;
  let iconHideTimer = 0;
  let panelHideTimer = 0;
  let pointerInPanel = false;

  // ホスト(Lively)からの設定通知を捕捉。一度でも来たら壁紙とみなして Web UI を撤去。
  // 本来の処理(realListener)はそのまま通す
  window.livelyPropertyListener = function (name, val) {
    if (!isWallpaperHost) {
      isWallpaperHost = true;
      teardown();
    }
    return realListener.apply(this, arguments);
  };

  const WEB_KEY = 'art-web-settings-v1';

  // 表示する項目。値の渡し方は LivelyProperties.json と揃える
  // (livelyPropertyListener がその前提でクランプ・変換するため)。
  // type=slider は数値、checkbox は真偽、button は押下のみ。
  // Lively 専用(下端の余白)・開発用(診断)・実時間方針で出さない(早回し)は含めない。
  const CONTROLS = [
    { name: 'particleCount',    label: STR.particleCount,    type: 'slider', min: 4000, max: 7000, step: 100,
      get: () => Settings.particleCount },
    { name: 'cameraZoom',       label: STR.cameraZoom,       type: 'slider', min: 70,  max: 200,  step: 5,
      get: () => Math.round(Settings.cameraZoom * 100) },
    { name: 'evolutionMinutes', label: STR.evolutionMinutes, type: 'slider', min: 1,   max: 15,   step: 1,
      get: () => Settings.evolutionMinutes },
    { name: 'brightness',       label: STR.brightness,       type: 'slider', min: 40,  max: 160,  step: 5,
      get: () => Math.round(Settings.brightness * 100) },
    { name: 'trailLength',      label: STR.trailLength,      type: 'slider', min: 10,  max: 95,   step: 5,
      get: () => Math.round(Settings.trailLength * 100) },
    { name: 'ecoMode',          label: STR.ecoMode,          type: 'checkbox',
      get: () => Settings.ecoMode },
    { name: 'showHud',          label: STR.showHud,          type: 'checkbox',
      get: () => Settings.showHud },
    { name: 'forceNova',        label: STR.forceNova,        type: 'button' },
    { name: 'resetEvolution',   label: STR.resetEvolution,   type: 'button', confirm: STR.resetConfirm },
  ];

  // 保存対象(ボタンは保存しない)
  const SAVED_KEYS = CONTROLS.filter(c => c.type !== 'button').map(c => c.name);

  function loadSaved() {
    let data;
    try {
      data = JSON.parse(localStorage.getItem(WEB_KEY) || 'null');
    } catch (e) { data = null; }
    if (!data) return;
    for (const key of SAVED_KEYS) {
      if (typeof data[key] !== 'undefined') {
        try { realListener(key, data[key]); } catch (e) { /* noop */ }
      }
    }
  }

  function save() {
    const data = {};
    for (const c of CONTROLS) {
      if (c.type !== 'button' && c.get) data[c.name] = c.get();
    }
    try { localStorage.setItem(WEB_KEY, JSON.stringify(data)); } catch (e) { /* noop */ }
  }

  function buildStyle() {
    styleEl = document.createElement('style');
    styleEl.id = 'nol-webui-style';
    styleEl.textContent = `
      #nol-webui-icon {
        position: fixed; top: 14px; right: 16px; z-index: 20;
        width: 32px; height: 32px; padding: 7px;
        box-sizing: border-box;
        background: rgba(8, 10, 18, 0.55);
        -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.62);
        cursor: pointer;
        opacity: 0; pointer-events: none;
        transition: opacity 0.55s ease, color 0.2s ease, background 0.2s ease;
      }
      #nol-webui-icon.show { opacity: 0.92; pointer-events: auto; }
      #nol-webui-icon:hover {
        color: rgba(255, 226, 160, 0.95);
        background: rgba(20, 24, 36, 0.7);
      }
      #nol-webui-icon:focus-visible {
        outline: 1px solid rgba(255, 226, 160, 0.75);
        outline-offset: 2px;
      }
      #nol-webui-icon svg { width: 100%; height: 100%; display: block; }
      #nol-webui {
        /* アイコン(top:14px・高さ32px → 下端 46px)の真下にピタッと展開する。
           隙間ゼロにしておくと、pointer がアイコン → パネルへ移る間に pointerleave が
           発火して auto-close タイマーが回るタッチ操作の罠を構造的に回避できる。
           open 中もアイコンには重ならないので、アイコンクリックが届き、再クリックで toggle close できる */
        position: fixed; top: 46px; right: 16px; z-index: 21;
        width: 244px; max-width: calc(100vw - 32px);
        box-sizing: border-box;
        padding: 12px 14px 12px;
        background: rgba(8, 10, 18, 0.62);
        -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.74);
        font: 11px/1.45 Consolas, 'Courier New', monospace;
        letter-spacing: 0.03em;
        opacity: 0; pointer-events: none;
        transition: opacity 0.35s ease;
        user-select: none; -webkit-user-select: none;
      }
      #nol-webui.show { opacity: 0.96; pointer-events: auto; }
      #nol-webui .head {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 9px;
      }
      #nol-webui .ttl {
        font-size: 10px; letter-spacing: 0.22em;
        color: rgba(255, 255, 255, 0.5);
      }
      #nol-webui .close {
        background: none; border: none; padding: 0;
        width: 18px; height: 18px;
        color: rgba(255, 255, 255, 0.45);
        font: inherit; font-size: 15px; line-height: 14px;
        cursor: pointer; transition: color 0.2s ease;
      }
      #nol-webui .close:hover { color: rgba(255, 226, 160, 0.95); }
      #nol-webui .close:focus-visible {
        outline: 1px solid rgba(255, 226, 160, 0.75);
        outline-offset: 2px;
      }
      #nol-webui .ctl { margin: 9px 0; }
      #nol-webui .ctl label {
        display: flex; align-items: center; justify-content: space-between;
        cursor: pointer; gap: 8px;
      }
      /* ラベル本体: 想定外の長さでも 1 行で省略表示にする(英訳が長くなっても破綻しない保険) */
      #nol-webui .ctl .lab {
        flex: 1 1 auto; min-width: 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #nol-webui .ctl .val {
        color: rgba(255, 255, 255, 0.55);
        font-variant-numeric: tabular-nums;
        flex: none;
      }
      #nol-webui input[type="range"] {
        -webkit-appearance: none; appearance: none;
        width: 100%; height: 3px; margin: 7px 0 0;
        background: rgba(255, 255, 255, 0.18);
        border-radius: 2px; outline: none; cursor: pointer;
      }
      #nol-webui input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 12px; height: 12px; border-radius: 50%;
        background: rgba(255, 226, 160, 0.92); border: none; cursor: pointer;
      }
      #nol-webui input[type="range"]::-moz-range-thumb {
        width: 12px; height: 12px; border-radius: 50%;
        background: rgba(255, 226, 160, 0.92); border: none; cursor: pointer;
      }
      #nol-webui input[type="checkbox"] {
        accent-color: rgba(255, 226, 160, 0.9);
        width: 13px; height: 13px; cursor: pointer; flex: none;
      }
      #nol-webui .ctl.check label { justify-content: flex-start; }
      #nol-webui .btn {
        width: 100%; margin-top: 2px; padding: 6px 8px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 5px;
        color: rgba(255, 255, 255, 0.78);
        font: inherit; letter-spacing: 0.05em; cursor: pointer;
        transition: background 0.2s ease;
      }
      #nol-webui .btn:hover { background: rgba(255, 226, 160, 0.14); }
      @media (max-width: 480px) {
        #nol-webui { width: 208px; font-size: 10px; padding: 10px 11px 10px; }
      }
    `;
    document.head.appendChild(styleEl);
  }

  // 線画の歯車。半径方向に 8 本のスポーク + 中央のリング
  function gearSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' +
      '<circle cx="12" cy="12" r="3.2"/>' +
      '<path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3' +
      'M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M5.2 18.8l2.1-2.1M16.7 7.3l2.1-2.1"/>' +
      '</svg>';
  }

  function buildIcon() {
    iconEl = document.createElement('button');
    iconEl.id = 'nol-webui-icon';
    iconEl.type = 'button';
    iconEl.setAttribute('aria-label', STR.iconAria);
    iconEl.setAttribute('aria-expanded', 'false');
    iconEl.innerHTML = gearSvg();
    iconEl.addEventListener('click', () => {
      if (panelOpen) closePanel();
      else openPanel();
    });
    document.body.appendChild(iconEl);
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'nol-webui';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', STR.title);

    const head = document.createElement('div');
    head.className = 'head';
    const title = document.createElement('div');
    title.className = 'ttl';
    title.textContent = STR.title;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', STR.closeAria);
    closeBtn.textContent = '×'; // ×
    closeBtn.addEventListener('click', () => closePanel());
    head.appendChild(title);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    for (const c of CONTROLS) {
      const ctl = document.createElement('div');
      ctl.className = 'ctl';

      if (c.type === 'slider') {
        const label = document.createElement('label');
        const lab = document.createElement('span');
        lab.className = 'lab';
        lab.textContent = c.label;
        const val = document.createElement('span');
        val.className = 'val';
        const input = document.createElement('input');
        input.type = 'range';
        input.min = c.min; input.max = c.max; input.step = c.step;
        input.value = c.get();
        val.textContent = input.value;
        label.appendChild(lab);
        label.appendChild(val);
        ctl.appendChild(label);
        ctl.appendChild(input);
        input.addEventListener('input', () => {
          val.textContent = input.value;
          realListener(c.name, Number(input.value));
          save();
        });

      } else if (c.type === 'checkbox') {
        ctl.classList.add('check');
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!c.get();
        const lab = document.createElement('span');
        lab.className = 'lab';
        lab.textContent = c.label;
        label.appendChild(input);
        label.appendChild(lab);
        ctl.appendChild(label);
        input.addEventListener('change', () => {
          realListener(c.name, input.checked);
          save();
        });

      } else { // button
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.type = 'button';
        btn.textContent = c.label;
        ctl.appendChild(btn);
        btn.addEventListener('click', () => {
          if (c.confirm && !window.confirm(c.confirm)) return;
          realListener(c.name, 'web');
        });
      }

      panel.appendChild(ctl);
    }

    panel.addEventListener('pointerenter', () => {
      pointerInPanel = true;
      clearTimeout(panelHideTimer);
    });
    panel.addEventListener('pointerleave', () => {
      pointerInPanel = false;
      schedulePanelClose();
    });

    document.body.appendChild(panel);
  }

  // タッチ専用端末(マウスホバー無し)では pointerenter/leave が信頼できず、
  // スライダー操作中に意図せず close が走ってしまう。タッチ端末では auto-close を無効化し、
  // 明示操作(× ボタン / アイコン再タップ)でのみ閉じる。
  // ハイブリッド端末(iPad + マウス・Surface など)でモードが切り替わっても追従するように、
  // MediaQueryList の change を購読して動的に更新する(モジュール起動時の判定が stale にならない)
  let touchOnly = false;
  if (window.matchMedia) {
    const mq = window.matchMedia('(hover: none)');
    touchOnly = !!mq.matches;
    const onChange = (e) => { touchOnly = !!e.matches; };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
    } else if (typeof mq.addListener === 'function') {
      // Safari 13 以前向けのフォールバック
      mq.addListener(onChange);
    }
  }

  function showIcon() {
    if (!iconEl) return;
    iconEl.classList.add('show');
    if (!panelOpen) scheduleIconHide();
  }

  function scheduleIconHide() {
    clearTimeout(iconHideTimer);
    iconHideTimer = window.setTimeout(() => {
      // パネルが開いている間はアイコンを残しておく(再クリックで閉じるアフォーダンスを保つ)
      if (!panelOpen && iconEl) iconEl.classList.remove('show');
    }, 2600);
  }

  function openPanel() {
    if (!panel) return;
    panelOpen = true;
    panel.classList.add('show');
    if (iconEl) {
      // パネル open 中もアイコンは表示・クリック可能のまま(再クリックで close)
      iconEl.classList.add('show');
      iconEl.setAttribute('aria-expanded', 'true');
    }
    clearTimeout(iconHideTimer);
    // open 直後は auto-close タイマーを起動しない(クリックで開けたのに触らず放置で勝手に閉じる罠を回避)。
    // pointer がパネルに入って → 出た時にだけ schedulePanelClose が起動する
  }

  function closePanel() {
    if (!panel) return;
    panelOpen = false;
    panel.classList.remove('show');
    pointerInPanel = false;
    clearTimeout(panelHideTimer);
    if (iconEl) iconEl.setAttribute('aria-expanded', 'false');
    showIcon();
  }

  function schedulePanelClose() {
    // タッチ端末では pointerleave/enter が信頼できないので auto-close を発動させない
    if (touchOnly) return;
    clearTimeout(panelHideTimer);
    panelHideTimer = window.setTimeout(() => {
      if (!pointerInPanel && panelOpen) closePanel();
    }, 2600);
  }

  function onActivity() {
    if (!panelOpen) showIcon();
  }

  function teardown() {
    window.removeEventListener('mousemove', onActivity);
    window.removeEventListener('touchstart', onActivity);
    clearTimeout(iconHideTimer);
    clearTimeout(panelHideTimer);
    if (iconEl && iconEl.parentNode) iconEl.parentNode.removeChild(iconEl);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    iconEl = null;
    panel = null;
    styleEl = null;
  }

  // 起動直後は Lively のホスト通知が来るかどうか分からないので、少し待ってから判定する。
  // 待つ間にホスト通知が来れば teardown 済みで、ここでは何もしない
  window.setTimeout(() => {
    if (isWallpaperHost) return; // 壁紙として動いている → Web UI は出さない
    loadSaved();
    buildStyle();
    buildIcon();
    buildPanel();
    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });
  }, 800);
})();
