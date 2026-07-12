// tests/shell/render.player-laser.test.ts
//
// Story 8-12 — render the PLAYER'S shots as cabinet-style cyan converging laser
// beams, RED phase.
//
// Today render.ts draws every player bolt as a small green '+' at the bolt's
// projected position (src/shell/render.ts: `drawSpark(ctx, p.pos, …, BOLT_GLOW)`,
// the placeholder). The authentic cabinet (arcade longplay youtube nJv94FPRddA)
// fires four CYAN laser lines from the cannon tips at the screen corners that
// CONVERGE on the shot — "pew pew". These guards fail until GREEN replaces the
// '+' placeholder with corner-originating, shot-converging cyan beams.
//
// SCOPE (per the story's scope guardrail): this is the PLAYER-SHOT render only.
// Enemy fireballs (`state.enemyShots`) are a SEPARATE story (8-18) and MUST stay
// untouched — their own red sparkle (sw3-9) — pinned by the final guard here.
//
// We assert the MECHANISM (beams originate at the corners and converge on the
// projected shot, in cyan), mirroring the structural style of
// render.tie-orient.test.ts. The exact glow/blur/line-width remain an EYEBALL
// concern per the repo convention (render.ts SURFACE_ORIENT note).

import { describe, it, expect } from 'vitest'
import { render } from '../../src/shell/render'
import { initialState, PROJECTILE_TTL, type GameState, type Projectile } from '../../src/core/state'
import type { Vec3 } from '@arcade/shared/math3d'

interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

/** Minimal canvas-context stub recording every stroked segment WITH the colour
 *  it was stroked in, so we can assert what render() draws without a real DOM
 *  canvas (vitest runs in node). Mirrors render.tie-orient.test.ts / wireframe.test.ts,
 *  extended with a strokeStyle getter/setter so each segment carries its colour.
 *  The `as unknown as CanvasRenderingContext2D` is the established shell-test mock
 *  idiom (same cast both sibling tests use) — a deliberate stub, not a type escape. */
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
    strokeRect() {}, // story 8-17: HUD shield-meter outline (drawShieldMeter)
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
    arc() {}, // story 8-14: render() strokes the green lock-on ring via ctx.arc
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segments }
}

const W = 800
const H = 600
const CENTER: [number, number] = [W / 2, H / 2]
const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [W, 0],
  [0, H],
  [W, H],
]

// A segment endpoint this close to a screen corner counts as originating at that
// cannon tip. A centred shot projects to (400,300), ≥500px from every corner, so
// the placeholder '+' (drawn AT the shot) can never satisfy a corner guard — the
// separation is what makes these tests RED today and unambiguous after GREEN.
const CORNER_TOL = 120
// How close a beam's far end must land to the shot's projected point to count as
// "converged". Small, since a centred shot projects exactly to screen centre.
const CONVERGE_TOL = 60

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)
const nearCorner = (x: number, y: number) => CORNERS.some(([cx, cy]) => dist(x, y, cx, cy) <= CORNER_TOL)

/** Every stroked segment with exactly ONE endpoint at a cannon-tip corner — i.e.
 *  a laser beam. Returns each as {from: the corner end, to: the convergence end,
 *  color}. The crosshair and the '+' spark sit near centre with neither endpoint
 *  at a corner, so they are excluded. */
function laserBeams(segments: ReadonlyArray<Seg>) {
  const beams: { from: [number, number]; to: [number, number]; color: string }[] = []
  for (const s of segments) {
    const aCorner = nearCorner(s.x1, s.y1)
    const bCorner = nearCorner(s.x2, s.y2)
    if (aCorner === bCorner) continue // both ends at corners, or neither — not a beam
    beams.push({
      from: aCorner ? [s.x1, s.y1] : [s.x2, s.y2],
      to: aCorner ? [s.x2, s.y2] : [s.x1, s.y1],
      color: s.color,
    })
  }
  return beams
}

/** A "playing" space-combat scene with no enemies/fireballs, so the only world
 *  strokes are the player laser under test (plus the centred HUD crosshair). */
const scene = (over: Partial<GameState>): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  enemies: [],
  enemyShots: [],
  projectiles: [],
  ...over,
})

/** A FRESHLY-fired player bolt at a world position. The cannon-tip laser flash is
 *  a brief "pew" gated on elapsed flight (render.ts: PROJECTILE_TTL − ttl ≤
 *  LASER_FLASH_SECONDS), so a fresh bolt carries ttl = PROJECTILE_TTL (elapsed 0)
 *  to sit inside that window — not a hardcoded lifetime that silently ages out when
 *  the constant moves (sw4-1 restored PROJECTILE_TTL to 3). vel is irrelevant here. */
