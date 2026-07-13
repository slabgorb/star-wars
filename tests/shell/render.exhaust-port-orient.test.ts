// tests/shell/render.exhaust-port-orient.test.ts
//
// Story sw5-4 — RED phase (O'Brien / TEA): the re-ported port must still be VISIBLE.
//
// Re-porting EXHAUST_PORT from the ROM flips the plane it lives in, and that is the
// one way this story can ship green tests and a broken game:
//
//   authored octagon:  (x, 0, z)  — flat in the y=0 FLOOR plane
//   ROM `.WP PORT`:    (x, y, 0)  — flat in the z=0 plane, its face down the trench
//
// The shell draws the port with TRENCH_ORIENT, which is IDENTITY (render.ts). Under
// identity the ROM plate presents FACE-ON to a pilot flying down −Z: a bullseye of
// three concentric squares, exactly as the cabinet shows it. That is correct, and it
// needs no new rotation.
//
// The hazard is a well-meaning "fix". A dev who notices the port no longer lies in
// the floor may reach for a rotationX(±π/2) to put it back — and that turns the plate
// EDGE-ON to a camera that skims just above the floor, collapsing it to a horizontal
// sliver or nothing at all. The Death Star's superlaser dish shipped exactly this bug
// (sw3-10: a fine model, seated on the wrong axis, seen edge-on as a crossed spike),
// and render.ts's own comment admits the gap — "structural tests can't catch
// orientation/scale — these MUST be eyeballed". This test closes it for the port.
//
// It asserts the OBSERVABLE consequence, not a matrix: whatever transform the shell
// composes, the port must reach the screen with real extent in BOTH axes. A sliver
// fails. An invisible port fails. Any orientation that keeps the bullseye facing the
// pilot passes — so a faithful re-port is not fenced in by a matrix this test happens
// to expect.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/shell/wireframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shell/wireframe')>()
  return { ...actual, drawWireframe: vi.fn() }
})

import { drawWireframe } from '../../src/shell/wireframe'
import { render } from '../../src/shell/render'
import { initialState, type GameState } from '../../src/core/state'
import { EXHAUST_PORT, type Model3D } from '../../src/core/models'
import { transform, type Mat4 } from '@arcade/shared/math3d'

const W = 800
const H = 600

/** Minimal node-side canvas-context stub (the render.* suites' shared idiom). */
function makeCtx(): CanvasRenderingContext2D {
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
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    save() {},
    restore() {},
    fillText() {},
    arc() {},
  }
  return ctx as unknown as CanvasRenderingContext2D
}

/** A trench run with the port close enough to read clearly — well inside
 *  PORT_AHEAD_RANGE, and past the near clip. */
const trenchScene = (): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'trench',
  exhaustPort: { pos: [0, 0, -600] },
  trenchObstacles: [],
  projectiles: [],
})

/** The (model, modelView) the shell handed to drawWireframe for the port. */
function portDraw(): { model: Model3D; modelView: Mat4 } {
  const calls = vi.mocked(drawWireframe).mock.calls
  const call = calls.find((c) => (c[1] as Model3D)?.name === 'Exhaust Port')
  expect(call, 'render() draws the exhaust port during a trench run').toBeTruthy()
  return { model: call![1] as Model3D, modelView: call![2] as Mat4 }
}

describe('sw5-4 — the re-ported exhaust port still reaches the screen as a target', () => {
  beforeEach(() => {
    vi.mocked(drawWireframe).mockClear()
    render(makeCtx(), trenchScene(), W, H)
  })

  it('the port is drawn at all', () => {
    expect(portDraw().model.vertices).toHaveLength(12)
  })

  it('presents FACE-ON, not edge-on — the plate keeps real extent in BOTH screen axes', () => {
    // Push the port's own vertices through the exact modelView the shell composed,
    // then measure the spread in camera space. A plate rotated into the floor would
    // flatten along one axis; the bullseye must stay a bullseye.
    const { model, modelView } = portDraw()
    const pts = model.vertices.map((v) => transform(modelView, v))

    const spread = (i: 0 | 1) => {
      const vals = pts.map((p) => p[i])
      return Math.max(...vals) - Math.min(...vals)
    }

    // The ROM plate is 512 units across in both x and y. Seen face-on it keeps that
    // in both; seen edge-on one axis collapses toward zero. Demand the two are within
    // the same order of magnitude rather than pinning a pixel count — that survives any
    // scale or camera tweak while still failing hard on a collapse.
    const [sx, sy] = [spread(0), spread(1)]
    expect(sx, 'the plate has width').toBeGreaterThan(1)
    expect(sy, 'the plate has HEIGHT — it is not lying flat in the floor').toBeGreaterThan(1)
    expect(Math.min(sx, sy) / Math.max(sx, sy), 'square-ish, not a sliver').toBeGreaterThan(0.5)
  })

  it('the three concentric squares stay concentric and distinct on screen', () => {
    // The thing that makes it read as a TARGET rather than a box: three nested rings,
    // sharing a centre. If a transform squashed or skewed the plate they would blur
    // together, and the pilot would have nothing to aim at.
    const { model, modelView } = portDraw()
    const pts = model.vertices.map((v) => transform(modelView, v))

    // Ring membership comes from the MODEL (96 / 160 / 256), so this is independent of
    // whatever the camera did to it.
    const ringOf = (i: number) => Math.abs(EXHAUST_PORT.vertices[i][0])
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length
    const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length

    const meanRadius = (mag: number) => {
      const r = pts
        .filter((_, i) => ringOf(i) === mag)
        .map((p) => Math.hypot(p[0] - cx, p[1] - cy))
      expect(r, `ring ±${mag} has four corners`).toHaveLength(4)
      return r.reduce((a, b) => a + b, 0) / r.length
    }

    const [inner, middle, outer] = [meanRadius(96), meanRadius(160), meanRadius(256)]
    expect(inner, 'porthole inside berm').toBeLessThan(middle)
    expect(middle, 'berm inside base').toBeLessThan(outer)
    expect(inner, 'the porthole is a real, aimable target — not a dot').toBeGreaterThan(0)
  })
})
