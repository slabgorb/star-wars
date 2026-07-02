# Design — Trench-run render-and-evaluate workflow + trench rebuild

- **Date:** 2026-07-01
- **Game:** `star-wars`
- **Status:** Approved (brainstorm) — pending implementation plan
- **Relates to:** [ADR 0002 — scene geometry for surface & trench](../../adr/0002-scene-geometry-surface-and-trench.md);
  the model contact sheet ([spec](./2026-06-28-model-contact-sheet-design.md),
  [`src/tools/contactSheet.ts`](../../../src/tools/contactSheet.ts)); `src/shell/render.ts`;
  `src/core/models.ts`; `src/core/surface-grid.ts`.

## Problem

The Death Star **trench run** — including the shot at the exhaust port — is not
built. The pieces exist as isolated models (`TRENCH`, `EXHAUST_PORT`,
`DEATH_STAR`) but there is no composed corridor: `render.ts` still draws the flat
512×384 `TRENCH` tile (a ~4px sliver at the vanishing point) instead of a walled
channel. ADR 0002 part A (the surface ground grid, `surfaceGrid`) shipped as
story 11-5; **ADR 0002 part B (the `trenchChannel` corridor) was never built.**

Worse, the broken surface/trench geometry shipped review **twice** (stories
11-1, 11-2) because the only "eyeball" tool — the model contact sheet — renders
each model *in isolation*, where the spike and the tile look fine. Reaching the
trench in live play requires clearing the space phase then the surface phase, so
nobody looked at the composed scene. We need to **see a composed game frame and
judge it without a play test** before we can trust any trench work.

## Goals

1. A **scene contact sheet**: a browser dev page that renders composed game
   frames (the trench scene, the shot) as **stills**, side by side, through the
   *real* game pipeline — eyeballed, not played.
2. Rebuild the trench as a **walled corridor** (ADR 0002 part B).
3. Add the **shot beat**: a targeting reticle that locks the exhaust port and a
   proton-torpedo launch + impact. (Death Star explosion is **deferred**.)

## Non-goals

- The Death Star **explosion / victory** cinematic (deferred by product owner).
- Headless / CI PNG-regression rendering (approach ③ below — premature; revisit
  once the look settles).
- Sim-driven replay frames (approach ② — deferred; presets are authored so they
  can be upgraded to replay later).
- Any change to the core/shell boundary, the transform pipeline (ADR 0001), or
  runtime dependencies.

## Approach chosen

**① State-driven presets that reuse the real `render()`.** Each scene-sheet cell
is a hand-authored, pure-core `GameState` rendered through the existing
`render(ctx, state, w, h)` into a cell-sized offscreen canvas, then blitted into
a grid. Rejected alternatives: **②** sim-driven replay (more work; needs the shot
mechanic to already exist; overkill for geometry iteration) and **③** headless
node-canvas PNG dump (new dev dependency; product owner chose the browser-eyeball
path, not CI). ① is the least new code, maximal fidelity (identical pipeline to
play), and its presets double as reusable unit-test fixtures.

## Deliverable A — Scene-sheet harness

### Files

- **`src/core/scenePresets.ts`** — *pure core, deterministic, no DOM.*
  ```ts
  export type ScenePreset = {
    id: string        // stable slug, e.g. 'mid-run'
    label: string     // shown above the cell, e.g. 'MID-RUN'
    hint?: string     // optional caption, e.g. 'port approaching'
    state: GameState  // frozen at the canonical moment
  }
  export const SCENE_PRESETS: readonly ScenePreset[]
  ```
  Each preset is a `GameState` constructed at a canonical moment (phase, scroll
  accumulators, exhaust-port position, and — once D lands — lock/torpedo state).
  Pure core, so it is unit-tested and reusable as a fixture in sim/render tests.

- **`src/tools/sceneSheet.ts`** — *shell/DOM tool; never imported by core or its
  tests* (same rule as `contactSheet.ts`). Responsibilities:
  1. Size the canvas to the viewport (DPR-aware), lay out a grid over
     `SCENE_PRESETS` using the existing `modelView.cellRects`.
  2. For each preset: get/resize an **offscreen** `HTMLCanvasElement` at
     `cellW × cellH`, call `render(offCtx, preset.state, cellW, cellH)`, then
     `ctx.drawImage(off, cellX, cellY)` into the sheet.
  3. Draw the `label` (and `hint`) per cell using the vector font, matching the
     contact sheet's typography.
  4. Static stills — render once, re-render on resize and on an `[R]` keypress.
     No animation loop.

- **`scenes.html`** — a third Vite multipage entry (mirrors `models.html`),
  loading `/src/tools/sceneSheet.ts`.

- **`vite.config.ts`** — add `scenes: 'scenes.html'` to
  `build.rollupOptions.input` alongside `main` and `models`.

### Data flow

```
SCENE_PRESETS[i].state ──▶ render(offCtx, state, cellW, cellH) ──▶ offscreen canvas
                                                                       │
                                          ctx.drawImage(off, cell) ◀───┘
                                                     │
                                       label + hint drawn over cell
```