const shotAt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, 0], ttl: PROJECTILE_TTL })

describe('Story 8-12 — player shots render as cyan converging laser beams', () => {
  it('fires a beam from each of the four cannon-tip corners when a shot is in flight', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ projectiles: [shotAt([0, 0, -1000])] }), W, H)

    const beams = laserBeams(segments)
    for (const [cx, cy] of CORNERS) {
      const fromThisCorner = beams.filter((b) => dist(b.from[0], b.from[1], cx, cy) <= CORNER_TOL)
      expect(fromThisCorner.length).toBeGreaterThan(0)
    }
  })

  it('converges every cannon-tip beam onto the projected shot (screen centre for a centred shot)', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ projectiles: [shotAt([0, 0, -1000])] }), W, H)

    const beams = laserBeams(segments)
    // Each corner must emit a beam that actually REACHES the shot point — not a
    // stray muzzle stub that stops short.
    for (const [cx, cy] of CORNERS) {
      const reachesShot = beams.some(
        (b) =>
          dist(b.from[0], b.from[1], cx, cy) <= CORNER_TOL &&
          dist(b.to[0], b.to[1], CENTER[0], CENTER[1]) <= CONVERGE_TOL,
      )
      expect(reachesShot).toBe(true)
    }
  })

  it('tracks the shot: an off-centre bolt converges off-centre, not at a hardcoded centre', () => {
    const { ctx, segments } = makeCtx()
    // +x bolt → projects right of screen centre, so the convergence must follow it.
    render(ctx, scene({ projectiles: [shotAt([300, 0, -1000])] }), W, H)

    const beams = laserBeams(segments)
    for (const [cx, cy] of CORNERS) {
      const reachesRight = beams.some(
        (b) => dist(b.from[0], b.from[1], cx, cy) <= CORNER_TOL && b.to[0] > CENTER[0] + 20,
      )
      expect(reachesRight).toBe(true)
    }
  })

  it('strokes the player laser in cockpit cyan, not the green "+" placeholder', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ projectiles: [shotAt([0, 0, -1000])] }), W, H)

    const beams = laserBeams(segments)
    expect(beams.length).toBeGreaterThan(0)
    // The cabinet player laser is cockpit cyan — the established '#00e5ff'
    // (render.ts GLOW / wireframe DEFAULT_GLOW) — replacing the green '#9dff00'
    // bolt placeholder. Exact glow/blur is an eyeball concern; the colour is not.
    for (const b of beams) {
      expect(b.color).toBe('#00e5ff')
      expect(b.color).not.toBe('#9dff00')
    }
  })

  it('is a transient flash: an aged in-flight bolt draws no beams, and none bleed onto a non-playing screen', () => {
    // A freshly-fired bolt flashes the cannon-tip beams…
    const fresh = makeCtx()
    render(fresh.ctx, scene({ projectiles: [shotAt([0, 0, -1000])] }), W, H)
    expect(laserBeams(fresh.segments).length).toBeGreaterThan(0)

    // …but an OLD bolt (long past the muzzle flash) draws none — the laser is a
    // brief "pew", not a line trailing the bolt for its whole flight. Otherwise
    // rapid fire builds a static cyan web that never clears.
    const aged = makeCtx()
    render(aged.ctx, scene({ projectiles: [{ pos: [0, 0, -1000], vel: [0, 0, 0], ttl: 0.01 }] }), W, H)
    expect(laserBeams(aged.segments)).toHaveLength(0)

    // …and the sim FREEZES in-flight bolts on the game-over screen (sim.ts), so
    // the laser must not bleed its beams over the framing screens.
    const over = makeCtx()
    render(over.ctx, { ...scene({ projectiles: [shotAt([0, 0, -1000])] }), mode: 'gameover' }, W, H)
    expect(laserBeams(over.segments)).toHaveLength(0)
  })

  it('leaves enemy fireballs as their own red sparkle — no cannon-tip beams (scope guard for 8-18)', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ enemyShots: [shotAt([0, 0, -1000])] }), W, H)

    // A fireball must NOT recruit the player's converging beams — that shoot-the-
    // fireball interaction is a separate story (8-18).
    expect(laserBeams(segments)).toHaveLength(0)
    // …and it still reads as the enemy fireball's OWN red sparkle (sw3-9) near its
    // projected point. Isolate to the shot so the HUD's own red ink (far at the
    // top) can't satisfy this vacuously.
    const redAtShot = segments.filter(
      (s) => s.color === '#ff3b30' && (dist(s.x1, s.y1, ...CENTER) <= 60 || dist(s.x2, s.y2, ...CENTER) <= 60),
    )
    expect(redAtShot.length).toBeGreaterThan(0)
  })
})
