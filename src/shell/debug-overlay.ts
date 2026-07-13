// src/shell/debug-overlay.ts
//
// Dev-only debug overlay (story 11-3, ADR 0001 part C). A toggle-key pass layered
// ON TOP of render() that draws world AXES at the origin, a y=0 ground GRID, the
// camera FRUSTUM, and each on-screen model's bounding SPHERE + name label. It is
// the feedback loop that stops the invisible-geometry / triangle classes of bug
// (the defect that shipped through 11-1/11-2) from recurring.
//
// Render/shell-only (it touches a canvas context and consumes projected
// positions). The pure core never imports it. The overlay only READS the sim
// state — it never mutates it, so toggling it on can never affect gameplay or the
// deterministic step. main.ts calls drawDebugOverlay() only when the dev toggle is
// on (default off, gated to import.meta.env.DEV — see main.ts), exactly like the
// 11-4 phase-jump keys.
//
// Two pure geometry helpers (frustumCorners, projectBounds) are unit-tested; the
// drawing itself (axis colours, grid spacing, frustum styling, label placement) is
// eyeballed on the dev server, per the AC and the repo convention that visual
// styling escapes structural tests.

import type { GameState } from '../core/state'
import type { Model3D } from '../core/models'
import {
  TIE_FIGHTER,
  DEATH_STAR_SURFACE,
  SURFACE_TOWER,
  TRENCH,
  EXHAUST_PORT,
} from '../core/models'
import { FOV_Y } from '../core/gameRules'
import { modelBounds } from '../core/modelView'
import {
  perspective,
  multiply,
  transform,
  translation,
  rotationY,
  scaling,
  type Mat4,
  type Vec3,
} from '@arcade/shared/math3d'
import { project, drawWireframe, NEAR, FAR } from './wireframe'
import {
  cameraView,
  modelMatrix,
  surfacePlacement,
  trenchPlacement,
  SURFACE_ORIENT,
  TOWER_ORIENT,
  GROUND_MODEL_SCALE,
  TRENCH_ORIENT,
  TIE_ORIENT,
} from './render'

// ── Pure geometry helpers (unit-tested) ──────────────────────────────────────

/**
 * The eight corner points of the view frustum in EYE space — the camera sits at
 * the origin looking down -Z (the convention perspective()/viewMatrix() use). At a
 * given depth `d` the visible half-height is `d·tan(fovY/2)` and the half-width is
 * `aspect·` that; the near rectangle sits at z=-near and the far at z=-far. By
 * construction each corner projects to a corner of the NDC cube (|x|=|y|=|z|=1)
 * under `perspective(fovY, aspect, near, far)` — i.e. these ARE the frustum that
 * projection defines. Returns the 4 near corners first, then the 4 far.
 */
export function frustumCorners(fovY: number, aspect: number, near: number, far: number): Vec3[] {
  const corners: Vec3[] = []
  for (const d of [near, far]) {
    const halfH = d * Math.tan(fovY / 2)
    const halfW = aspect * halfH
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        corners.push([sx * halfW, sy * halfH, -d])
      }
    }
  }
  return corners
}

/**
 * Project a bounding sphere to a screen-space circle. `centerEye` is the sphere
 * centre already carried into EYE space (view × model × centre); `radius` is its
 * world radius. Returns the screen circle `{ x, y, r }`, or `null` when the centre
 * is at/behind the near plane (reusing project()'s NEAR guard + NDC→pixel map). The
 * screen radius is the pixel distance from the projected centre to a point offset
 * one radius laterally in eye space — a perspective-correct circle that shrinks
 * with distance and grows with the world radius.
 */
export function projectBounds(
  centerEye: Vec3,
  radius: number,
  proj: Mat4,
  w: number,
  h: number,
): { x: number; y: number; r: number } | null {
  const c = project(centerEye, proj, w, h)
  if (!c) return null
  const edge = project([centerEye[0] + radius, centerEye[1], centerEye[2]], proj, w, h)
  if (!edge) return null
  const r = Math.hypot(edge[0] - c[0], edge[1] - c[1])
  return { x: c[0], y: c[1], r }
}

// ── Drawing constants (eyeballed in dev) ─────────────────────────────────────

const AXIS_LEN = 500
const AXIS_X_COLOR = '#ff4444' // X red
const AXIS_Y_COLOR = '#44ff44' // Y green
const AXIS_Z_COLOR = '#4488ff' // Z blue

const GRID_COLOR = '#335577' // dim steel
const GRID_HALF = 2000 // ±X extent
const GRID_STEP = 200 // line spacing
const GRID_DEPTH = 2000 // how far the grid recedes in -Z

// The cockpit can't see its own frustum (the eye sits at the apex), so the frustum
// is drawn as an inset gizmo: the real NEAR/FAR frustum shape, uniformly scaled
// down (shape preserved) and rotated/pushed in front of the camera so its pyramid
// reads. Pure visualisation — eyeballed.
const FRUSTUM_COLOR = '#ffaa00' // amber
const FRUSTUM_GIZMO_SCALE = 0.06
const FRUSTUM_GIZMO_YAW = 0.6
const FRUSTUM_GIZMO_PUSH = 700

const BOUNDS_COLOR = '#ff44ff' // magenta rings + labels
// Dev-only diagnostic labels stay on plain canvas text (SH2-5): model names need
// characters the caps-only shared stroke font deliberately lacks.
const OVERLAY_FONT = '12px monospace'

// ── Model builders ───────────────────────────────────────────────────────────

/** A single-segment model (one axis / one line). */
function segModel(name: string, a: Vec3, b: Vec3): Model3D {
  return { name, vertices: [a, b], edges: [[0, 1]] }
}

