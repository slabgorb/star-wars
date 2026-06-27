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

## Git Workflow

- **Default branch:** `develop` (gitflow). PRs target `develop`.
- **Branches:** `feat/{description}`, `fix/{description}`, `chore/{description}`.
- Don't commit/push unless asked.

## Important Notes

- No 3D engine, no physics engine, no networking/backend. High scores are local
  (`localStorage`). Mouse (yoke) + keyboard only.
- Positions are **3D object/world space**; projection to the screen is a render
  concern handled via the math box. Collision is computed in 3D, not screen pixels.
- Sprint/epics are managed at the **arcade orchestrator root**, not here.
