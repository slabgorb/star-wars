# Model Contact Sheet — Design

**Date:** 2026-06-28
**Status:** Approved (brainstorm)
**Repo:** `star-wars`

## Goal

A standalone `/models.html` page in the star-wars app that shows all entries of
the `MODELS` registry in a grid of auto-rotating cells, drawn through the **same**
projection + glow pipeline the game uses. The preview must never lie about how a
model reads in gameplay — it shares the real render code rather than
re-implementing it.

Primary motivation: vector wireframes look completely different frozen vs. in
motion, and `render.ts` already notes that orientation/scale "MUST be eyeballed."
This tool makes that eyeballing fast and side-by-side — including the
TIE_FIGHTER / DARTH_TIE geometry currently being re-authored (story 8-10).

## Non-Goals (YAGNI)

- No click-to-enlarge, no PNG export, no per-model angle sliders.
- No edge-index / vertex-index labels.
- No coupling into the shipped game loop (it is a separate page, not a debug mode).

These can be added later if the tool proves it needs them.

## The Fidelity Problem

The per-model draw logic — `project()`, `drawModelAt()`, and the per-model glow
colours (`TIE_GLOW`, `SURFACE_GLOW`, `PORT_GLOW`, …) — currently lives
**private** inside `src/shell/render.ts`. If the contact sheet re-implements
drawing, the two copies drift and the preview stops reflecting the game.

**Decision:** extract one shared module so there is a single source of truth.
`render.ts` is refactored to call it (no behaviour change); the contact sheet
calls the same function.

*Alternative considered (rejected):* merely `export` the existing functions from
`render.ts`. Less churn, but leaves the glow colours scattered and lets
`render.ts` keep growing. The extract is the cleanup a good dev does while
working in the file, and it is low-risk: `render.ts` has no unit tests and its
orientation/scale are eyeballed regardless.

## Components

### 1. `src/shell/wireframe.ts` *(new, shared)*
Pure draw-one-model routine extracted verbatim from `drawModelAt`/`project`,
plus the per-model gameplay glow-colour map.

```ts
// Project a world point to screen pixels, or null if behind the camera.
function project(p: Vec3, proj: Mat4, w: number, h: number): [number, number] | null

// Orient -> place -> project -> stroke each edge with the vector-CRT glow.
export function drawWireframe(
  ctx: CanvasRenderingContext2D,
  model: Model3D,
  pos: Vec3,
  proj: Mat4,
  w: number,
  h: number,
  color: string,
  orient?: Mat4,
): void

// Model -> the colour it is drawn with in gameplay (TIE red, surface steel,
// port amber, …). Used by both render.ts and the contact sheet.
export const GLOW_FOR: Record<string, string>
```

`render.ts` keeps its `drawModelAt` as a thin wrapper (or calls `drawWireframe`
directly) and imports `GLOW_FOR` for its colour constants. Behaviour is
unchanged.

### 2. `src/core/modelView.ts` *(new, pure, unit-tested)*
The testable geometry/layout math — no DOM, safe for the deterministic core's
purity rule.

```ts
// Object-space bounding sphere of a model's render vertices.
export function modelBounds(model: Model3D): { center: Vec3; radius: number }

// Camera distance (along -z) that frames a sphere of `radius` to fill a cell
// for the given vertical FOV.
export function fitDistance(radius: number, fovY: number): number

// Partition a w x h area into `count` grid rectangles across `cols` columns.
export function cellRects(
  w: number,
  h: number,
  count: number,
  cols: number,
): { x: number; y: number; w: number; h: number }[]
```

### 3. `src/tools/contactSheet.ts` *(new, DOM entry)*
Owns one full-window canvas and a `requestAnimationFrame` loop. Each frame:

1. Clear to black; compute `cellRects(W, H, MODELS.length, cols)`.
2. For each model + cell:
   - apply the model's gameplay display orientation (the `*_ORIENT` matrices),
   - compose with an animated `rotationY(t)` spin,
   - place at fit-to-cell distance (`fitDistance`) or, in gameplay mode, a single
     fixed reference distance shared by all cells (honest relative sizes),
   - render via `drawWireframe` using `GLOW_FOR[model.name]`,
   - draw the model name + `V:{vertices} E:{edges}` counts in the vector font.

Per-cell rendering uses `ctx.save()/translate/clip` so each cell is an isolated
mini-viewport; the projection uses each cell's own width/height for aspect.

### 4. `models.html` *(new, repo root)*
Second Vite entry that loads `src/tools/contactSheet.ts`. Added to
`vite.config.ts` `build.rollupOptions.input` (alongside the implicit
`index.html`) so `vite build` ships it too. Reachable in dev at
`http://localhost:5274/star-wars/models.html`.

## Behaviour & Controls

- All cells auto-rotate about vertical at a fixed slow rate.
- **`G`** — toggle *fit-to-cell* (default: each model normalized to fill its
  cell) ↔ *gameplay scale* (all models at one reference distance).
- **Space** — pause/resume rotation.
- Black background + glow stroke: identical visual language to the game.

## Data Flow

```
MODELS (core/models.ts)
   │
   ├─ modelBounds ─> fitDistance ─┐         (pure, core)
   │                              v
contactSheet loop ─ rotationY(t) + ORIENT ─> drawWireframe ─> canvas
   │                                            ^
cellRects ──────────────────────────────────────┘  (per-cell viewport)
```

The tool reads the **same** `MODELS` array and the **same** draw routine the game
uses, so geometry edits (e.g. the 8-10 ring re-authoring) appear in the preview
with no extra wiring.

## Error Handling

- Behind-camera vertices: `project()` already returns `null`; edges with a null
  endpoint are skipped (unchanged from current behaviour).
- Degenerate model (radius 0): `fitDistance` clamps to a small positive minimum
  so a single-point model still renders without divide-by-zero.
- Unknown model name in `GLOW_FOR`: fall back to a default neutral glow colour.

## Testing

- **Unit (Vitest):** `modelView.ts` pure helpers — `modelBounds` (known
  geometry), `fitDistance` (monotonic in radius, clamps at 0), `cellRects`
  (covers the area, correct count, row/column wrapping).
- **Eyeball (dev server):** the canvas draw loop, exactly like `render.ts` — open
  `/models.html` and confirm each model reads correctly while spinning.
- `drawWireframe` is additionally exercised indirectly by the existing game,
  which now routes through it.

## Git / Workflow

This tool is **separate** from story 8-10 (which only edits `core/models.ts`).
It will be built on its own branch off `develop` so it does not pollute the
8-10 story PR. The in-flight 8-10 `models.ts` edit is isolated (stashed or
carried) while the tool branch is built.