/** The y=0 ground grid: lines receding in -Z and lateral lines across ±X. */
function gridModel(): Model3D {
  const vertices: Vec3[] = []
  const edges: [number, number][] = []
  const line = (a: Vec3, b: Vec3): void => {
    const i = vertices.length
    vertices.push(a, b)
    edges.push([i, i + 1])
  }
  for (let x = -GRID_HALF; x <= GRID_HALF; x += GRID_STEP) line([x, 0, 0], [x, 0, -GRID_DEPTH])
  for (let z = 0; z >= -GRID_DEPTH; z -= GRID_STEP) line([-GRID_HALF, 0, z], [GRID_HALF, 0, z])
  return { name: 'grid', vertices, edges }
}

/** The camera frustum as a wireframe box: near rect, far rect, and the connectors,
 *  built from the real NEAR/FAR planes (no invented depth bounds). */
function frustumModel(aspect: number): Model3D {
  const vertices = frustumCorners(FOV_Y, aspect, NEAR, FAR)
  // frustumCorners order: near 0-3, far 4-7; within each (-,-),(-,+),(+,-),(+,+).
  const edges: [number, number][] = [
    [0, 1], [1, 3], [3, 2], [2, 0], // near rectangle
    [4, 5], [5, 7], [7, 6], [6, 4], // far rectangle
    [0, 4], [1, 5], [2, 6], [3, 7], // near→far connectors
  ]
  return { name: 'frustum', vertices, edges }
}

/**
 * The models render() draws this frame, each with its composed `view × model`
 * matrix — mirroring render.ts's per-phase draw calls exactly (same placement
 * helpers and orients) so the overlay's bounds rings land where the models
 * actually draw. Reusing render's exported `modelMatrix`/placement keeps the two
 * from drifting.
 */
function sceneModels(state: GameState, view: Mat4): { model: Model3D; mv: Mat4 }[] {
  const items: { model: Model3D; mv: Mat4 }[] = []
  if (state.phase === 'surface') {
    const { floor } = surfacePlacement()
    items.push({ model: DEATH_STAR_SURFACE, mv: multiply(view, modelMatrix(floor, SURFACE_ORIENT)) })
    for (const tu of state.turrets) {
      // sw5-5: the ground models are in raw ROM units, so the overlay must apply
      // the same presentation scale render() does or its bounds rings land 30x out.
      items.push({
        model: SURFACE_TOWER,
        mv: multiply(view, modelMatrix(tu.pos, TOWER_ORIENT, GROUND_MODEL_SCALE)),
      })
    }
  } else if (state.phase === 'trench') {
    const { floor, port } = trenchPlacement(state)
    items.push({ model: TRENCH, mv: multiply(view, modelMatrix(floor, TRENCH_ORIENT)) })
    if (state.exhaustPort) {
      items.push({ model: EXHAUST_PORT, mv: multiply(view, modelMatrix(port, TRENCH_ORIENT)) })
    }
  } else {
    for (const e of state.enemies) {
      items.push({ model: TIE_FIGHTER, mv: multiply(view, modelMatrix(e.pos, multiply(e.orient, TIE_ORIENT))) })
    }
  }
  return items
}

// ── The draw pass ────────────────────────────────────────────────────────────

/**
 * Draw the debug overlay on top of the rendered scene. Builds the SAME projection
 * and camera the scene uses (perspective(FOV_Y, w/h, NEAR, FAR) and
 * cameraView(state)), then strokes the axes, grid, frustum gizmo, and a bounds
 * ring + name label per on-screen model. Reads `state`; never mutates it.
 */
export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number,
): void {
  const aspect = w / h
  const proj = perspective(FOV_Y, aspect, NEAR, FAR)
  const view = cameraView(state)

  // 1. World axes at the origin, through the scene camera (X red, Y green, Z blue).
  drawWireframe(ctx, segModel('axis-x', [-AXIS_LEN, 0, 0], [AXIS_LEN, 0, 0]), view, proj, w, h, AXIS_X_COLOR)
  drawWireframe(ctx, segModel('axis-y', [0, -AXIS_LEN, 0], [0, AXIS_LEN, 0]), view, proj, w, h, AXIS_Y_COLOR)
  drawWireframe(ctx, segModel('axis-z', [0, 0, -AXIS_LEN], [0, 0, AXIS_LEN]), view, proj, w, h, AXIS_Z_COLOR)

  // 2. Ground grid in the y=0 plane.
  drawWireframe(ctx, gridModel(), view, proj, w, h, GRID_COLOR)

  // 3. Camera frustum — an inset, scaled, angled gizmo (the cockpit can't see its
  //    own frustum from the apex). The shape is the real NEAR/FAR frustum.
  const gizmoView = multiply(
    translation(0, 0, -FRUSTUM_GIZMO_PUSH),
    multiply(rotationY(FRUSTUM_GIZMO_YAW), scaling(FRUSTUM_GIZMO_SCALE, FRUSTUM_GIZMO_SCALE, FRUSTUM_GIZMO_SCALE)),
  )
  drawWireframe(ctx, frustumModel(aspect), gizmoView, proj, w, h, FRUSTUM_COLOR)

  // 4. Per-model bounding sphere + name label (reusing core modelBounds).
  for (const { model, mv } of sceneModels(state, view)) {
    const { center, radius } = modelBounds(model)
    const circle = projectBounds(transform(mv, center), radius, proj, w, h)
    if (!circle) continue
    ctx.lineWidth = 1
    ctx.strokeStyle = BOUNDS_COLOR
    ctx.shadowColor = BOUNDS_COLOR
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.fillStyle = BOUNDS_COLOR
    ctx.font = OVERLAY_FONT
    ctx.fillText(model.name, circle.x + 4, circle.y - circle.r - 4)
  }
}
