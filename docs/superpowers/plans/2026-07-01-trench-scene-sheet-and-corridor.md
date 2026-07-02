# Trench Scene Sheet + Corridor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser scene-contact-sheet that renders composed trench-run game frames as stills (Deliverable A), then rebuild the trench as a walled corridor (Deliverable B) — evaluated frame-by-frame against that sheet.

**Architecture:** A pure-core preset registry (`scenePresets.ts`) supplies canonical `GameState`s; a shell dev tool (`sceneSheet.ts` → `/scenes.html`) renders each through the **existing** `render(ctx, state, w, h)` into a clipped, translated grid cell — the identical pipeline the game loop uses, so a cell is pixel-faithful to the real screen. The corridor is a pure generator (`trenchChannel(scroll)`) mirroring the shipped `surfaceGrid`, with a `trenchScrollZ` accumulator mirroring `surfaceScrollZ`; `render.ts` swaps the flat `TRENCH` tile for it.

**Tech Stack:** TypeScript (strict, ES modules) · Vite 8 (multipage) · Vitest 4 · HTML5 Canvas 2D. No new dependencies.

**Scope note:** This plan covers Deliverables A + B from the spec (`docs/superpowers/specs/2026-07-01-trench-run-render-eval-and-rebuild-design.md`). Deliverable C (the shot beat — reticle lock + proton torpedoes) is deliberately deferred to its own brainstorm → spec → plan, per the spec, because its mechanics are not yet specified and would require invention here.

## Global Constraints

- **Core purity (`src/core/**`):** must NEVER import from `shell/`, touch the DOM / `window` / `document` / `canvas`, or call `Date.now()`, `new Date()`, `performance.now()`, `Math.random()`, or `requestAnimationFrame`. All time enters as `dt`; all randomness comes from the seeded RNG in `GameState`. `stepGame(state, input, dt)` is a pure function.
- **Zero new runtime dependencies.** Reuse `render()` / `drawWireframe()` verbatim; the ADR-0001 transform pipeline and the vector aesthetic are unchanged.
- **TypeScript strict; `noUnusedLocals: true`** — an unused local *or import* fails `tsc`. Remove imports that a swap makes dead.
- **TDD on the pure core** (Vitest): write the failing test first. The shell (render/tools) is verified by `npm run build` + eyeball, except the render-swap, which gets a mock-based shell test per the repo's `render.surface-grid.test.ts` idiom.
- **Tests reference exported constants BY NAME, never hard-coded numbers** (repo convention — see `surface-grid.test.ts`).
- **Dev server:** port `5274`, base `/star-wars/`. Scene sheet served at `http://localhost:5274/star-wars/scenes.html`.
- **Git:** gitflow. Work on a branch `feat/trench-scene-sheet` cut from `develop`; commit per task. Do NOT push or open the PR (targets `develop`) until the user asks.

---

## Story 1 — Scene-sheet harness (Deliverable A)

### Task 1: Scene preset registry (`scenePresets.ts`)

**Files:**
- Create: `src/core/scenePresets.ts`
- Test: `tests/core/scene-presets.test.ts`

**Interfaces:**
- Consumes: `initialState`, `EXHAUST_PORT_DISTANCE`, `type GameState` from `src/core/state.ts`; `enterPhase` from `src/core/sim.ts`.
- Produces:
  - `export interface ScenePreset { id: string; label: string; hint?: string; state: GameState }`
  - `export const SCENE_PRESETS: readonly ScenePreset[]`

- [ ] **Step 1: Write the failing test**

Create `tests/core/scene-presets.test.ts`:

```ts
// tests/core/scene-presets.test.ts
//
// Deliverable A — the scene contact sheet renders composed trench-run frames from
// these canonical GameStates. Pure core: the presets are hand-authored via the SAME
// enterPhase() play uses, so a cell shows exactly what the game screen shows.

import { describe, it, expect } from 'vitest'
import { SCENE_PRESETS } from '../../src/core/scenePresets'

describe('SCENE_PRESETS', () => {
  it('exposes at least one preset with a unique id and a non-empty label', () => {
    expect(SCENE_PRESETS.length).toBeGreaterThan(0)
    const ids = SCENE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of SCENE_PRESETS) expect(p.label.length).toBeGreaterThan(0)
  })

  it('every preset is a valid live trench frame', () => {
    for (const p of SCENE_PRESETS) {
      expect(p.state.phase).toBe('trench')
      expect(p.state.mode).toBe('playing')
      expect(p.state.exhaustPort).not.toBeNull()
    }
  })

  it('orders the exhaust port from far (entry) to near (in-sight)', () => {
    const first = SCENE_PRESETS[0].state.exhaustPort!.pos[2]
    const last = SCENE_PRESETS[SCENE_PRESETS.length - 1].state.exhaustPort!.pos[2]
    // z is negative down-range: the first frame's port is farther (more negative)
    // than the last frame's, so the run reads front-to-back across the sheet.
    expect(first).toBeLessThan(last)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- scene-presets`
