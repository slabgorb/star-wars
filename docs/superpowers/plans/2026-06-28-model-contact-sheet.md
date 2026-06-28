# Model Contact Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone `/models.html` page that renders every entry of the `MODELS` registry in a grid of auto-rotating cells, drawn through the same projection + glow pipeline the game uses.

**Architecture:** Extract the private wireframe-draw routine + glow-colour map out of `src/shell/render.ts` into a shared `src/shell/wireframe.ts`, so the game renderer and the new tool stroke geometry through one code path (the preview can't drift from gameplay). Add a pure, unit-tested `src/core/modelView.ts` for framing/layout math, and a DOM entry `src/tools/contactSheet.ts` wired to a second Vite page.

**Tech Stack:** TypeScript (strict), Vite 8 (multi-page), Vitest 4 (node env), Canvas 2D.

## Global Constraints

- Repo: `star-wars`. Branch: `feat/contact-sheet-model-preview` (off `develop`). The in-flight story 8-10 `models.ts` edit is **stashed** ("8-10 green wip (models.ts)") — do not pop it on this branch.
- Pure-core rule: `src/core/**` has no DOM, no time, no randomness. `modelView.ts` obeys this.
- TS config: `strict: true`, `noUnusedLocals: true` (prune unused imports or `tsc` fails), no `noUncheckedIndexedAccess` (so `Record<string,string>` index returns `string`).
- Build/lint command: `npm run build` = `tsc --noEmit && vite build`. Test: `npm test` = `vitest run`. Run all commands from inside `star-wars/`.
- Visual fidelity: do NOT re-implement projection/glow in the tool — reuse `drawWireframe`.
- Model glow colours (single source of truth, by `Model3D.name`): `TIE Fighter`/`Darth Vader TIE`/`Surface Tower` → `#ff3b30`; `Death Star Surface`/`Trench` → `#5a6b8c`; `Exhaust Port` → `#ff9f0a`.

---

### Task 1: Pure framing/layout math (`core/modelView.ts`)

**Files:**
- Create: `src/core/modelView.ts`
- Test: `tests/core/modelView.test.ts`

**Interfaces:**
- Consumes: `Model3D` from `src/core/models.ts`, `Vec3` from `src/core/math3d.ts`.
- Produces:
  - `modelBounds(model: Model3D): { center: Vec3; radius: number }`
  - `fitDistance(radius: number, fovY: number): number`
  - `cellRects(w: number, h: number, count: number, cols: number): { x: number; y: number; w: number; h: number }[]`

- [ ] **Step 1: Write the failing test**

Create `tests/core/modelView.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { modelBounds, fitDistance, cellRects } from '../../src/core/modelView'
import { CUBE } from '../../src/core/models'
import type { Model3D } from '../../src/core/models'

describe('modelBounds', () => {
  it('centres the unit cube at the origin with the corner radius', () => {
    const { center, radius } = modelBounds(CUBE)
    expect(center[0]).toBeCloseTo(0)
    expect(center[1]).toBeCloseTo(0)
    expect(center[2]).toBeCloseTo(0)
    expect(radius).toBeCloseTo(Math.sqrt(0.75)) // half space-diagonal of a 1×1×1 cube
  })

  it('finds the AABB centre of an off-origin model', () => {
    const m: Model3D = { name: 't', vertices: [[0, 0, 0], [10, 4, -2]], edges: [] }
    expect(modelBounds(m).center).toEqual([5, 2, -1])
  })
})

describe('fitDistance', () => {
  it('grows with radius', () => {
    expect(fitDistance(200, Math.PI / 3)).toBeGreaterThan(fitDistance(100, Math.PI / 3))
  })
  it('is finite and positive for a degenerate (zero-radius) model', () => {
    const d = fitDistance(0, Math.PI / 3)
    expect(Number.isFinite(d)).toBe(true)
    expect(d).toBeGreaterThan(0)
  })
})

describe('cellRects', () => {
  it('returns one rect per item', () => {
    expect(cellRects(900, 600, 6, 3)).toHaveLength(6)
  })
  it('lays items out row-major across the given columns', () => {
    const r = cellRects(900, 600, 6, 3) // 3 cols × 2 rows ⇒ 300×300 cells
    expect(r[0]).toEqual({ x: 0, y: 0, w: 300, h: 300 })
    expect(r[2]).toEqual({ x: 600, y: 0, w: 300, h: 300 })
    expect(r[3]).toEqual({ x: 0, y: 300, w: 300, h: 300 })
    expect(r[5]).toEqual({ x: 600, y: 300, w: 300, h: 300 })
  })
  it('covers the full width with no gaps', () => {
    const r = cellRects(800, 600, 4, 2)
    expect(r[1].x + r[1].w).toBeCloseTo(800)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- modelView`
Expected: FAIL — `Failed to resolve import "../../src/core/modelView"` (module not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/core/modelView.ts`:

```ts
// src/core/modelView.ts
//
// Pure framing/layout math for the model contact sheet (tools/contactSheet.ts):
// bounding spheres, fit-to-cell camera distance, and grid partitioning. No DOM,
// no time, no randomness — safe under the core's purity rule and unit-tested.

import type { Model3D } from './models'
import type { Vec3 } from './math3d'

/** Bounding sphere of a model's vertices: AABB centre + farthest-vertex radius. */
export function modelBounds(model: Model3D): { center: Vec3; radius: number } {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const [x, y, z] of model.vertices) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  const center: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
  let radius = 0
  for (const [x, y, z] of model.vertices) {
    const dx = x - center[0], dy = y - center[1], dz = z - center[2]
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d > radius) radius = d
  }
  return { center, radius }
}

