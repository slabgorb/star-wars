// tests/shell/render.enemy-muzzle-flash.test.ts
//
// Story 9-6 — a visible starburst muzzle flash when a TIE fires.
//
// Today render.ts draws every enemy fireball as a small amber '+' spark at its
// projected position (src/shell/render.ts: `drawSpark(…, FIRE_GLOW, 6)`), with no
// cue at the instant of firing — the player gets no visual tell that fire was
// launched. This story adds a brief radiating STARBURST at the muzzle for the
// first few frames of a fireball's life, mirroring the player's "pew" muzzle
// flash (render.ts drawPlayerLaser, gated by elapsed flight time vs TTL).
//
// Like the player laser, the flash is derived PURELY from sim state — a freshly-
// fired shot is one whose elapsed flight (`ENEMY_SHOT_TTL - ttl`) is still inside
// the brief flash window — so render() stays a pure function of state with no
// shell-side mutable effect list and the core/shell boundary is untouched.
//
// We assert the MECHANISM (extra rays radiate FROM the muzzle point, in the enemy
// amber, only while fresh, only during a run), mirroring the structural style of
// render.player-laser.test.ts. Exact ray count / glow / decay are an EYEBALL
// concern per the repo convention (render.ts SURFACE_ORIENT note).

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

/** Minimal canvas-context stub recording every stroked segment WITH its colour —
 *  the established shell-test mock idiom (see render.player-laser.test.ts). */
function makeCtx() {
  const segments: Seg[] = []
  let pen: [number, number] = [0, 0]
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
    set strokeStyle(v: string) {
      curColor = v
    },
    get strokeStyle() {
      return curColor
    },
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo(x: number, y: number) {
      pen = [x, y]
    },
    lineTo(x: number, y: number) {
      segments.push({ x1: pen[0], y1: pen[1], x2: x, y2: y, color: curColor })
    },
    stroke() {},
    save() {},
    restore() {},
    fillText() {},
    arc() {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segments }
}

const W = 800
const H = 600
const CENTER: [number, number] = [W / 2, H / 2]
const FIRE_GLOW = '#ffd60a' // enemy fireball amber (render.ts)

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)

// A muzzle-flash ray is an amber segment with exactly ONE endpoint AT the muzzle
// point (the projected shot) and the other radiating outward. The '+' spark's two
// segments straddle the muzzle (it is their MIDPOINT, not an endpoint), so they
// are excluded — the separation is what makes a starburst distinguishable from
// the plain spark both before and after GREEN.
const AT_MUZZLE_TOL = 3 // an endpoint this close to the muzzle counts as anchored there
const RAY_MIN_LEN = 6 // the other endpoint must reach at least this far out

/** Amber rays radiating from a given muzzle point — the starburst under test. */
function muzzleRays(segments: ReadonlyArray<Seg>, mx: number, my: number) {
  return segments.filter((s) => {
    if (s.color !== FIRE_GLOW) return false
    const aAt = dist(s.x1, s.y1, mx, my) <= AT_MUZZLE_TOL
    const bAt = dist(s.x2, s.y2, mx, my) <= AT_MUZZLE_TOL
    if (aAt === bAt) return false // both ends at the muzzle, or neither — not a ray
    const out = aAt ? dist(s.x2, s.y2, mx, my) : dist(s.x1, s.y1, mx, my)
    return out >= RAY_MIN_LEN
  })
}

/** A "playing" space-combat scene with no enemies, so the only world strokes are
 *  the enemy fireball spark + muzzle flash under test (plus the HUD crosshair). */
const scene = (over: Partial<GameState>): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  enemies: [],
  enemyShots: [],
  projectiles: [],
  ...over,
})

/** An enemy fireball at a world position with a given remaining lifetime. */
const fireballAt = (pos: Vec3, ttl: number): Projectile => ({ pos, vel: [0, 0, 0], ttl })

describe('Story 9-6 — a TIE fire renders a brief amber starburst at the muzzle', () => {
  it('radiates a multi-ray starburst from a freshly-fired fireball', () => {
    const { ctx, segments } = makeCtx()
    // A just-spawned fireball (full TTL) at screen centre.
    render(ctx, scene({ enemyShots: [fireballAt([0, 0, -1000], ENEMY_SHOT_TTL)] }), W, H)

    // A starburst is more than the plain '+' spark: several rays fan out from the
    // muzzle point. Three-plus radiating rays read unambiguously as a burst.
    const rays = muzzleRays(segments, CENTER[0], CENTER[1])
    expect(rays.length).toBeGreaterThanOrEqual(3)
    // And it stays in the enemy's amber, consistent with the fireball it launches.
    for (const r of rays) expect(r.color).toBe(FIRE_GLOW)
  })

  it('is a transient flash: an aged fireball draws no starburst, only its spark', () => {
    const { ctx, segments } = makeCtx()
    // Long past the muzzle window: most of the 6s lifetime already elapsed.
    render(ctx, scene({ enemyShots: [fireballAt([0, 0, -1000], 1)] }), W, H)

    expect(muzzleRays(segments, CENTER[0], CENTER[1])).toHaveLength(0)
    // …but the fireball itself still reads as the amber spark in flight.
    expect(segments.some((s) => s.color === FIRE_GLOW)).toBe(true)
  })

  it('tracks the muzzle: an off-centre fireball bursts off-centre, not at a fixed point', () => {
    const { ctx, segments } = makeCtx()
    // +x fireball → projects right of screen centre, so the burst must follow it.
    render(ctx, scene({ enemyShots: [fireballAt([300, 0, -1000], ENEMY_SHOT_TTL)] }), W, H)

    // No rays anchored at screen centre…
    expect(muzzleRays(segments, CENTER[0], CENTER[1])).toHaveLength(0)
    // …but rays do anchor right of centre, where the off-centre shot projects.
    const rightward = segments.filter(
      (s) => s.color === FIRE_GLOW && (s.x1 > CENTER[0] + 20 || s.x2 > CENTER[0] + 20),
    )
    expect(rightward.length).toBeGreaterThanOrEqual(3)
  })

  it('does not bleed onto the game-over screen (the sim freezes fireballs there)', () => {
    const { ctx, segments } = makeCtx()
    render(
      ctx,
      { ...scene({ enemyShots: [fireballAt([0, 0, -1000], ENEMY_SHOT_TTL)] }), mode: 'gameover' },
      W,
      H,
    )
    // A fresh-but-frozen fireball on the framing screen must NOT keep flashing.
    expect(muzzleRays(segments, CENTER[0], CENTER[1])).toHaveLength(0)
  })
})
