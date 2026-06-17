'use strict';

/*
 * Web(ブラウザ)版だけの設定パネル。
 *
 * - 普段は非表示。マウスを動かす / 画面に触れると淡くフェードインし、
 *   しばらく無操作だと静かに消える(作品の鑑賞を邪魔しない)。
 * - Lively 壁紙として動いている時は出さない。Lively はページ読み込み時に
 *   livelyPropertyListener を呼んでくるので、それを捕捉したら「壁紙だ」と判断して
 *   パネルを撤去する(壁紙は DOM のマウスイベントも来ないので二重に出ない)。
 * - 各操作は lively.js の livelyPropertyListener とまったく同じ経路で Settings に
 *   反映する(値のクランプや applyParticleCount などの副作用をそのまま再利用)。
 * - 選んだ値は web 専用の localStorage キーに保存し、次回も再現する
 *   (進化データ art-evolution-v2 とは別管理)。
 *
 * 読み込み順は index.html で lively.js → main.js → webui.js の最後。
 */

(() => {
  // lively.js が定義した本来のリスナー。これを直接呼べば壁紙判定を踏まずに設定を反映できる
  const realListener = window.livelyPropertyListener;
  // 読み込み順異常(lively.js より前)などで前提が崩れていたら何もしない。
  // Settings は lively.js が定義するグローバルで、各コントロールの初期値読み取りに使う
  if (typeof realListener !== 'function' || typeof Settings === 'undefined') return;

  let isWallpaperHost = false; // Lively がホストとして設定を流し込んできたら true
  let panel = null;
  let styleEl = null;
  let hideTimer = 0;
  let pointerInside = false;

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
    { name: 'particleCount',    label: '粒子の量',              type: 'slider', min: 4000, max: 7000, step: 100,
      get: () => Settings.particleCount },
    { name: 'cameraZoom',       label: 'カメラの距離(100=既定)', type: 'slider', min: 70,  max: 200,  step: 5,
      get: () => Math.round(Settings.cameraZoom * 100) },
    { name: 'evolutionMinutes', label: '世代交代の間隔(分)',    type: 'slider', min: 1,   max: 15,   step: 1,
      get: () => Settings.evolutionMinutes },
    { name: 'brightness',       label: '明るさ(%)',            type: 'slider', min: 40,  max: 160,  step: 5,
      get: () => Math.round(Settings.brightness * 100) },
    { name: 'trailLength',      label: '軌跡の長さ(%)',        type: 'slider', min: 10,  max: 95,   step: 5,
      get: () => Math.round(Settings.trailLength * 100) },
    { name: 'ecoMode',          label: '省電力モード',          type: 'checkbox',
      get: () => Settings.ecoMode },
    { name: 'showHud',          label: 'システム表示(世代・種族)', type: 'checkbox',
      get: () => Settings.showHud },
    { name: 'colorSync',        label: '色の同期(3D実験)',     type: 'checkbox',
      get: () => Settings.colorSync !== false },
    { name: 'cameraMotion',     label: 'カメラの動き',          type: 'checkbox',
      get: () => Settings.cameraMotion !== false },
    { name: 'forceNova',        label: '突然変異を起こす',       type: 'button' },
    { name: 'resetEvolution',   label: '進化をリセット',         type: 'button', confirm: '進化を第 1 世代からやり直します。よろしいですか?' },
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
      #nol-webui {
        position: fixed; top: 14px; right: 16px; z-index: 20;
        width: 232px; max-width: calc(100vw - 32px);
        box-sizing: border-box;
        padding: 12px 14px 10px;
        background: rgba(8, 10, 18, 0.62);
        -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.74);
        font: 11px/1.45 Consolas, 'Courier New', monospace;
        letter-spacing: 0.03em;
        opacity: 0; pointer-events: none;
        transition: opacity 0.55s ease;
        user-select: none; -webkit-user-select: none;
      }
      #nol-webui.show { opacity: 0.96; pointer-events: auto; }
      #nol-webui .ttl {
        font-size: 10px; letter-spacing: 0.22em;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 9px;
      }
      #nol-webui .ctl { margin: 9px 0; }
      #nol-webui .ctl label {
        display: flex; align-items: center; justify-content: space-between;
        cursor: pointer; gap: 8px;
      }
      #nol-webui .ctl .val {
        color: rgba(255, 255, 255, 0.55);
        font-variant-numeric: tabular-nums;
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
      #nol-webui .hint {
        margin-top: 10px; font-size: 9.5px;
        color: rgba(255, 255, 255, 0.3); letter-spacing: 0.02em;
      }
      @media (max-width: 480px) {
        #nol-webui { width: 200px; font-size: 10px; padding: 10px 11px 8px; }
      }
    `;
    document.head.appendChild(styleEl);
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'nol-webui';

    const title = document.createElement('div');
    title.className = 'ttl';
    title.textContent = 'SETTINGS';
    panel.appendChild(title);

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

    const hint = document.createElement('div');
    hint.className = 'hint';
    // タッチ専用端末では「マウスを止める」が通じないので文言を変える
    const touchOnly = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
    hint.textContent = touchOnly ? '少し待つと消えます' : 'マウスを止めると消えます';
    panel.appendChild(hint);

    panel.addEventListener('pointerenter', () => {
      pointerInside = true;
      clearTimeout(hideTimer);
    });
    panel.addEventListener('pointerleave', () => {
      pointerInside = false;
      scheduleHide();
    });

    document.body.appendChild(panel);
  }

  function reveal() {
    if (!panel) return;
    panel.classList.add('show');
    scheduleHide();
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (!pointerInside && panel) panel.classList.remove('show');
    }, 2600);
  }

  function onActivity() { reveal(); }

  function teardown() {
    window.removeEventListener('mousemove', onActivity);
    window.removeEventListener('touchstart', onActivity);
    clearTimeout(hideTimer);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    panel = null;
    styleEl = null;
  }

  // 起動直後は Lively のホスト通知が来るかどうか分からないので、少し待ってから判定する。
  // 待つ間にホスト通知が来れば teardown 済みで、ここでは何もしない
  window.setTimeout(() => {
    if (isWallpaperHost) return; // 壁紙として動いている → Web UI は出さない
    loadSaved();
    buildStyle();
    buildPanel();
    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });
  }, 800);
})();