`render()` clears its own target with `fillRect(0,0,w,h)`, so rendering into a
per-cell offscreen canvas is side-effect-free and needs **no change to
`render()`**. Each cell is pixel-faithful to the real game screen at that moment.

### Frames (presets)

| id | shows | renderable when |
|----|-------|-----------------|
| `port-in-sight` | exhaust port centered ahead, in range | immediately (even on current geometry) |
| `trench-entry` | dropped into the channel, walls rising, port far ahead | after corridor (Deliverable B) |
| `mid-run` | deep in the corridor, walls streaking, port approaching | after corridor (B) |
| `lock` | targeting reticle locked on the port | after shot beat (Deliverable C) |
| `torpedoes-away` | proton torpedoes in flight / impact flash | after shot beat (C) |

The sheet ships with whatever is renderable and **gains a cell as each rebuild
story lands** — the trench comes to life frame by frame.

## Deliverable B — Trench corridor rebuild (ADR 0002 part B)

- **`src/core/trench-channel.ts`** — *pure.* `trenchChannel(scroll): Model3D`,
  mirroring `surface-grid.ts`:
  - Floor rails at `x = ±TRENCH_HALF_W` (≈256) running from ~z=0 to a far cutoff
    (≈−6000), with lateral floor ribs every `RIB_Z`.
  - Two side **walls**: verticals `y=0 → TRENCH_WALL_H` (≈400) at each rib, plus
    top rails at `y=TRENCH_WALL_H` — a ribbed canyon that reads as depth.
  - The whole pattern recycles `mod RIB_Z` so the corridor rushes past:
    `trenchChannel(s) ≡ trenchChannel(s + RIB_Z)`.
- **`src/shell/render.ts`** — in the `state.phase === 'trench'` branch, replace
  the flat `TRENCH` tile draw (current line ~226) with
  `drawWireframe(ctx, trenchChannel(state.trenchScrollZ), view, proj, w, h, SURFACE_GLOW)`.
  The old `TRENCH` model stays in the registry (still shown on the model contact
  sheet) but leaves the trench scene — the same treatment the retired
  `DEATH_STAR_SURFACE` spike got.
- **`src/core/state.ts` / `src/core/sim.ts`** — add a `trenchScrollZ` accumulator
  to `GameState`, advance it in `stepTrench` by `TRENCH_SCROLL_SPEED`, reset to 0
  on phase entry — exactly parallel to `surfaceScrollZ`.
- **Constants** (`state.ts`): `TRENCH_HALF_W`, `TRENCH_WALL_H`, `RIB_Z`, far
  cutoff. Tuned by eyeballing the scene sheet.

### Tests (Vitest, pure core)

- Segment counts for a given scroll and cutoff.
- ±X symmetry of rails and walls.
- Wall-height and channel-length envelope (walls reach `TRENCH_WALL_H`; geometry
  spans cockpit → far cutoff).
- Scroll recycling: `trenchChannel(s)` and `trenchChannel(s + RIB_Z)` are
  congruent.

## Deliverable C — The shot beat (targeting + torpedoes)

New game design; recommended to get its own short spec once A+B land, but in
scope for this slice:

- **State** (trench-phase `GameState`): a lock indicator for the exhaust port
  (in-range **and** centered) and a **proton-torpedo** projectile type distinct
  from the laser bolts.
- **Reticle / HUD** (`src/core/hud.ts` + `src/shell/render.ts`): a lock reticle
  appears over the port when it is targetable.
- **Sim** (`stepTrench`): torpedo travel down −Z and impact test against the
  port → run cleared + `TRENCH_BONUS` (existing logic). **No Death Star
  explosion** — deferred.
- Pure core logic, unit-tested against a fixed RNG seed.

The `lock` and `torpedoes-away` presets in Deliverable A are authored once this
state exists.

## Sequencing (stories)

New **star-wars roadmap** work (the sprint currently reads 631/631; these are
added as stories under the star-wars epic). Order is deliberate — the harness
first is what makes the rest verifiable without a play test, closing the exact
gap that let the broken geometry pass review twice:

1. **Scene-sheet harness** (Deliverable A) — ~3 pts. *Build the eyes first.*
2. **Trench corridor** (Deliverable B) — ~5 pts. Evaluated against the sheet.
3. **Shot beat: targeting + torpedoes** (Deliverable C) — ~5–8 pts, may split.
   Evaluated against the sheet.

## Constraints honored

- **Core/shell boundary:** `scenePresets.ts`, `trench-channel.ts`, and all sim
  changes are pure core (deterministic, no DOM/time/random). `sceneSheet.ts` is a
  shell/DOM tool, never imported by core or its tests.
- **Zero new runtime dependencies.** The vector aesthetic and the ADR-0001
  transform pipeline are unchanged; the harness reuses `render()` verbatim.
- Determinism intact: presets and generators are pure and unit-tested.
