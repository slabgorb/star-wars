// tests/shell/render.lock-on-removed.test.ts
//
// sw7-21 (R-LOCK) — RED, the OBSERVABLE half of AC-1. With a TIE dead under the
// reticle — the exact state story 8-14 drew its green ring for — render() must no
// longer stroke that ring. The ring was `drawLockOn`: a green `#9dff00` `ctx.arc`
// at the locked TIE's projected position (render.ts:496-516). The 1983 cabinet
// draws only the site crosshair (WSSITE.MAC); it never rings a target predictively.
//
// The fixture is deliberately one that DID lock — a TIE at [0,0,-1200] under a
// centred yoke, which projects to screen centre and satisfied the old isLocked. So
// this cannot pass VACUOUSLY: the ring WAS drawn here before removal (RED proves
// it), and asserting "no green ring anywhere over a locked scene" also closes the
// dodge of faking removal by breaking the lock condition instead of deleting the
// draw. The explosion FX is the only other arc render strokes and it is a different
// colour (#ffdd66) drawn only during a blast, so filtering on the ring's green
// isolates the ring exactly.

import { describe, it, expect } from 'vitest'
import { render } from '../../src/shell/render'
import { initialState, type GameState, type Enemy } from '../../src/core/state'
import { IDENTITY, type Vec3 } from '@arcade/shared/math3d'

interface Arc {
  x: number
  y: number
  r: number
  color: string
}

/** A canvas-context stub that records every stroked ARC with the colour it was
 *  stroked in. The lock-on ring is an arc, not a line segment — render.player-laser
 *  .test.ts stubs arc() as a no-op precisely because it tests the beams, not the
 *  ring. The `as unknown as CanvasRenderingContext2D` is the established shell-test
 *  mock idiom (same cast the sibling render tests use). */
function makeCtx() {
  const arcs: Arc[] = []
  let curColor = ''
  const ctx = {
    fillStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 0,
    font: '700 18px monospace',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    globalCompositeOperation: '',
    globalAlpha: 1,
    set strokeStyle(v: string) {
      curColor = v
    },
    get strokeStyle() {
      return curColor
    },
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    save() {},
    restore() {},
    fillText() {},
    arc(x: number, y: number, r: number) {
      arcs.push({ x, y, r, color: curColor })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, arcs }
}

const W = 800
const H = 600
// render.ts BOLT_GLOW — the green drawLockOn stroked the lock-on ring in.
const RING_GREEN = '#9dff00'

const tie = (pos: Vec3): Enemy => ({ pos, kind: 'tie', orient: IDENTITY })

/** A live space scene with a single TIE dead ahead and the yoke centred on it — the
 *  canonical 8-14 "locked" state. Spawns/fire are suppressed so the TIE stays put. */
const lockedScene = (): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  enemies: [tie([0, 0, -1200])],
  enemyShots: [],
  aimX: 0,
  aimY: 0,
  spawnTimer: 999,
  enemyFireCooldown: 999,
})

describe('sw7-21 — render() no longer strokes the predictive lock-on ring', () => {
  it('draws NO green lock-on ring over a TIE that sits dead under the reticle', () => {
    const { ctx, arcs } = makeCtx()
    render(ctx, lockedScene(), W, H)
    const greenRings = arcs.filter((a) => a.color === RING_GREEN)
    expect(greenRings).toHaveLength(0)
  })
})
