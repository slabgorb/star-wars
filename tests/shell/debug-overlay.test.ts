// tests/shell/debug-overlay.test.ts
//
// Story 11-3 — Dev debug overlay: axes, grid, frustum, model bounds (RED phase).
//
// ADR 0001 part C: a dev-only, toggle-key overlay that draws world AXES at the
// origin, a ground GRID in y=0, the camera FRUSTUM, and each on-screen model's
// bounding SPHERE + name label (reusing core/modelView.modelBounds). It is the
// feedback loop that stops the invisible-geometry / triangle classes of bug from
// recurring (the defect that shipped through 11-1/11-2). Pure Canvas 2D, no core
// changes, no determinism impact — the overlay only READS the sim state.
//
// CONTRACT this suite asks Dev (GREEN) to implement — a new shell module
// `src/shell/debug-overlay.ts` exporting:
//
//   1. frustumCorners(fovY, aspect, near, far): Vec3[]
//        The 8 corner points of the view frustum in EYE space (camera at the
//        origin looking down -Z — the convention perspective()/viewMatrix() use).
//        Pure; the AC names it as a unit-tested helper.
//
//   2. projectBounds(centerEye, radius, proj, w, h): { x, y, r } | null
//        Project a bounding sphere (centre already carried into EYE space, radius
//        in world units) to a screen-space circle {x, y, r}, or null when the
//        centre is at/behind the near plane. Pure; the AC's other named helper.
//        It reuses wireframe.project()'s NEAR guard + NDC→pixel mapping.
//
//   3. drawDebugOverlay(ctx, state, w, h): void
//        The draw pass: axes + grid + frustum + per-model bounds & labels, layered
//        on top of render(). A SEPARATE additive pass main.ts calls only when the
//        dev toggle is on (default off, gated to import.meta.env.DEV — eyeballed,
//        not unit-tested, exactly like 11-4's phase-jump key wiring).
//
// WHY this split — the AC: "Any pure geometry helpers added (frustum corners,
// bounds projection) are unit-tested; drawing output is eyeballed in dev." So the
// two pure helpers get exact geometric contracts below; the draw pass is pinned
// only at the MECHANISM/INVARIANT altitude (draws something, a circle + label per
// model, NEVER mutates the sim, deterministic, additive). The exact axis colours,
// grid spacing, and frustum styling are EYEBALLED on the dev server (:5274), per
// the repo convention that orientation/scale/visual styling escape structural
// tests (see render.ts SURFACE_ORIENT / TIE_ORIENT notes).
//
// BOUNDARY NOTE (TEA contract decision): the pure helpers live in shell/, not
// core/. The story scope (highest spec authority) says "Build pure geometry
// helpers in src/shell/render.ts or a new src/shell/debug-overlay.ts", and these
// are overlay-specific dev helpers, not general sim math — mirroring wireframe.ts,
// which already holds the pure project()/clipToNear() shell helpers. core/ stays
// untouched; the boundary (core never imports shell) holds.
//
// Until GREEN creates src/shell/debug-overlay.ts every import below is undefined
// and the whole suite fails — the RED contract.

import { describe, it, expect } from 'vitest'
import { frustumCorners, projectBounds, drawDebugOverlay } from '../../src/shell/debug-overlay'
import { render } from '../../src/shell/render'
import { NEAR, FAR } from '../../src/shell/wireframe'
import { initialState, type GameState, type Enemy } from '../../src/core/state'
import { perspective, transform, IDENTITY, type Mat4, type Vec3 } from '@arcade/shared/math3d'

const W = 800
const H = 600

// ── canvas-context stub ──────────────────────────────────────────────────────
// Records every stroked segment (moveTo→lineTo), every arc (bounds circle), and
// every fillText (name label), so we can assert what the overlay draws without a
// real DOM canvas (vitest runs in node). Extends the render.tie-orient stub with
// arc/fillText capture for the bounds circle + label assertions.
function makeCtx() {
  const segments: number[][] = []
  const arcs: { x: number; y: number; r: number }[] = []
  const texts: string[] = []
  let pen: number[] = []
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 0,
    font: '700 18px monospace',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    globalCompositeOperation: '',
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo(x: number, y: number) {
      pen = [x, y]
    },
    lineTo(x: number, y: number) {
      segments.push([pen[0], pen[1], x, y])
    },
    stroke() {},
    save() {},
    restore() {},
    fillText(t: string) {
      texts.push(t)
    },
    arc(x: number, y: number, r: number) {
      arcs.push({ x, y, r })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segments, arcs, texts }
}

const tieAt = (pos: Vec3): Enemy => ({ pos, kind: 'tie', orient: IDENTITY })