Expected: FAIL — `Cannot find module '../../src/core/scenePresets'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/scenePresets.ts`:

```ts
// src/core/scenePresets.ts
//
// Canonical trench-run frames for the scene contact sheet (tools/sceneSheet.ts).
// Each preset is a GameState frozen at a moment of the run, reached the SAME way
// play reaches it — enterPhase(initialState(), 'trench') — then the exhaust port
// seated at a canonical downrange distance. PURE core (no DOM/time/random), so the
// presets are deterministic and double as reusable test fixtures.

import { initialState, EXHAUST_PORT_DISTANCE, type GameState } from './state'
import { enterPhase } from './sim'

export interface ScenePreset {
  /** Stable slug, e.g. 'mid-run'. */
  id: string
  /** Shown above the cell, e.g. 'MID-RUN'. */
  label: string
  /** Optional caption under the label, e.g. 'port approaching'. */
  hint?: string
  /** The composed game state the cell renders. */
  state: GameState
}

/** A live trench-run state with the exhaust port seated at world Z `portZ`
 *  (negative = downrange). mode:'playing' so the cell shows the real in-run
 *  screen — HUD included — not the attract/game-over frame. */
function trenchAt(portZ: number): GameState {
  const s = enterPhase(initialState(), 'trench')
  return { ...s, mode: 'playing', exhaustPort: { pos: [0, 0, portZ] } }
}

export const SCENE_PRESETS: readonly ScenePreset[] = [
  { id: 'trench-entry', label: 'TRENCH-ENTRY', hint: 'port far downrange',
    state: trenchAt(-EXHAUST_PORT_DISTANCE) },
  { id: 'mid-run', label: 'MID-RUN', hint: 'port approaching',
    state: trenchAt(-1400) },
  { id: 'port-in-sight', label: 'PORT-IN-SIGHT', hint: 'in range',
    state: trenchAt(-600) },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- scene-presets`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/scenePresets.ts tests/core/scene-presets.test.ts
git commit -m "feat(scene-sheet): add canonical trench-run scene presets"
```

---

### Task 2: Scene contact sheet page (`sceneSheet.ts` + `scenes.html`)

**Files:**
- Create: `src/tools/sceneSheet.ts`
- Create: `scenes.html`
- Modify: `vite.config.ts` (add `scenes` to `build.rollupOptions.input`)

**Interfaces:**
- Consumes: `SCENE_PRESETS` from `src/core/scenePresets.ts`; `cellRects` from `src/core/modelView.ts`; `render` from `src/shell/render.ts`; `loadVectorFont` from `src/shell/font.ts`.
- Produces: a browser-only dev page. No exports; not imported by anything.

> Shell/DOM tool — verified by build + eyeball (no unit test), following the repo rule that the shell is verified by running. It renders **static stills** (no animation loop): draw on load, on resize, and on `[R]`.

- [ ] **Step 1: Create the HTML entry**

Create `scenes.html` (mirrors `models.html`):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Star Wars — Scene Contact Sheet</title>
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <canvas id="sheet"></canvas>
    <script type="module" src="/src/tools/sceneSheet.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the tool**

Create `src/tools/sceneSheet.ts`:

```ts
// src/tools/sceneSheet.ts
//
// Scene contact sheet — a standalone dev page (/scenes.html) that renders the
// composed GAME screen at a set of canonical trench-run moments (core/scenePresets)
// as STILLS, side by side, through the SAME render() the game loop uses. Unlike the
// model contact sheet (one model per cell), each cell here is a full frame — camera,
// geometry, glow, HUD — so the trench scene can be eyeballed without a play test.
//
//   [R]  re-render
//
// DOM/shell tool — never imported by the deterministic core or its tests.

import { SCENE_PRESETS } from '../core/scenePresets'
import { cellRects } from '../core/modelView'
import { render } from '../shell/render'
import { loadVectorFont } from '../shell/font'

