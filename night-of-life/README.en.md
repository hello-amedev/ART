# A Night of Life — 生命の夜

[日本語](README.md) | **English**

Light-art that keeps evolving through a genetic algorithm.

> Life lies sealed within the night. In this small garden, light—each point
> carrying fifteen genes—changes from one generation to the next, following a
> genetic algorithm. Where it finally arrives, whether one reads the accidental
> or the inevitable is left to the observer.

Across the screen, many "tribes" of light drift quietly. They pass through
generations again and again — colors and movements gradually shifting — and now
and then a mutation brings forth a family in a color never seen before.
The same view never returns.

## View

Just open it in a browser: https://hello-amedev.github.io/ART/night-of-life/

## Use as a wallpaper (Windows · Lively Wallpaper)

1. Install and open [Lively Wallpaper](https://www.rocksdanister.com/lively/)
2. Click "＋" (Add wallpaper) → choose the included `index.html`
3. Right-click the wallpaper → "Customize" to adjust the look

## What you can customize

In Lively the settings are labeled in Japanese; here they are with English.

| Setting (as shown) | What it does |
|---|---|
| 粒子の量 — Particles | Number of light strokes. Lower it if it feels heavy |
| 世代交代の間隔(分) — Generation interval (min) | The pace of evolution |
| 明るさ(%) — Brightness | Overall brightness |
| 軌跡の長さ(%) — Trail length | Length of the light trails |
| 省電力モード — Power saving | Lightens the rendering |
| システム表示(世代・種族) — System readout | Show/hide the small panel at bottom-right |
| 突然変異を起こす — Trigger a mutation | Cause a mutation right now |
| 進化をリセット — Reset evolution | Start over from the beginning |
| 下端の余白 — Bottom margin | Adjust if the panel hides behind the taskbar |

## Reading the panel (bottom-right)

Like an instrument of a detached observer, it shows one row per tribe of light
currently on screen (hide it with "System readout").

- top line … the current generation and time
- color chip … the tribe's color (compare it with the light on screen)
- `gen` / `from` … its generation, and the two parents it was crossed from (e.g. 42 / 38×35)
- `act` … current liveliness (higher for tribes suited to the current time of day)
- `vig` … family vigor (high while a lineage keeps having offspring; it fades when the line dies out)
- `spd` / `flk` / `len` … speed · flocking · length of light
- `age` … time lived (min:sec)
- right … state (in = being born / ↓out = leaving / ✦ = mutation)
- bottom log … recent births (↑), exits (↓), mutations (✦), and new arrivals (+)

## Good to know

- Evolution runs on its own and keeps growing from where it left off, even after a restart
- The same pattern never appears twice
- If you update the wallpaper files, remove it once in Lively and add it again

---

AI for ART — by ame_dev
https://hello-amedev.github.io/ART/