// A space-phase run (mode 'playing') so the overlay has on-screen TIE models to
// ring. Space puts the camera at the origin looking down -Z, so a TIE in front is
// genuinely visible.
const spaceScene = (enemies: Enemy[] = []): GameState => ({
  ...initialState(1983),
  phase: 'space',
  mode: 'playing',
  enemies,
})

// ── frustumCorners — the camera's view volume in eye space (AC helper #1) ─────
describe('frustumCorners(fovY, aspect, near, far)', () => {
  const fovY = Math.PI / 3
  const aspect = 16 / 9

  it('returns exactly eight corner points (4 near + 4 far)', () => {
    const corners = frustumCorners(fovY, aspect, NEAR, FAR)
    expect(corners).toHaveLength(8)
    const near = corners.filter((c) => Math.abs(c[2] - -NEAR) < 1e-6)
    const far = corners.filter((c) => Math.abs(c[2] - -FAR) < 1e-6)
    expect(near).toHaveLength(4)
    expect(far).toHaveLength(4)
  })

  it('its corners map to the NDC cube corners under the MATCHING projection', () => {
    // This is the defining contract: the 8 points ARE the frustum that
    // perspective(fovY, aspect, near, far) defines, so each projects to a corner
    // of the NDC cube (|x|=|y|=|z|=1). Pins the helper to the real projection
    // without coupling to any particular corner ordering.
    const proj = perspective(fovY, aspect, NEAR, FAR)
    for (const c of frustumCorners(fovY, aspect, NEAR, FAR)) {
      const ndc = transform(proj, c)
      expect(Math.abs(ndc[0])).toBeCloseTo(1, 5)
      expect(Math.abs(ndc[1])).toBeCloseTo(1, 5)
      expect(Math.abs(ndc[2])).toBeCloseTo(1, 5)
    }
  })

  it('the far plane spreads wider than the near plane (perspective expansion)', () => {
    const corners = frustumCorners(fovY, aspect, NEAR, FAR)
    const nearMaxX = Math.max(...corners.filter((c) => c[2] === -NEAR).map((c) => Math.abs(c[0])))
    const farMaxX = Math.max(...corners.filter((c) => c[2] === -FAR).map((c) => Math.abs(c[0])))
    const nearMaxY = Math.max(...corners.filter((c) => c[2] === -NEAR).map((c) => Math.abs(c[1])))
    const farMaxY = Math.max(...corners.filter((c) => c[2] === -FAR).map((c) => Math.abs(c[1])))
    expect(farMaxX).toBeGreaterThan(nearMaxX)
    expect(farMaxY).toBeGreaterThan(nearMaxY)
  })

  it('honours aspect — a wide viewport widens X but not Y', () => {
    // half-height = depth·tan(fovY/2); half-width = aspect·half-height. With
    // aspect=2 the near rectangle is twice as wide as it is tall.
    const corners = frustumCorners(fovY, 2, NEAR, FAR)
    const near = corners.filter((c) => c[2] === -NEAR)
    const maxX = Math.max(...near.map((c) => Math.abs(c[0])))
    const maxY = Math.max(...near.map((c) => Math.abs(c[1])))
    expect(maxX).toBeCloseTo(2 * maxY, 6)
    // ...and Y itself matches near·tan(fovY/2), independent of aspect.
    expect(maxY).toBeCloseTo(NEAR * Math.tan(fovY / 2), 6)
  })

  it('is pure/deterministic — identical inputs yield deep-equal corners', () => {
    expect(frustumCorners(fovY, aspect, NEAR, FAR)).toEqual(frustumCorners(fovY, aspect, NEAR, FAR))
  })
})

// ── projectBounds — a bounding sphere → a screen circle (AC helper #2) ────────
describe('projectBounds(centerEye, radius, proj, w, h)', () => {
  // A square projection + square viewport so a centred point lands at (50, 50),
  // mirroring wireframe.test.ts's setup.
  const proj: Mat4 = perspective(Math.PI / 3, 1, NEAR, 5000)

  it('places a sphere dead ahead at the viewport centre with a positive radius', () => {
    const c = projectBounds([0, 0, -10], 1, proj, 100, 100)
    expect(c).not.toBeNull()
    expect(c!.x).toBeCloseTo(50)
    expect(c!.y).toBeCloseTo(50)
    expect(c!.r).toBeGreaterThan(0)
    expect(Number.isFinite(c!.r)).toBe(true)
  })

  it('returns null for a sphere centre at or behind the near plane', () => {
    expect(projectBounds([0, 0, 0], 1, proj, 100, 100)).toBeNull() // at the cockpit
    expect(projectBounds([0, 0, 5], 1, proj, 100, 100)).toBeNull() // behind it
    expect(projectBounds([0, 0, -NEAR], 1, proj, 100, 100)).toBeNull() // exactly on the plane
  })

  it('shrinks the screen circle with distance (perspective foreshortening)', () => {
    const near = projectBounds([0, 0, -20], 1, proj, 100, 100)
    const far = projectBounds([0, 0, -200], 1, proj, 100, 100)
    expect(near).not.toBeNull()
    expect(far).not.toBeNull()
    expect(far!.r).toBeLessThan(near!.r)
  })

  it('grows the screen circle with the world radius at a fixed depth', () => {
    const small = projectBounds([0, 0, -50], 1, proj, 100, 100)
    const big = projectBounds([0, 0, -50], 4, proj, 100, 100)
    expect(big!.r).toBeGreaterThan(small!.r)
  })

  it('is pure/deterministic — identical inputs yield an equal circle', () => {
    expect(projectBounds([3, -2, -40], 2, proj, 100, 100)).toEqual(
      projectBounds([3, -2, -40], 2, proj, 100, 100),
    )
  })
})