const COLS = 2
const LABEL_FONT = "700 14px 'Vector Battle', 'Orbitron', monospace"
const LABEL_COLOR = '#ff9f0a' // target amber, matching the exhaust-port glow
const HINT_COLOR = '#7a8699'

void loadVectorFont() // best-effort; falls back to monospace if it never lands

const canvas = document.getElementById('sheet') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let dpr = Math.min(2, window.devicePixelRatio || 1)
let W = window.innerWidth
let H = window.innerHeight

function draw(): void {
  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const rects = cellRects(W, H, SCENE_PRESETS.length, COLS)
  for (let i = 0; i < SCENE_PRESETS.length; i++) {
    const preset = SCENE_PRESETS[i]
    const r = rects[i]

    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.clip()
    ctx.translate(r.x, r.y) // cell-local viewport
    // The REAL game renderer: it clears its own w×h (clipped to this cell) and
    // draws the composed frame — camera, geometry, glow, HUD — identical to play.
    render(ctx, preset.state, r.w, r.h)

    ctx.font = LABEL_FONT
    ctx.textAlign = 'left'
    ctx.fillStyle = LABEL_COLOR
    ctx.shadowColor = LABEL_COLOR
    ctx.shadowBlur = 6
    ctx.fillText(preset.label, 10, 22)
    if (preset.hint) {
      ctx.shadowBlur = 0
      ctx.fillStyle = HINT_COLOR
      ctx.fillText(preset.hint, 10, 40)
    }
    ctx.shadowBlur = 0
    ctx.restore()
  }

  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.fillStyle = HINT_COLOR
  ctx.shadowBlur = 0
  ctx.fillText('SCENE SHEET   ·   [R] re-render', W / 2, H - 8)
  ctx.restore()
}

function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1)
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
  draw()
}

window.addEventListener('resize', resize)
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') draw()
})
resize() // initial size + draw
```

- [ ] **Step 3: Register the page with Vite**

Modify `vite.config.ts` — add `scenes` to the multipage input:

```ts
    rollupOptions: {
      input: {
        main: 'index.html',
        models: 'models.html',
        scenes: 'scenes.html',
      },
    },
```

- [ ] **Step 4: Build to verify it type-checks and bundles**

Run: `npm run build`
Expected: PASS — `tsc --noEmit` clean and `vite build` emits `scenes.html`.

- [ ] **Step 5: Eyeball the sheet**

Run: `npm run dev` (or `just serve` from the orchestrator root), then open
`http://localhost:5274/star-wars/scenes.html`.
Expected: a 2-column grid of trench-run stills. Each cell shows the composed screen
(cockpit HUD + the current trench geometry — at this point still the flat `TRENCH`
tile; Story 2 replaces it). `[R]` re-renders. This is the "before" the corridor fixes.

- [ ] **Step 6: Commit**

```bash
git add src/tools/sceneSheet.ts scenes.html vite.config.ts
git commit -m "feat(scene-sheet): add /scenes.html composed-frame contact sheet"
```

---

## Story 2 — Trench corridor (Deliverable B, ADR 0002 part B)

### Task 3: The `trenchChannel` generator (`trench-channel.ts`)

**Files:**
- Create: `src/core/trench-channel.ts`
- Test: `tests/core/trench-channel.test.ts`

**Interfaces:**
- Consumes: `type Vec3` from `src/core/math3d.ts`; `type Model3D` from `src/core/models.ts`.
- Produces:
  - `export function trenchChannel(scroll: number): Model3D`
  - `export const TRENCH_HALF_W: number` — floor/wall rails at `x = ±TRENCH_HALF_W`
  - `export const TRENCH_WALL_H: number` — wall top at `y = TRENCH_WALL_H`
  - `export const RIB_Z: number` — rib spacing and the scroll period
  - `export const TRENCH_FAR: number` — far cutoff (`z ≈ -TRENCH_FAR`)

- [ ] **Step 1: Write the failing test**

Create `tests/core/trench-channel.test.ts` (mirrors `surface-grid.test.ts`; references constants by name):

