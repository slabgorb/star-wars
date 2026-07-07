// tests/shell/render.enemy-fireball.test.ts
//
// Story sw2-2 — enemy fireballs render as LARGE, round fireballs (RED phase).
//
// The live-playtest defect: render.ts draws every enemy fireball as a small amber
// "+" spark — `drawSpark(…, FIRE_GLOW, 6)` — two fixed 6px line segments crossing
// at the projected point. On a real cabinet these are big, round, glowing
// fireballs you can see coming and shoot down; the "+" glyph reads as a HUD tick,
// not ordnance. This story replaces the glyph with a large round fireball body.
//
// The contract (TEA-defined; the sprint YAML carried no acceptance criteria):
//
//   * A fireball is drawn as a ROUND body — more than the two-segment "+" cross
//     (a stroked ring/polygon, or an arc), not a bare plus.
//   * It is LARGE — its drawn extent is substantially bigger than the old 6px
//     spark, so it reads as a fireball rather than a reticle tick.
//   * It is a real projected 3D BODY, not a fixed-size screen glyph: a nearer
//     fireball draws LARGER than a distant one (drawSpark's fixed 6 does not).
//
// These assert the rendered MECHANISM through a recording canvas stub — the
// established shell-test idiom (render.enemy-muzzle-flash.test.ts,
// render.player-laser.test.ts). Exact glow/hex/decay stay an EYEBALL concern per
// the repo convention; we pin only that the body is round, large, and 3D-scaled.
//
// NOTE for GREEN (cross-test constraint): draw the body as a closed ring/polygon
// whose strokes lie on the PERIMETER — not spokes radiating from the centre. The
// story-9-6 muzzle-flash test (render.enemy-muzzle-flash.test.ts) classifies any
// amber segment with one endpoint AT the fireball's projected point as a muzzle
// "ray"; centre-spoked body strokes would be miscounted as a starburst and fail
// its "an aged fireball draws no rays" assertion.

import { describe, it, expect } from 'vitest'
import { render } from '../../src/shell/render'
import { initialState, ENEMY_SHOT_TTL, type GameState, type Projectile } from '../../src/core/state'
import type { Vec3 } from '@arcade/shared/math3d'

interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}
interface Arc {
  x: number
  y: number
  r: number
  stroke: string
  fill: string
}

/** Canvas-context stub recording stroked segments AND arcs with their colours —
 *  extends the shell-test mock idiom to see round bodies, not just line crosses. */
function makeCtx() {
  const segments: Seg[] = []
  const arcs: Arc[] = []
  let pen: [number, number] = [0, 0]
  let curStroke = ''
  let curFill = ''
  const ctx = {
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 0,
    font: '700 18px monospace',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    globalCompositeOperation: '',
    set strokeStyle(v: string) {
      curStroke = v
    },
    get strokeStyle() {
      return curStroke
    },
    set fillStyle(v: string) {
      curFill = v
    },
    get fillStyle() {
      return curFill
    },
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo(x: number, y: number) {
      pen = [x, y]
    },
    lineTo(x: number, y: number) {
      segments.push({ x1: pen[0], y1: pen[1], x2: x, y2: y, color: curStroke })
      pen = [x, y]
    },
    arc(x: number, y: number, r: number) {
      arcs.push({ x, y, r, stroke: curStroke, fill: curFill })
    },
    stroke() {},
    fill() {},
    save() {},
    restore() {},
    fillText() {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segments, arcs }
}

const W = 800
const H = 600
const CENTER: [number, number] = [W / 2, H / 2]
const FIRE_GLOW = '#ffd60a' // enemy fireball amber (render.ts)

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)

/** A "playing" space scene with no enemies/bolts, so the only amber strokes are
 *  the fireball body under test (the cyan crosshair and red/green HUD differ in
 *  colour and are filtered out by FIRE_GLOW). */
const scene = (over: Partial<GameState>): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  enemies: [],
  enemyShots: [],
  projectiles: [],
  ...over,
})

// An enemy fireball PAST its muzzle-flash window (elapsed = ENEMY_SHOT_TTL - ttl
// well over the 0.1s flash), so the amber strokes are the fireball BODY only —
// no muzzle starburst inflating the count/extent.
const fireballAt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, 1], ttl: ENEMY_SHOT_TTL / 2 })

const amberSegs = (segments: ReadonlyArray<Seg>) => segments.filter((s) => s.color === FIRE_GLOW)
const amberArcs = (arcs: ReadonlyArray<Arc>) =>
  arcs.filter((a) => a.stroke === FIRE_GLOW || a.fill === FIRE_GLOW)

/** The fireball's drawn radius about a projected centre: the farthest amber ink
 *  from that point, whether stroked as a polygon (segment endpoints) or an arc
 *  (centre offset + radius). The old "+" spark yields 6; a large body yields more. */
function bodyRadius(segments: ReadonlyArray<Seg>, arcs: ReadonlyArray<Arc>, cx: number, cy: number): number {
  const fromSegs = amberSegs(segments).flatMap((s) => [dist(s.x1, s.y1, cx, cy), dist(s.x2, s.y2, cx, cy)])
  const fromArcs = amberArcs(arcs).map((a) => dist(a.x, a.y, cx, cy) + a.r)
  return Math.max(0, ...fromSegs, ...fromArcs)
}

const OLD_SPARK_HALF = 6 // the fixed half-extent of the "+" spark this story retires

describe('sw2-2 — an enemy fireball renders as a large round body, not a + glyph', () => {
  it('draws a round body — more than the two-segment "+" cross', () => {
    const { ctx, segments, arcs } = makeCtx()
    render(ctx, scene({ enemyShots: [fireballAt([0, 0, -1000])] }), W, H)

    // A "+" is exactly two amber segments. A round fireball is a ring/polygon of
    // many perimeter strokes, or an arc — either clears the bar; a bare cross does not.
    const seg = amberSegs(segments)
    const arc = amberArcs(arcs)
    expect(seg.length > 2 || arc.length >= 1).toBe(true)
  })

  it('reads much larger than the old 6px spark', () => {
    const { ctx, segments, arcs } = makeCtx()
    render(ctx, scene({ enemyShots: [fireballAt([0, 0, -1000])] }), W, H)

    // A large fireball spans well beyond the retired spark's 6px half-extent.
    expect(bodyRadius(segments, arcs, CENTER[0], CENTER[1])).toBeGreaterThanOrEqual(OLD_SPARK_HALF * 2)
  })

  it('is a real 3D body: a near fireball draws larger than a distant one', () => {
    // The fixed-size "+" spark draws the same 6px at any depth; a projected body
    // grows as it bears down — the "big fireball swelling toward you" feel.
    const near = makeCtx()
    render(near.ctx, scene({ enemyShots: [fireballAt([0, 0, -500])] }), W, H)
    const far = makeCtx()
    render(far.ctx, scene({ enemyShots: [fireballAt([0, 0, -5000])] }), W, H)

    const nearR = bodyRadius(near.segments, near.arcs, CENTER[0], CENTER[1])
    const farR = bodyRadius(far.segments, far.arcs, CENTER[0], CENTER[1])
    expect(nearR).toBeGreaterThan(farR)
  })
})