// ── drawDebugOverlay — the draw pass (mechanism + invariants) ─────────────────
describe('drawDebugOverlay(ctx, state, w, h)', () => {
  it('draws structural geometry (axes/grid/frustum) even with no models on screen', () => {
    const { ctx, segments } = makeCtx()
    drawDebugOverlay(ctx, spaceScene(), W, H)
    // Axes at the origin, the y=0 grid, and the frustum do not depend on entities,
    // so an empty scene still strokes them. (Exact lines are eyeballed in dev.)
    expect(segments.length).toBeGreaterThan(0)
  })

  it('rings each on-screen model with a bounds circle and a name label', () => {
    const { ctx, arcs, texts } = makeCtx()
    drawDebugOverlay(ctx, spaceScene([tieAt([0, 0, -1200])]), W, H)
    // One TIE in view → at least one bounds circle (ctx.arc) and a label carrying
    // the model's name (reuses modelView.modelBounds + the Model3D.name).
    expect(arcs.length).toBeGreaterThanOrEqual(1)
    expect(texts.some((t) => t.includes('TIE'))).toBe(true)
  })

  it('rings every on-screen model — more models, more bounds circles', () => {
    const one = makeCtx()
    drawDebugOverlay(one.ctx, spaceScene([tieAt([0, 0, -1200])]), W, H)
    const two = makeCtx()
    drawDebugOverlay(two.ctx, spaceScene([tieAt([0, 0, -1200]), tieAt([300, 0, -1400])]), W, H)
    expect(two.arcs.length).toBeGreaterThan(one.arcs.length)
  })

  it('is a SEPARATE additive pass — it strokes strictly more than render() alone', () => {
    const scene = spaceScene([tieAt([0, 0, -1200])])
    const base = makeCtx()
    render(base.ctx, scene, W, H)
    const withOverlay = makeCtx()
    render(withOverlay.ctx, scene, W, H)
    drawDebugOverlay(withOverlay.ctx, scene, W, H)
    // The story does not touch render(); the overlay layers ON TOP. "Off by
    // default" = main.ts simply skips this pass, leaving the scene untouched.
    expect(withOverlay.segments.length).toBeGreaterThan(base.segments.length)
  })

  it('NEVER mutates the sim state (the overlay only reads — boundary + safety)', () => {
    const scene = spaceScene([tieAt([0, 0, -1200])])
    const before = structuredClone(scene)
    const { ctx } = makeCtx()
    drawDebugOverlay(ctx, scene, W, H)
    expect(scene).toEqual(before)
  })

  it('is deterministic — identical inputs produce identical overlay geometry', () => {
    const scene = spaceScene([tieAt([0, 0, -1200])])
    const first = makeCtx()
    drawDebugOverlay(first.ctx, scene, W, H)
    const second = makeCtx()
    drawDebugOverlay(second.ctx, scene, W, H)
    expect(second.segments).toEqual(first.segments)
    expect(second.arcs).toEqual(first.arcs)
  })

  it('rings models through the SCENE camera, not screen space (a TIE dead ahead rings near centre)', () => {
    // Guard against the overlay drawing bounds in the wrong space (e.g. raw
    // screen coords, or its own invented projection): a TIE placed dead ahead must
    // ring in the central region of the viewport, where the scene actually draws
    // it. A loose quarter-viewport tolerance keeps this robust to the TIE model's
    // exact bounds centre while still failing a garbage/fixed-position ring. The
    // exact pixel placement is eyeballed in dev.
    const { ctx, arcs } = makeCtx()
    drawDebugOverlay(ctx, spaceScene([tieAt([0, 0, -1200])]), W, H)
    expect(arcs.length).toBeGreaterThanOrEqual(1)
    const centred = arcs.some(
      (a) => Math.abs(a.x - W / 2) < W / 4 && Math.abs(a.y - H / 2) < H / 4,
    )
    expect(centred).toBe(true)
  })
})