```ts
// tests/core/trench-channel.test.ts
//
// Deliverable B (ADR 0002 part B) — the trench as a long WALLED CORRIDOR, not the
// flat 512x384 TRENCH tile (a ~4px sliver at the vanishing point). A pure core
// generator on the y=0 floor with two side walls rising to TRENCH_WALL_H, ribbed
// every RIB_Z, recycling toward the cockpit. Mirrors surfaceGrid (story 11-5).

import { describe, it, expect } from 'vitest'
import {
  trenchChannel,
  TRENCH_HALF_W,
  TRENCH_WALL_H,
  RIB_Z,
  TRENCH_FAR,
} from '../../src/core/trench-channel'

describe('trenchChannel — a well-formed Model3D', () => {
  it('returns vertices and edges', () => {
    const c = trenchChannel(0)
    expect(typeof c.name).toBe('string')
    expect(c.vertices.length).toBeGreaterThan(0)
    expect(c.edges.length).toBeGreaterThan(0)
  })

  it('every edge indexes two distinct in-range vertices', () => {
    const c = trenchChannel(0)
    for (const [a, b] of c.edges) {
      expect(a).not.toBe(b)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(c.vertices.length)
      expect(b).toBeLessThan(c.vertices.length)
    }
  })
})

describe('trenchChannel — a walled channel (this is why it is not the flat tile)', () => {
  it('rises off the floor: it spans y=0 up to the wall top TRENCH_WALL_H', () => {
    const ys = trenchChannel(0).vertices.map((v) => v[1])
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBeCloseTo(TRENCH_WALL_H)
  })

  it('is a corridor exactly TRENCH_HALF_W to each side, mirror-symmetric across x=0', () => {
    const c = trenchChannel(0)
    for (const v of c.vertices) expect(Math.abs(v[0])).toBeCloseTo(TRENCH_HALF_W)
    const present = new Set(c.vertices.map((v) => `${v[0]}|${v[1]}|${v[2]}`))
    for (const v of c.vertices) {
      expect(present.has(`${-v[0]}|${v[1]}|${v[2]}`)).toBe(true)
    }
  })

  it('runs from the cockpit (z≈0) out to the far cutoff (z≈-TRENCH_FAR)', () => {
    const zs = trenchChannel(0).vertices.map((v) => v[2])
    expect(Math.max(...zs)).toBeCloseTo(0)
    expect(Math.min(...zs)).toBeCloseTo(-TRENCH_FAR)
  })
})

describe('trenchChannel — pure, deterministic, recycling', () => {
  it('returns identical geometry for identical scroll', () => {
    expect(trenchChannel(0)).toEqual(trenchChannel(0))
    expect(trenchChannel(137.5)).toEqual(trenchChannel(137.5))
  })

  it('recycles by scroll mod RIB_Z: trenchChannel(s) === trenchChannel(s + RIB_Z)', () => {
    for (const s of [0, RIB_Z / 3, 1.0, RIB_Z * 2.25]) {
      expect(trenchChannel(s)).toEqual(trenchChannel(s + RIB_Z))
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- trench-channel`
Expected: FAIL — `Cannot find module '../../src/core/trench-channel'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/trench-channel.ts`:

```ts
// src/core/trench-channel.ts
//
// Deliverable B (ADR 0002 part B) — the Death Star trench as a long WALLED CORRIDOR.
//
// TRENCH (Obj_Trench_Squares) is a single flat 512x384 floor tile: from the cockpit
// skim it projects to a ~4px sliver at the vanishing point — no length, no walls, no
// channel. This replaces it for the trench SCENE only (the model stays in the
// registry, still shown on the model contact sheet) with a ribbed canyon on the y=0
// floor that recedes to a far cutoff and scrolls toward the cockpit.
//
// PURE core, exactly like surfaceGrid (story 11-5): deterministic, no DOM/time/
// randomness, unit-tested (wall envelope, ±X symmetry, length, scroll recycling).
// The shell only strokes the returned Model3D through drawWireframe and skims the
// camera just above the floor.

import type { Vec3 } from './math3d'
import type { Model3D } from './models'

/** Half-width of the channel: floor rails and wall bases sit at x = ±this. */
export const TRENCH_HALF_W = 256
/** Height of the side walls: their tops run at y = this. */
export const TRENCH_WALL_H = 400
/** Spacing between the lateral ribs — also the scroll period. */
export const RIB_Z = 500
/** Far cutoff: the channel recedes from the cockpit out to z ≈ -TRENCH_FAR. */
export const TRENCH_FAR = 6000

/**
 * A long walled channel on the y=0 floor, scrolled toward the cockpit by `scroll`.
 *
 * - Longitudinal rails at x = ±TRENCH_HALF_W, one on the floor (y=0) and one at the
 *   wall top (y=TRENCH_WALL_H), each spanning cockpit → far cutoff. They are static
 *   under z-scroll (sliding a line along its own −Z looks identical), so only the
 *   ribs move.
 * - Ribs every RIB_Z: each a U across the channel — a floor segment left→right plus
 *   a vertical up each wall (0 → TRENCH_WALL_H) — advanced toward the camera by
 *   `scroll mod RIB_Z` so the corridor rushes past and recycles every RIB_Z
 *   (trenchChannel(s) ≡ trenchChannel(s + RIB_Z)).
 */
export function trenchChannel(scroll: number): Model3D {
  const vertices: Vec3[] = []
  const edges: [number, number][] = []

  // Longitudinal rails: floor (y=0) and wall-top (y=TRENCH_WALL_H) at each side.
  for (const x of [-TRENCH_HALF_W, TRENCH_HALF_W]) {
    for (const y of [0, TRENCH_WALL_H]) {
      const near = vertices.push([x, y, 0]) - 1
      const far = vertices.push([x, y, -TRENCH_FAR]) - 1
      edges.push([near, far])
    }
  }

  // Ribs across the channel, recycling toward the camera every RIB_Z. The modulo
  // keeps `offset` in [0, RIB_Z) for any scroll (incl. negative).
  const offset = ((scroll % RIB_Z) + RIB_Z) % RIB_Z
  const ribCount = Math.round(TRENCH_FAR / RIB_Z)
  for (let k = 0; k <= ribCount; k++) {
    const z = -k * RIB_Z + offset
    const fl = vertices.push([-TRENCH_HALF_W, 0, z]) - 1
    const fr = vertices.push([TRENCH_HALF_W, 0, z]) - 1
    const wl = vertices.push([-TRENCH_HALF_W, TRENCH_WALL_H, z]) - 1
    const wr = vertices.push([TRENCH_HALF_W, TRENCH_WALL_H, z]) - 1
    edges.push([fl, fr]) // floor rib across the channel
    edges.push([fl, wl]) // left wall vertical
    edges.push([fr, wr]) // right wall vertical
  }

  return { name: 'Trench Channel', vertices, edges }
}
```