/**
 * Camera distance (along -z) at which a sphere of `radius` subtends ~FILL of the
 * vertical FOV — i.e. frames the model to its cell. A degenerate radius is
 * clamped so a single-point model still yields a positive distance.
 */
export function fitDistance(radius: number, fovY: number): number {
  const FILL = 0.7 // fraction of the vertical FOV the model should subtend
  const r = Math.max(radius, 1e-3)
  return r / Math.tan((fovY * FILL) / 2)
}

/** Partition a w×h area into `count` grid cells across `cols` columns (row-major). */
export function cellRects(
  w: number,
  h: number,
  count: number,
  cols: number,
): { x: number; y: number; w: number; h: number }[] {
  const c = Math.max(1, cols)
  const rows = Math.max(1, Math.ceil(count / c))
  const cw = w / c
  const ch = h / rows
  const rects: { x: number; y: number; w: number; h: number }[] = []
  for (let i = 0; i < count; i++) {
    rects.push({ x: (i % c) * cw, y: Math.floor(i / c) * ch, w: cw, h: ch })
  }
  return rects
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- modelView`
Expected: PASS (4 test files' `modelView` blocks green; 8 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/core/modelView.ts tests/core/modelView.test.ts
git commit -m "feat(contact-sheet): pure model framing + grid-layout math

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Shared wireframe module + render refactor (`shell/wireframe.ts`)

**Files:**
- Create: `src/shell/wireframe.ts`
- Test: `tests/shell/wireframe.test.ts`
- Modify: `src/shell/render.ts` (imports at top; colour consts ~22-29 & ~54; call sites at lines 92/99/106/108/111; delete local `project` ~130-134 and `drawModelAt` ~136-162)

**Interfaces:**
- Consumes: `Model3D` (`core/models`); `transform`, `add`, `IDENTITY`, `Mat4`, `Vec3` (`core/math3d`).
- Produces (all from `shell/wireframe.ts`):
  - `NEAR: number`, `FAR: number`
  - `GLOW_FOR: Record<string, string>`, `DEFAULT_GLOW: string`
  - `project(p: Vec3, proj: Mat4, w: number, h: number): [number, number] | null`
  - `drawWireframe(ctx: CanvasRenderingContext2D, m: Model3D, pos: Vec3, proj: Mat4, w: number, h: number, color: string, orient?: Mat4): void`

- [ ] **Step 1: Write the failing test**

Create `tests/shell/wireframe.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { drawWireframe, project, GLOW_FOR } from '../../src/shell/wireframe'
import { perspective, IDENTITY } from '../../src/core/math3d'
import { CUBE } from '../../src/core/models'

// Minimal canvas-context stub recording the segments drawn, so we can assert the
// routine projects + strokes without a real DOM canvas (vitest runs in node).
function makeCtx() {
  const segments: number[][] = []
  let pen: number[] = []
  const ctx = {
    lineWidth: 0, strokeStyle: '', shadowColor: '', shadowBlur: 0,
    beginPath() {},
    moveTo(x: number, y: number) { pen = [x, y] },
    lineTo(x: number, y: number) { segments.push([pen[0], pen[1], x, y]) },
    stroke() {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segments }
}

describe('project', () => {
  const proj = perspective(Math.PI / 3, 1, 1, 5000)
  it('returns null for a point at/behind the camera', () => {
    expect(project([0, 0, 0], proj, 100, 100)).toBeNull()
    expect(project([0, 0, 5], proj, 100, 100)).toBeNull()
  })
  it('projects a centred point in front to the viewport centre', () => {
    const p = project([0, 0, -10], proj, 100, 100)
    expect(p).not.toBeNull()
    expect(p![0]).toBeCloseTo(50)
    expect(p![1]).toBeCloseTo(50)
  })
})

describe('drawWireframe', () => {
  const proj = perspective(Math.PI / 3, 1, 1, 5000)
  it('strokes one segment per edge when the whole model is in front', () => {
    const { ctx, segments } = makeCtx()
    drawWireframe(ctx, CUBE, [0, 0, -5], proj, 100, 100, '#fff', IDENTITY)
    expect(segments.length).toBe(CUBE.edges.length)
  })
  it('skips edges straddling the near plane (some, not all)', () => {
    const { ctx, segments } = makeCtx()
    // pos z=-1.2 ⇒ cube world z ∈ [-1.7,-0.7]; front verts (≥ -NEAR) are culled.
    drawWireframe(ctx, CUBE, [0, 0, -1.2], proj, 100, 100, '#fff', IDENTITY)
    expect(segments.length).toBeGreaterThan(0)
    expect(segments.length).toBeLessThan(CUBE.edges.length)
  })
})

describe('GLOW_FOR', () => {
  it('maps a registry model name to a hex colour', () => {
    expect(GLOW_FOR['TIE Fighter']).toMatch(/^#/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- wireframe`
Expected: FAIL — `Failed to resolve import "../../src/shell/wireframe"`.

- [ ] **Step 3: Create the shared module**

Create `src/shell/wireframe.ts`:

```ts
// src/shell/wireframe.ts
//
// Shared wireframe draw routine + per-model glow config, extracted from
// render.ts so the in-game renderer AND the model contact sheet
// (tools/contactSheet.ts) stroke geometry through the SAME code — the preview
// can never drift from how a model actually reads in play.
//
// Render/shell-only (touches a canvas context). The pure core never imports it.

import type { Model3D } from '../core/models'
import { transform, add, IDENTITY, type Mat4, type Vec3 } from '../core/math3d'

// Camera clip planes — shared by project() and any perspective() the caller builds.
export const NEAR = 1
export const FAR = 5000

// Per-model gameplay glow colour: the single source of truth for both the game
// renderer and the contact sheet. Keyed by Model3D.name.
export const GLOW_FOR: Record<string, string> = {
  'TIE Fighter': '#ff3b30', // enemy red
  'Darth Vader TIE': '#ff3b30', // boss TIE, enemy red
  'Death Star Surface': '#5a6b8c', // death star steel
  'Surface Tower': '#ff3b30', // surface turret red
  'Trench': '#5a6b8c', // death star steel
  'Exhaust Port': '#ff9f0a', // target amber
}

// Neutral fallback for a model not listed above.
export const DEFAULT_GLOW = '#00e5ff'

/** Project a world point to screen pixels, or null if it is behind the camera. */
export function project(p: Vec3, proj: Mat4, w: number, h: number): [number, number] | null {
  if (p[2] >= -NEAR) return null // at or behind the cockpit
  const ndc = transform(proj, p)
  return [(ndc[0] * 0.5 + 0.5) * w, (-ndc[1] * 0.5 + 0.5) * h]
}

/**
 * Orient a model, place it at `pos`, project its edges, and stroke them with the
 * vector-CRT glow. `orient` is applied to each vertex BEFORE translation, so the
 * caller may pass a composed matrix (e.g. spin ∘ display-orient ∘ recentre).
 */
export function drawWireframe(
  ctx: CanvasRenderingContext2D,
  m: Model3D,
  pos: Vec3,
  proj: Mat4,
  w: number,
  h: number,
  color: string,
  orient: Mat4 = IDENTITY,
): void {
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.beginPath()
  for (const [a, b] of m.edges) {
    const pa = project(add(transform(orient, m.vertices[a]), pos), proj, w, h)
    const pb = project(add(transform(orient, m.vertices[b]), pos), proj, w, h)
    if (!pa || !pb) continue
    ctx.moveTo(pa[0], pa[1])
    ctx.lineTo(pb[0], pb[1])
  }
  ctx.stroke()
  ctx.shadowBlur = 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- wireframe`
Expected: PASS (5 assertions).

- [ ] **Step 5: Refactor `render.ts` to use the shared module**

In `src/shell/render.ts`:

1. Replace the math3d import (drop `transform`, now only used inside `wireframe.ts`):

```ts
import { perspective, add, rotationZ, IDENTITY, type Mat4, type Vec3 } from '../core/math3d'
```

2. Add directly below the math3d import:

```ts
import { project, drawWireframe, GLOW_FOR, NEAR, FAR } from './wireframe'
```

3. Replace the model-colour consts and delete the local `NEAR`/`FAR` (keep `GLOW`, `BOLT_GLOW`, `FIRE_GLOW` as-is). The block currently reads:

```ts
const GLOW = '#00e5ff' // cockpit cyan
const TIE_GLOW = '#ff3b30' // enemy red
const TURRET_GLOW = '#ff3b30' // surface turret red
const SURFACE_GLOW = '#5a6b8c' // death star steel
const BOLT_GLOW = '#9dff00' // player laser green
const FIRE_GLOW = '#ffd60a' // enemy fireball amber
const NEAR = 1
const FAR = 5000
```

Change it to:

```ts
const GLOW = '#00e5ff' // cockpit cyan
const TIE_GLOW = GLOW_FOR['TIE Fighter'] // enemy red (shared)
const TURRET_GLOW = GLOW_FOR['Surface Tower'] // surface turret red (shared)
const SURFACE_GLOW = GLOW_FOR['Death Star Surface'] // death star steel (shared)
const BOLT_GLOW = '#9dff00' // player laser green
const FIRE_GLOW = '#ffd60a' // enemy fireball amber
```

4. Replace the `PORT_GLOW` const (currently `const PORT_GLOW = '#ff9f0a' // exhaust-port target amber`):

```ts
const PORT_GLOW = GLOW_FOR['Exhaust Port'] // exhaust-port target amber (shared)
```

5. Rename all five `drawModelAt(` call sites to `drawWireframe(` (lines ~92, 99, 106, 108, 111). Arguments are unchanged. Example:

```ts
    drawModelAt(ctx, DEATH_STAR_SURFACE, floor, proj, w, h, SURFACE_GLOW, SURFACE_ORIENT)
```

becomes

```ts
    drawWireframe(ctx, DEATH_STAR_SURFACE, floor, proj, w, h, SURFACE_GLOW, SURFACE_ORIENT)
```

6. Delete the now-duplicated local `project` function (the `function project(...) { ... }` block) and the local `drawModelAt` function (the `function drawModelAt(...) { ... }` block) entirely — both now live in `wireframe.ts`. `drawSpark` keeps calling the imported `project`.

- [ ] **Step 6: Verify the whole suite + type-check stay green**

Run: `npm run build && npm test`
Expected: `tsc --noEmit` clean (no unused `transform`, no missing `NEAR`/`FAR`), `vite build` succeeds, and ALL existing tests pass (no behaviour change — same glow colours, same draw routine).

- [ ] **Step 7: Commit**

```bash
git add src/shell/wireframe.ts tests/shell/wireframe.test.ts src/shell/render.ts
git commit -m "refactor(render): extract shared drawWireframe + GLOW_FOR

Single source of truth for the wireframe draw routine and per-model glow
colours, so the contact-sheet tool renders identically to gameplay. No
behaviour change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Contact-sheet page (`tools/contactSheet.ts` + `models.html` + Vite multi-page)

**Files:**
- Create: `src/tools/contactSheet.ts`
- Create: `models.html` (repo root, next to `index.html`)
- Modify: `vite.config.ts` (add `build.rollupOptions.input`)

**Interfaces:**
- Consumes: `MODELS` (`core/models`); `perspective`, `multiply`, `rotationY`, `translation`, `IDENTITY`, `Mat4`, `Vec3` (`core/math3d`); `drawWireframe`, `GLOW_FOR`, `DEFAULT_GLOW`, `NEAR`, `FAR` (`shell/wireframe`); `SURFACE_ORIENT` (`shell/render` — already exported); `modelBounds`, `fitDistance`, `cellRects` (`core/modelView`); `loadVectorFont` (`shell/font`).
- Produces: a browser page; no exported API. Verified by build + eyeball (DOM, like `render.ts`).

- [ ] **Step 1: Add the second Vite entry to `vite.config.ts`**

Add a `build` block inside the `defineConfig({ ... })` object (e.g. just before the `server` block):

```ts
  build: {
    // Multi-page: ship the game (index.html) AND the model contact sheet.
    rollupOptions: {
      input: {
        main: 'index.html',
        models: 'models.html',
      },
    },
  },
```

- [ ] **Step 2: Create `models.html`**

Create `models.html` at the repo root:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Star Wars — Model Contact Sheet</title>
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <canvas id="sheet"></canvas>
    <script type="module" src="/src/tools/contactSheet.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `src/tools/contactSheet.ts`**

```ts
// src/tools/contactSheet.ts
//
// Model contact sheet — a standalone dev page (/models.html) that renders every
// entry of the MODELS registry in a grid of auto-rotating cells, drawn through
// the SAME projection + glow pipeline the game uses (shell/wireframe.ts). It
// reads core/models.ts directly, so geometry edits appear here with no extra
// wiring — handy for eyeballing model shape, orientation, and scale.
//
//   [G]      toggle fit-to-cell (default) ↔ gameplay-distance scale
//   [SPACE]  pause / resume rotation
//
// DOM/shell tool — never imported by the deterministic core or its tests.

import { MODELS } from '../core/models'
import {
  perspective, multiply, rotationY, translation, IDENTITY, type Mat4, type Vec3,
} from '../core/math3d'
import { drawWireframe, GLOW_FOR, DEFAULT_GLOW, NEAR, FAR } from '../shell/wireframe'
import { SURFACE_ORIENT } from '../shell/render'
import { modelBounds, fitDistance, cellRects } from '../core/modelView'
import { loadVectorFont } from '../shell/font'

const FOV_Y = Math.PI / 3 // match the game camera
const COLS = 3
const SPIN_RATE = 0.6 // radians per second
const GAMEPLAY_DISTANCE = 2200 // representative engagement distance for "G" mode
const LABEL_FONT = "700 14px 'Vector Battle', 'Orbitron', monospace"
const HINT_COLOR = '#7a8699'

// Per-model display orientation, mirroring render.ts: the surface lies flat as in
// play; everything else is shown in its authored frame.
function orientFor(name: string): Mat4 {
  return name === 'Death Star Surface' ? SURFACE_ORIENT : IDENTITY
}

void loadVectorFont() // best-effort; falls back to monospace if it never lands

const canvas = document.getElementById('sheet') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let dpr = Math.min(2, window.devicePixelRatio || 1)
let W = window.innerWidth
let H = window.innerHeight

function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1)
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
}
window.addEventListener('resize', resize)
resize()

let fitToCell = true
let spinning = true
let spinAngle = 0

window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'G') {
    fitToCell = !fitToCell
  } else if (e.code === 'Space') {
    e.preventDefault()
    spinning = !spinning
  }
})

// Geometry is static — measure each model's bounding sphere once.
const bounds = MODELS.map((m) => modelBounds(m))

let last = 0
function frame(now: number): void {
  const dt = last ? (now - last) / 1000 : 0
  last = now
  if (spinning) spinAngle += SPIN_RATE * dt

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const rects = cellRects(W, H, MODELS.length, COLS)
  for (let i = 0; i < MODELS.length; i++) {
    const m = MODELS[i]
    const r = rects[i]
    const { center, radius } = bounds[i]
    const color = GLOW_FOR[m.name] ?? DEFAULT_GLOW

    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.clip()
    ctx.translate(r.x, r.y) // cell-local viewport

    const proj = perspective(FOV_Y, r.w / r.h, NEAR, FAR)
    const dist = fitToCell ? fitDistance(radius, FOV_Y) : GAMEPLAY_DISTANCE

    // vertex -> recentre -> display-orient -> spin (matrices compose right-to-left)
    const recentre = translation(-center[0], -center[1], -center[2])
    const orient = multiply(rotationY(spinAngle), multiply(orientFor(m.name), recentre))
    drawWireframe(ctx, m, [0, 0, -dist] as Vec3, proj, r.w, r.h, color, orient)

    // cell labels
    ctx.font = LABEL_FONT
    ctx.textAlign = 'left'
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 6
    ctx.fillText(m.name.toUpperCase(), 10, 22)
    ctx.fillText(`V:${m.vertices.length} E:${m.edges.length}`, 10, r.h - 12)
    ctx.shadowBlur = 0
    ctx.restore()
  }

  // footer hint
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.fillStyle = HINT_COLOR
  ctx.shadowBlur = 0
  ctx.fillText(
    `${fitToCell ? 'FIT' : 'GAMEPLAY'} SCALE   ·   [G] toggle scale   ·   [SPACE] ${spinning ? 'pause' : 'play'}`,
    W / 2,
    H - 8,
  )

  ctx.restore()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```

- [ ] **Step 4: Type-check + build (both entries)**

Run: `npm run build`
Expected: `tsc --noEmit` clean and `vite build` reports TWO HTML inputs built (`index.html` and `models.html`) with no errors.

- [ ] **Step 5: Eyeball in the dev server**

Run: `npm run dev` then open `http://localhost:5274/star-wars/models.html`.
Expected (manual check, like `render.ts` is eyeballed):
- A 3×2 grid of 6 cells, each a glowing wireframe model on black, slowly rotating.
- TIE Fighter + Darth Vader TIE read as recognisable TIE shapes (this is the 8-10 geometry — confirm rings close cleanly, no stray struts).
- Surface/Trench steel-blue, Exhaust Port amber, TIEs/Tower red.
- Press **G** → models switch to gameplay distance (relative sizes change). Press **Space** → rotation pauses/resumes.
- Resize the window → grid re-flows without distortion.

- [ ] **Step 6: Commit**

```bash
git add src/tools/contactSheet.ts models.html vite.config.ts
git commit -m "feat(contact-sheet): /models.html auto-rotating model preview grid

Renders every MODELS entry through the shared wireframe pipeline; [G]
toggles fit-to-cell vs gameplay scale, [SPACE] pauses rotation.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage**
- `/models.html` page → Task 3. ✓
- Reuse real projection + glow (no drift) → Task 2 (`wireframe.ts` extract, render refactored to it). ✓
- `wireframe.ts` (`drawWireframe`, `GLOW_FOR`) → Task 2. ✓
- `modelView.ts` (`modelBounds`, `fitDistance`, `cellRects`, pure + tested) → Task 1. ✓
- `contactSheet.ts` (grid, spin, orient, fit/gameplay) → Task 3. ✓
- Vite second entry → Task 3 Step 1–2. ✓
- Controls (G toggle, Space pause) → Task 3 Step 3. ✓
- Name + V/E counts per cell → Task 3 Step 3. ✓
- Error handling: behind-camera cull (project null) ✓; degenerate radius clamp (`fitDistance` `Math.max(radius,1e-3)`) ✓; unknown glow fallback (`?? DEFAULT_GLOW`) ✓.
- Testing: pure helpers unit-tested (Task 1), `drawWireframe`/`project` stub-tested (Task 2), canvas eyeballed (Task 3 Step 5). ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step shows complete code. ✓

**3. Type consistency:**
- `modelBounds` returns `{ center, radius }` — consumed in Task 3 as `const { center, radius } = bounds[i]`. ✓
- `fitDistance(radius, fovY)` — called `fitDistance(radius, FOV_Y)`. ✓
- `cellRects(w,h,count,cols)` → `{x,y,w,h}[]` — consumed via `r.x/r.y/r.w/r.h`. ✓
- `drawWireframe(ctx, m, pos, proj, w, h, color, orient?)` — same signature in `wireframe.ts`, render call sites, and `contactSheet.ts`. ✓
- `GLOW_FOR`/`DEFAULT_GLOW`/`NEAR`/`FAR` exported in Task 2, imported in Tasks 2 (render) & 3. ✓
- `SURFACE_ORIENT` already `export const` in `render.ts` — imported by `contactSheet.ts`. ✓
