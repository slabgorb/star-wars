# Changelog

All notable changes to **Star Wars** — a faithful browser clone of Atari's 1983 vector classic.

Play it at **[star-wars.slabgorb.com](https://star-wars.slabgorb.com)**.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Entries describe what changed
for the player. Purely internal work is summarised under *Internal*.

## [0.0.16] - 2026-07-14

### Changed
- **The trench is a canyon, not a ditch.** Rebuilt from the cabinet's own cross-section
  table, it is four times wider and twelve times deeper than before — the walls now tower
  over you, and the ribs and the far end sit where the ROM puts them.
- **The exhaust port is a hole in the trench floor.** It briefly stood upright facing the
  cockpit; it now lies flat where you fly over it and drop the shot in. The dark square at
  its centre is the target — the rings around it are the lip of the port and the Death Star
  surface it sits in.
- **The torpedo is earned on the approach.** Line up on the port as you close, and once
  you are near enough the ship launches the shot home for you.

### Fixed
- **You can climb.** The cockpit was pinned to the roof of the trench and could only dive.
  It now rides a band above the floor and moves freely up and down.
- **Your gun rides with your ship.** Shots used to leave from a fixed point in the middle of
  the trench, wherever you had actually flown to — so what you aimed at was not what you
  hit. Every wall turret and wall square in the trench is now hittable, and the exhaust port
  can no longer be won by aiming at empty sky.

### Internal
- The trench's width, wall height, rib spacing and draw distance had all been provisional
  guesses; each is now pinned to a named constant in the original 1983 source, along with
  the eye's vertical band. The ROM's third coordinate is *height*, not depth — reading it as
  depth is what had stood the exhaust port on its edge.

## [0.0.15] - 2026-07-13

Version bump only.

## [0.0.14] - 2026-07-13

No player-visible changes. Documentation only.

## [0.0.13] - 2026-07-13

### Changed
- **The exhaust port is the shape the cabinet actually drew.** Where we had an eight-sided
  octagon lying flat in the trench floor, the port is now twelve points in three concentric
  squares, standing upright at the end of the trench.
- **You now have to hit the porthole, not the plate.** The dark inner square is the target;
  the rings around it are the lip of the port and the Death Star surface it sits in. The
  shot window is measured against the hole itself, so it is wider than before but no longer
  counts a hit anywhere on the surrounding plate.
- **The Death Star surface stands at its original heights.** The laser towers and bunkers
  were rebuilt from the cabinet's own vertex tables — the towers are the height the ROM
  gives them, and the ring on top of the laser cannon is back.

### Internal
- Every ported model now carries the ROM's own draw routines, so the model contact sheet
  compares our vectors against the cabinet's stroke for stroke instead of only vertex for
  vertex. One transcribed edge is the 1983 ROM's own out-of-bounds read, kept as-is rather
  than quietly corrected.

## [0.0.12] - 2026-07-12

No player-visible changes. Documentation only.

## [0.0.11] - 2026-07-12

### Added
- **Your best score now shows on Star Wars' tile in the arcade lobby.** The game publishes
  its top score where the lobby can read it, across subdomains (ADR-0004).

## [0.0.10] - 2026-07-12

### Internal
- A ROM-versus-port model contact sheet, for checking the ported vector models against
  what the 1983 cabinet actually drew.

## [0.0.9] - 2026-07-12

### Added
- **The Death Star surface is now a maze.** The surface field is authored from the original
  cabinet's own layout data, and clears when you've scrolled through it.
- **The trench differs every run.** Its opening stretch is fixed, but the rest is drawn
  fresh each time, so you can't memorise your way to the exhaust port.

## [0.0.8] - 2026-07-12

### Added
- **Enemy fireballs now hunt you.** They home in rather than flying straight past.
- **Extra lives at 400,000 and 800,000 points**, with a flashing bonus indicator.
- Destroyed TIE fighters break apart into tumbling wing fragments.
- **Esc** pauses the game, consistent with the rest of the arcade.

### Changed
- Space combat has been rebuilt to the cabinet's real distances and speeds: TIEs spawn
  at the correct depth, drift laterally on the original table, and your lasers reach as
  far as they should.
- Scoring values now match the original ROM exactly.

### Fixed
- Fast laser shots no longer tunnel straight through the exhaust port without registering.
- The exhaust port is a real challenge again — it had become too easy to hit.

## [0.0.7] - 2026-07-11

### Added
- **Music.** A looping score that changes with each phase of the run.
- Surface towers now scale with the wave, and clearing every one of them pays a
  50,000-point bonus.
- Authentic surface tower geometry — yellow column, white cap, red bunkers.
- The enemy fireball sparkles, flickering through its four animation frames with
  glowing fuse tips.

### Fixed
- The Death Star's superlaser dish now faces the camera instead of pointing off to one side.

## [0.0.6] - 2026-07-11

### Added
- **You can fly the trench.** The viewpoint is pilotable, and the catwalks are dodgeable
  rather than decorative.
- Voice lines now play on the cabinet's original timing as you run the trench.
- The enemy fireball is drawn as the authentic red sparkle.

### Internal
- Sound effects moved to the arcade's shared audio engine. Speech keeps its own channel.

## [0.0.5] - 2026-07-11

### Internal
- Canvas scaling and letterboxing now come from the arcade's shared rendering code.

## [0.0.4] - 2026-07-10

### Internal
- Wireframes and HUD lines are stroked through the arcade's shared glow renderer.
  Same look, one implementation.

## [0.0.3] - 2026-07-10

### Added
- **A real high-score entry screen.** Beat a score and you type your initials — the game
  no longer just tags every entry "ACE".

## [0.0.2] - 2026-07-10

### Added
- The exhaust port tells you what happened: a full explosion when you hit it, and an
  unmistakable miss when you don't.

## [0.0.1] - 2026-07-10

**Initial release** — the complete three-phase run. Everything below shipped in this
first version.

### Added

**The run**
- All three phases in sequence, exactly as the cabinet plays them:
  **space combat → Death Star surface → trench run**.
- The trench ends where it should: at the exhaust port, with a force bonus for the shot.

**Space combat**
- TIE fighters that bank and swoop toward you, flying the original cabinet's
  reverse-engineered flight model.
- TIEs spawn distant and grow as they approach, peel away if you don't kill them,
  and strafe you on the way past.
- A starburst muzzle flash when a TIE fires, and difficulty that ramps by wave.
- Shoot down incoming enemy fireballs with your own lasers.

**Death Star surface**
- A wireframe Death Star hanging in space, with a procedurally scrolling surface below.
- Surface towers that fire on you from their yellow cube tops.

**The trench**
- Walled channel with ribbed sides, wall panel detail, turrets, wall squares and
  catwalks — all targetable and scored.
- Catwalks are a real hazard.

**Cockpit**
- Targeting reticle with lock-on detection, cyan chevrons and a green lock-on ring.
- Player shots render as cyan lasers converging on your aim point.
- Arcade-faithful HUD: segmented wireframe shield gauge, score, level and wave.

**Sound**
- Authentic POKEY sound effects and TMS5220 speech, both from the cabinet.

**Under the hood**
- A hand-rolled 3D vector pipeline — near-plane edge clipping, a camera and MVP
  transform — with no 3D engine.
- Authentic 3D vector models ported from the original picture ROM.
- High scores, attract mode, and a title screen.