> Note on the recycling test: the near/far rails span `z: 0 → -TRENCH_FAR` independent of scroll, and the ribs are placed by `offset` (= `scroll mod RIB_Z`) with a fixed `ribCount`, so `trenchChannel(s)` and `trenchChannel(s + RIB_Z)` produce identical vertex/edge arrays — the `toEqual` holds exactly, as it does for `surfaceGrid`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- trench-channel`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/core/trench-channel.ts tests/core/trench-channel.test.ts
git commit -m "feat(trench-channel): add pure walled-corridor generator (ADR 0002 part B)"
```

---

### Task 4: The `trenchScrollZ` accumulator (state + sim)

**Files:**
- Modify: `src/core/state.ts` (add field to `GameState`; seed in `initialState`)
- Modify: `src/core/sim.ts` (advance in `stepTrench`; reset in `enterPhase`)
- Test: `tests/core/trench-scroll.test.ts`

**Interfaces:**
- Consumes: `stepGame`, `enterPhase` from `src/core/sim.ts`; `initialState`, `TRENCH_SCROLL_SPEED`, `EXHAUST_PORT_DISTANCE` from `src/core/state.ts`; `NO_INPUT` from `src/core/input.ts`.
- Produces: `GameState.trenchScrollZ: number` — advanced by `TRENCH_SCROLL_SPEED·dt` while a port is scrolling in the trench, reset to 0 on every `enterPhase`, seeded to 0 by `initialState`. Read `mod RIB_Z` by `trenchChannel` (wired in Task 5).

- [ ] **Step 1: Write the failing test**

Create `tests/core/trench-scroll.test.ts` (mirrors the `surfaceScrollZ` block of `surface-grid.test.ts`):

