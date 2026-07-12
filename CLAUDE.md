# CLAUDE.md — Star Wars

Guidance for working in this repository.

## Project Overview

A faithful, browser-based clone of Atari's 1983 vector arcade game *Star Wars* —
the first-person cockpit shooter (TIE fighters → Death Star surface → trench
run). Glowing **3D** vector lines on black, rendered with HTML5 Canvas 2D. The
game is a **deterministic pure simulation core** wrapped by a thin
input/render/audio shell.

Sibling of [tempest](../tempest) — same arcade visual language and the same hard
core/shell boundary, but a genuinely 3D core instead of Tempest's 2.5D tube.

- **Type:** Single-repo browser game (client-only, no backend)
- **Language:** TypeScript (ES modules, strict)
- **Build tool:** Vite · **Testing:** Vitest (TDD on the pure core)
- **Status:** Wave 0 skeleton (math box + core/shell boundary + glow loop).

## Repository Structure

```
star-wars/
├── src/
│   ├── core/            # PURE, unit-tested, no DOM/canvas
│   │   ├── math3d.ts    # the "Math Box": vec3/mat4, perspective projection
│   │   ├── models.ts    # 3D wireframe model registry
│   │   ├── state.ts     # GameState type
│   │   ├── sim.ts       # stepGame(state, input, dt) → state
│   │   ├── input.ts     # Input type (yoke, abstracted)
│   │   └── rng.ts       # seeded PRNG (deterministic)
│   ├── shell/           # IO: render.ts, input.ts, loop.ts (audio.ts to come)
│   └── main.ts          # bootstrap: canvas + wire shell ↔ core
├── tests/               # Vitest suites (mostly against the pure core)
├── reference/           # GITIGNORED — disassembly + audio refs (see its README)
├── index.html           # Vite entry
└── vite.config.ts       # dev server pinned to port 5274
```

## The Hard Architectural Boundary (most important rule)

`core/` is a **pure, deterministic simulation**. It must NEVER:

- import from `shell/`
- touch the DOM, `window`, `document`, or `canvas`
- call `Date.now()`, `new Date()`, `performance.now()`, `Math.random()`, or
  `requestAnimationFrame`

All time enters `core/` as `dt`. All randomness comes from the seeded RNG carried
in `GameState`. `stepGame(state, input, dt) → state` must produce identical
output for identical input. This is what makes the game unit-testable and
frame-rate independent — do not erode it.

The 3D math lives entirely in `core/math3d.ts` (pure functions on `Vec3`/`Mat4`).
The shell only *consumes* projected coordinates to stroke glowing lines; it never
does game math.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Vite dev server → http://localhost:5274
npm run build        # tsc --noEmit && vite build
npm test             # vitest run --passWithNoTests
npm run test:watch   # vitest in watch mode
npm test -- <name>   # Run a specific test file/pattern
```

## Testing

TDD on the pure core with Vitest — write the failing test first, then make it
pass. Cover: the math box (matrix multiply, rotation, projection invariants),
each enemy/object behavior driven by a fixed RNG seed, collision/hit-tests in 3D,
and scoring/phase-transition logic. The shell (render/input/audio/loop) is
verified by running the game.

## Build Roadmap

Built in "waves," each a self-contained slice (mirroring tempest's cadence):

- **Wave 0 — Skeleton:** Vite+TS, canvas bootstrap, fixed-timestep loop, the
  math box, one glowing wireframe spinning. ✅
- **Wave 1 — Space combat:** cockpit crosshair, TIE fighters, fireballs, firing,
  collisions, lives, score.
- **Wave 2 — Death Star surface:** towers, laser turrets, terrain skim.
- **Wave 3 — Trench run:** the trench, catwalks, the exhaust port, the bonus.
- **Wave 4 — Framing:** HUD, waves/difficulty ramp, attract/title, high scores.
- **Wave 5 — Audio:** POKEY SFX + TMS5220 speech ("Use the Force, Luke").

## Reference Material

Authentic vector models, game constants, and audio are ported from the commented
disassembly of the original cabinet under `reference/` (gitignored). See
`reference/README.md`. `Object_3D_Data.asm` holds the real vertex/line-segment
tables; the sound disassembly and the linked audio repo hold the SFX/speech data.

### The original 1983 Atari source (preferred over the disasm)

The **complete original MACRO-11 source** (project codename "Warp Speed") is
cloned locally — strictly richer than `reference/disasm/`: it has the original
comments, labels, and the AVG picture data the disasm lacks. Prefer it for any
fidelity question.

- **Pristine clone:** `~/Projects/star-wars-1983-source`
  (github `historicalsource/star-wars`, commit `5355b76`)
- **Greppable copy:** `~/Projects/star-wars-1983-source-text` — same filenames,
  LF-normalized plain ASCII. **Use this one for grep/read**; the originals are
  CR-terminated non-UTF8 (grep flags them binary; needs `tr '\r' '\n'` + `grep -a`).
- Both are machine-local (not in any repo). Re-create with:
  `git clone https://github.com/historicalsource/star-wars.git` + per-file
  `perl -0777 -i -pe 's/\r\n/\n/g; s/\r/\n/g; s/\x0c/\n/g; s/[^\x09\x0a\x20-\x7e]//g'`.

