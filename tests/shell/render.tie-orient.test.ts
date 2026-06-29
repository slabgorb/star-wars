// tests/shell/render.tie-orient.test.ts
//
// Story 8-13 — render applies each TIE's per-enemy orientation, RED phase.
//
// The core computes the facing (tests/core/tie-orientation.test.ts); the shell
// must CONSUME it. Today render.ts draws every TIE with the default IDENTITY
// orient (src/shell/render.ts: `drawWireframe(ctx, TIE_FIGHTER, e.pos, ...)`
// with no orient argument), so an enemy's `orient` is ignored and the banking
// never reaches the screen. This guard fails until GREEN wires `e.orient` into
// the TIE draw call.
//
// It asserts the MECHANISM only — that two TIEs differing solely in `orient`
// produce different stroked geometry. Visual correctness (the right axis, scale,
// and the fixed panel-stacking display correction) is confirmed by EYEBALL in
// the dev server, per the repo convention that orientation/scale escape
// structural tests (render.ts SURFACE_ORIENT note).

import { describe, it, expect } from 'vitest'
import { render } from '../../src/shell/render'
import { initialState, type GameState, type Enemy } from '../../src/core/state'
import { IDENTITY, rotationY, type Mat4 } from '../../src/core/math3d'

/** Minimal canvas-context stub recording every stroked segment, so we can assert
 *  what render() draws without a real DOM canvas (vitest runs in node). Mirrors
 *  tests/shell/wireframe.test.ts; extended with the text/state members render()'s
 *  HUD path touches (all no-ops except the recorded moveTo/lineTo). */
function makeCtx() {
  const segments: number[][] = []
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
    fillText() {},
    arc() {}, // story 8-14: render() strokes the green lock-on ring via ctx.arc
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segments }
}

/** A single-TIE space wave with the enemy at a fixed front position, differing
 *  only in its `orient`, so any drawn difference is attributable to orientation. */
const sceneWith = (orient: Mat4): GameState => {
  const enemy: Enemy = { pos: [0, 0, -1200], vel: [0, 0, 0], kind: 'tie', orient }
  return { ...initialState(1983), enemies: [enemy] }
}

const W = 800
const H = 600

describe('Story 8-13 — render applies the per-enemy TIE orientation', () => {
  it('draws a rotated TIE differently from an unrotated one at the same position', () => {
    const flat = makeCtx()
    render(flat.ctx, sceneWith(IDENTITY), W, H)

    const banked = makeCtx()
    render(banked.ctx, sceneWith(rotationY(1)), W, H)

    // Both renders draw the TIE wireframe (plus the identical crosshair), so each
    // produces segments...
    expect(flat.segments.length).toBeGreaterThan(0)
    expect(banked.segments.length).toBeGreaterThan(0)
    // ...and because the only difference between the scenes is the TIE's orient,
    // honouring it MUST change the stroked geometry. (RED while render ignores
    // e.orient and draws both identically.)
    expect(banked.segments).not.toEqual(flat.segments)
  })
})