```ts
// tests/core/trench-scroll.test.ts
//
// Deliverable B — the trenchScrollZ accumulator that rushes the walled corridor
// (trench-channel.ts) past the cockpit, mirroring surfaceScrollZ (story 11-5). It
// rides the SAME flow that scrolls the exhaust port (TRENCH_SCROLL_SPEED), so the
// corridor and the port advance together; it resets on every phase entry.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TRENCH_SCROLL_SPEED,
  EXHAUST_PORT_DISTANCE,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'

describe('trenchScrollZ accumulator', () => {
  it('initialState seeds trenchScrollZ to 0', () => {
    const s = initialState()
    expect(typeof s.trenchScrollZ).toBe('number')
    expect(s.trenchScrollZ).toBe(0)
  })

  it('advances by TRENCH_SCROLL_SPEED·dt while a port is running the trench', () => {
    const s0 = enterPhase(initialState(), 'trench') // opens with a port downrange
    expect(s0.exhaustPort).not.toBeNull()
    const dt = 0.1
    const s1 = stepGame(s0, NO_INPUT, dt)
    expect(s1.trenchScrollZ).toBeCloseTo(TRENCH_SCROLL_SPEED * dt)
  })

  it('holds still when no port is active (safe hold, nothing scrolls)', () => {
    const s0 = { ...enterPhase(initialState(), 'trench'), exhaustPort: null, trenchScrollZ: 77 }
    const s1 = stepGame(s0, NO_INPUT, 0.1)
    expect(s1.trenchScrollZ).toBe(77)
  })

  it('resets trenchScrollZ to 0 on entering any phase', () => {
    const dirty = { ...initialState(1983), trenchScrollZ: 555 }
    expect(enterPhase(dirty, 'trench').trenchScrollZ).toBe(0)
    expect(enterPhase(dirty, 'space').trenchScrollZ).toBe(0)
    expect(enterPhase(dirty, 'surface').trenchScrollZ).toBe(0)
  })

  it('accumulates deterministically for a fixed seed', () => {
    let a = enterPhase(initialState(7), 'trench')
    let b = enterPhase(initialState(7), 'trench')
    for (let i = 0; i < 5; i++) {
      a = stepGame(a, NO_INPUT, 0.1)
      b = stepGame(b, NO_INPUT, 0.1)
    }
    expect(a.trenchScrollZ).toBe(b.trenchScrollZ)
    // sanity: it moved less than the port's total travel toward the cockpit
    expect(a.trenchScrollZ).toBeLessThan(EXHAUST_PORT_DISTANCE)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- trench-scroll`
Expected: FAIL — `trenchScrollZ` is `undefined` (not on `GameState`), so the `toBe(0)` and `toBeCloseTo(...)` assertions fail.

- [ ] **Step 3a: Add the field to `GameState` and seed it**

In `src/core/state.ts`, in the `GameState` interface, immediately after the `surfaceScrollZ` field (currently ends at line ~274), add:

```ts
  /** How far the trench channel has scrolled toward the cockpit (Wave 3). Advanced
   * by TRENCH_SCROLL_SPEED — the SAME flow that scrolls the exhaust port — so the
   * corridor and the port rush past together; read `mod RIB_Z` by trenchChannel and
   * reset to 0 on every phase entry (mirrors surfaceScrollZ, story 11-5). */
  trenchScrollZ: number
```

In `initialState()`, immediately after `surfaceScrollZ: 0,` add:

```ts
    trenchScrollZ: 0,
```

- [ ] **Step 3b: Reset it in `enterPhase`**

In `src/core/sim.ts`, in `enterPhase` (the returned object, after `surfaceScrollZ: 0,` at line ~506), add:

```ts
    // Reset the trench scroll on every phase entry so a fresh (or jumped) trench
    // always opens with the corridor anchored at the cockpit (mirrors surfaceScrollZ).
    trenchScrollZ: 0,
```

- [ ] **Step 3c: Advance it in `stepTrench`**

In `src/core/sim.ts` `stepTrench` (lines ~396–442): the safe-hold early-return
(`if (state.exhaustPort === null) return base`) already leaves `trenchScrollZ`
untouched via the `...state` in `base`. After that guard, compute the advanced value
once, and thread it through the two scrolling return paths.

After the line that builds `port` (the `const port: Vec3 = [...]` block, ends ~line 412), add:

```ts
  // The corridor rushes past at the same rate the port scrolls in, so the walls and
  // the target advance together (mirrors surfaceScrollZ riding the turret scroll).
  const trenchScrollZ = state.trenchScrollZ + TRENCH_SCROLL_SPEED * dt
```

In the port-reaches-cockpit crash return (currently `return { ...base, lives, gameOver: ..., mode: ..., exhaustPort: spawnPort() }`, lines ~431–437), add `trenchScrollZ,`:

```ts
    return {
      ...base,
      lives,
      gameOver: lives <= 0,
      mode: lives <= 0 ? 'gameover' : state.mode,
      exhaustPort: spawnPort(), // another pass down the trench
      trenchScrollZ,
    }
```

In the normal keep-scrolling return (currently `return { ...base, exhaustPort: { pos: port } }`, line ~441), add `trenchScrollZ`:

```ts
  return { ...base, exhaustPort: { pos: port }, trenchScrollZ }
```

> The exhaust-port HIT path returns `clearRun(...)` → `enterPhase(s, 'space')`, which resets `trenchScrollZ` to 0 (Step 3b) — correct: the run cleared and looped to the next wave's space phase.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- trench-scroll`
Expected: PASS (all cases).

