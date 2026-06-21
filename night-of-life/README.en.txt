================================
A Night of Life — 生命の夜
================================

Light art that keeps changing under a genetic algorithm

  Life is an unending project, crossing through the "night." This is an
  attempt to express its trajectory as digital art. Light shifts from one
  generation to the next, following a genetic algorithm. Where it finally
  arrives — whether one reads the accidental or the inevitable — is left
  to the observer.


■ How to view

  [Open in a browser]

  Double-click index.html. No internet connection required.

  [Use as a wallpaper]

  Compatible with Lively Wallpaper (a free wallpaper application).
  After installing, click the "+" button in Lively and load index.html
  from this folder.

  Official site: https://www.rocksdanister.com/lively/


■ Reading the Observatorium

The current state is shown at the bottom-right of the screen.

  Color chip : The tribe's representative color
  gen        : Generation number
  from       : Generation numbers of the two parent tribes (crossover)
  act        : Activity (0-1)
  vig        : Lineage strength (0-1)
  spd        : Speed (0-1)
  flk        : Flocking (0-1)
  len        : Line length (0-1)
  age        : Lifetime
  State      : · normal / in arriving / ↓out leaving / ✦ mutation


■ Fifteen genes

Each point of light carries the following fifteen genes. With every
generational turnover, crossover and mutation reshuffle them, gradually
shifting each tribe's appearance and behavior.

  [Color]

  - hueOffset     Deviation from the base hue (-110° to +110°)
  - hueSpread     Hue variability within a tribe (6° to 48°)
  - satBase       Saturation (0.55 to 0.95)
  - lumBase       Luminance (0.55 to 0.78)
  - glowSize      Thickness of the light (0.7 to 1.7)
  - strokeLen     Length of the light line (7 to 22 px)

  [Motion]

  - speed         Cruising speed (0.3 to 1.6)
  - flowObedience Obedience to the flow (0.3 to 1.0)
  - agility       Turning agility (0.008 to 0.045 rad/step)

  [Flock]

  - cohesion      Move toward peers (0 to 1)
  - alignment     Align direction with peers (0 to 1)
  - separation    Keep distance from peers (0.15 to 1)
  - flockRadius   Distance for recognizing peers (26 to 90 px)

  [Time of day]

  - dayPhase      Peak activity hour (0 to 24)
  - phaseWidth    Width of active hours (2.5 to 7 hours)


■ Credits

  Created by : ame_dev
  Partner    : Claude Fable 5, Opus 4.8


■ License

For personal viewing only. Redistribution, resale, and public release of
modified versions are prohibited.


■ Project

AI for ART
https://hello-amedev.github.io/ART/

The same high-performance AI that can be turned into attacks powerful
enough to shake nations and corporations now sits, as a matter of
course, in the hands of ordinary individuals. This is a personal
project that puts it to a different end—not competition, not
efficiency, but "AI for ART": a vision in which AI becomes a partner,
and digital art is something we create together.