**Key modules** (each `.MAC` has a `.TITLE`; sections under `.SBTTL`):

| File | Contents |
|------|----------|
| `WSGLOB.MAC` | Global equates, RAM layout — where named constants live |
| `WSCPU.MAC` | **TIE AI**: "ALIEN CONTROL AND CHOREOGRAPHY" — `STARTING LOCATIONS` (`TBG*` tables: depth `$7C00`, lateral offsets ×`$400`), `WAVE DATA` (`TSPWAV` space-wave sets, Darth ordering), `CHOREOGRAPHY TABLES` (behavior scripts), `COLLISION` |
| `WSGRND.MAC` | **Surface phase**: `TOWER MAZES` — hand-authored per-wave maps of `TOWER`/`BUNKER`/`BISHOP` at explicit hex coords (top view, X ±right, Y forward, out to `$7C00`); `TTWRS` per-maze tower counts; turret fire |
| `WSBASE.MAC` | Death Star framework | 
| `WSPANL.MAC` | Trench wall panels / catwalks |
| `WSOBJ.MAC` | 3D object vertex tables + draw routines. Objects are authored as small ints × a per-object scale (`.S=13.` for the TIE) → **raw ROM units; our `models.ts` vertices are these units 1:1** |
| `WSVROM.MAC` | AVG vector **pictures** (2D shapes: `GNB/GNT` gunshot sparkles, explosions). `AVGROM.MAC` is the AVG state PROM (hardware, not pictures) |
| `WSGUNS.MAC` / `WSLAZR.MAC` / `WSXPLD.MAC` | Guns / lasers / explosions |
| `WSGLOW.MAC` / `WSGAS.MAC` | Glow + shields / score |
| `WSMAIN.MAC` / `WSMATH.MAC` / `SWMP.MAC` | Main game play / math + common routines / Math Box micro-program (`SWMP.DOC` is its doc) |
| `WSSITE.MAC` / `WSSTAR.MAC` | Site handling / starfield |

**World metric:** coordinates are 16-bit raw ROM units, `$4000` = 1.0 fixed
point; play cube clamps at ±`$7CFF`; TIE spawn depth `$7C00` (= 31,744). Since
`models.ts` is already in raw ROM units, ROM distances port into the sim
**unscaled**. Cross-reference: `reference/disasm/` labels (`sub_8xxx`…) are the
compiled form of these files; `docs/tie-flight-ai-model.md` maps the TIE AI.

## Git Workflow

- **Default branch:** `develop` (gitflow). PRs target `develop`.
- **`main` = production:** release merges only (`just release star-wars` from
  the arcade orchestrator); every push to `main` auto-deploys to R2 — never
  push it by hand.
- **Branches:** `feat/{description}`, `fix/{description}`, `chore/{description}`.
- Don't commit/push unless asked.

## Important Notes

- No 3D engine, no physics engine, no networking/backend. High scores are local
  (`localStorage`). Mouse (yoke) + keyboard only.
- Positions are **3D object/world space**; projection to the screen is a render
  concern handled via the math box. Collision is computed in 3D, not screen pixels.
- Sprint/epics are managed at the **arcade orchestrator root**, not here.