Then run the FULL suite to catch any GameState literal that now needs the new field
(strict mode flags a missing required property):

Run: `npm test`
Expected: PASS. If a test constructs a bare `GameState` literal without spreading
`initialState()` and fails to type-check, add `trenchScrollZ: 0` to that literal.
(Also run `npx tsc --noEmit` to surface any such literal that vitest's esbuild skips.)

- [ ] **Step 5: Commit**

```bash
git add src/core/state.ts src/core/sim.ts tests/core/trench-scroll.test.ts
git commit -m "feat(trench-channel): add trenchScrollZ accumulator (advance in trench, reset on phase entry)"
```

---

### Task 5: Render the corridor (swap the flat tile in `render.ts`)

**Files:**
- Modify: `src/shell/render.ts` (import `trenchChannel`; draw it in the trench phase; drop the now-dead `TRENCH` import + unused `floor`)
- Test: `tests/shell/render.trench-channel.test.ts`

**Interfaces:**
- Consumes: `trenchChannel`, `TRENCH_WALL_H` from `src/core/trench-channel.ts`; `render` from `src/shell/render.ts`; `enterPhase` from `src/core/sim.ts`; `initialState` from `src/core/state.ts`; `TRENCH` from `src/core/models.ts` (test only, to assert it is NOT drawn).
- Produces: the trench phase renders `trenchChannel(state.trenchScrollZ)` (a walled model with `y>0` vertices) instead of the flat `TRENCH` tile.

- [ ] **Step 1: Write the failing test**

Create `tests/shell/render.trench-channel.test.ts` (mirrors `render.surface-grid.test.ts`):

```ts
// tests/shell/render.trench-channel.test.ts
//
// Deliverable B — the trench phase renders the WALLED CORRIDOR (trench-channel.ts),
// not the flat TRENCH tile. RED until render.ts swaps the draw. This pins the swap
// MECHANISM (which model the trench phase draws), not the pixels — the corridor's
// exact width/height read only by EYEBALL on /scenes.html (the repo's render
// convention; the same unverified-render gap that let the sliver ship in 11-1/11-2).
//
// drawWireframe is mocked; the rest of the wireframe module stays real via
// importOriginal so render() runs normally and only the draw targets are observed.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/shell/wireframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shell/wireframe')>()
  return { ...actual, drawWireframe: vi.fn() }
})

import { drawWireframe } from '../../src/shell/wireframe'
import { render } from '../../src/shell/render'
import { initialState } from '../../src/core/state'
import { enterPhase } from '../../src/core/sim'
import { TRENCH } from '../../src/core/models'

const W = 800
const H = 600

/** Minimal node-side canvas-context stub — render() only needs these to no-op.
 *  Mirrors the established shell-test idiom (render.surface-grid.test.ts). */
function makeCtx(): CanvasRenderingContext2D {
  const ctx = {
    fillStyle: '', strokeStyle: '', shadowColor: '', shadowBlur: 0, lineWidth: 0,
    font: '700 18px monospace', textAlign: '', textBaseline: '', letterSpacing: '',
    globalCompositeOperation: '',
    fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, moveTo() {},
    lineTo() {}, stroke() {}, save() {}, restore() {}, fillText() {}, arc() {},
  }
  return ctx as unknown as CanvasRenderingContext2D
}

const trenchScene = { ...enterPhase(initialState(1983), 'trench'), mode: 'playing' as const }

describe('the trench phase renders the walled corridor, not the flat tile', () => {
  beforeEach(() => {
    vi.mocked(drawWireframe).mockClear()
  })

  it('does NOT draw the flat TRENCH tile in the trench phase', () => {
    render(makeCtx(), trenchScene, W, H)
    const names = vi.mocked(drawWireframe).mock.calls.map((c) => c[1].name)
    expect(names.length).toBeGreaterThan(0) // the scene actually drew something
    expect(names).not.toContain(TRENCH.name) // 'Trench' — the retired flat tile
  })

  it('draws a walled channel: a model whose vertices rise off the y=0 floor', () => {
    render(makeCtx(), trenchScene, W, H)
    const models = vi.mocked(drawWireframe).mock.calls.map((c) => c[1])
    const walled = models.find(
      (m) => m.vertices.length > 0 && m.vertices.some((v) => v[1] > 0),
    )
    expect(walled).toBeDefined() // walls exist (the flat tile was entirely y=0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- render.trench-channel`
Expected: FAIL — the trench phase still draws `TRENCH` (name `'Trench'`, all vertices y=0), so both assertions fail.

- [ ] **Step 3: Swap the draw in `render.ts`**

In `src/shell/render.ts`:

(a) Add the import after the `surfaceGrid` import (line 28):

```ts
import { trenchChannel } from '../core/trench-channel'
```

(b) Remove `TRENCH,` from the models import block (lines 20–27) — its only code use is the draw being replaced (the line-69 mention is a comment). The block becomes:

```ts
import {
  TIE_FIGHTER,
  DEATH_STAR_SURFACE,
  DEATH_STAR,
  SURFACE_TOWER,
  EXHAUST_PORT,
} from '../core/models'
```

(c) In the `state.phase === 'trench'` branch (lines ~221–229), draw the channel in
world space (like `surfaceGrid`, it needs only the camera `view`) and destructure
only `port` (dropping the now-unused `floor`, which `noUnusedLocals` would reject):

```ts
  } else if (state.phase === 'trench') {
    // Wave 3 — the trench run. The corridor is a procedural walled channel (ADR 0002
    // part B), authored in world space on the y=0 floor and scrolled toward the
    // cockpit via trenchScrollZ; the camera (skimming just above the floor) is the
    // only transform — exactly like the surface grid. The exhaust port keeps its own
    // sim scroll and is seated in the floor at channel centre.
    const { port } = trenchPlacement(state)
    drawWireframe(ctx, trenchChannel(state.trenchScrollZ), view, proj, w, h, SURFACE_GLOW)
    if (state.exhaustPort) {
      drawWireframe(ctx, EXHAUST_PORT, multiply(view, modelMatrix(port, TRENCH_ORIENT)), proj, w, h, PORT_GLOW)
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- render.trench-channel`
Expected: PASS (both cases).

Then confirm the whole build is clean (the removed `TRENCH` import must leave no
dangling reference; `noUnusedLocals` is strict):

Run: `npm run build`
Expected: PASS — `tsc --noEmit` clean, `vite build` succeeds.

- [ ] **Step 5: Eyeball the payoff on the scene sheet**

Run: `npm run dev`, open `http://localhost:5274/star-wars/scenes.html`.
Expected: the `trench-entry` / `mid-run` / `port-in-sight` cells now show a ribbed
walled corridor receding to the cutoff with the amber exhaust port seated in the
floor — no longer the flat sliver. Compare against the Story-1 "before".

- [ ] **Step 6: Commit**

```bash
git add src/shell/render.ts tests/shell/render.trench-channel.test.ts
git commit -m "feat(trench-channel): render the walled corridor in the trench phase"
```

---

## Self-Review

**1. Spec coverage:**
- Deliverable A (scene-sheet harness): `scenePresets.ts` (Task 1) + `sceneSheet.ts`/`scenes.html`/vite (Task 2). ✅
- Deliverable A frame set (`port-in-sight`, `trench-entry`, `mid-run` now; `lock`/`torpedoes-away` after the shot beat): the three renderable-now frames are in `SCENE_PRESETS`; the two shot-beat frames are correctly deferred with Deliverable C. ✅
- Deliverable B (trench corridor): `trenchChannel` generator (Task 3), `trenchScrollZ` accumulator (Task 4), render swap (Task 5), old `TRENCH` retired-not-deleted (kept in registry, dropped from the scene). ✅
- Deliverable C (shot beat): explicitly out of scope for this plan (its own spec/plan). ✅ (matches the spec's own recommendation)
- Constraints honored: purity (all generators/presets pure core, tool is shell-only), zero new deps, `render()`/`drawWireframe` reused verbatim, TDD on core. ✅

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code; every test step contains the actual test; commands have expected output. ✅

**3. Type consistency:** `ScenePreset`/`SCENE_PRESETS`, `trenchChannel(scroll: number): Model3D` with `TRENCH_HALF_W`/`TRENCH_WALL_H`/`RIB_Z`/`TRENCH_FAR`, and `GameState.trenchScrollZ: number` are named identically across their producing task, the render wiring, and the tests. `render(ctx, state, w, h)` matches the real signature (`highScores` defaults to `[]`). `cellRects(w, h, count, cols)` matches `modelView.ts`. ✅

**Note on sprint tracking (PM):** these are new star-wars roadmap stories (harness, corridor) — the sprint currently reads 631/631, so add them under the star-wars epic before Dev picks them up, and assign the commit scopes their story numbers at that point.
