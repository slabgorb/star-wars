// tests/shell/render.player-laser.test.ts
//
// The PLAYER'S laser as the cabinet draws it: four CYAN beams from the cannon tips at
// the screen corners, converging on THE SITE.
//
// Story 8-12 wrote this suite against the placeholder it replaced (render.ts drew every
// player bolt as a small green '+' at the bolt's projected position), so it fired its
// beams at a `Projectile` fixture and asserted they converged on THE BOLT, flashing for a
// brief window off the bolt's elapsed flight (`PROJECTILE_TTL - p.ttl <= LASER_FLASH_SECONDS`).
//
// sw7-17 / R11b took the bolt away. The player's laser is HITSCAN (audit G-004): the gun
// spawns nothing, so there is no projected bolt to converge on and no flight to time the
// flash off — `shotAt`, `PROJECTILE_TTL` and `LASER_FLASH_SECONDS` are all gone from this
// story. Two things replace them, and they come straight from the ROM:
//
//   - WHERE the beams meet is THE SITE — the crosshair, `crosshairNdc(aimX, aimY)` mapped
//     NDC→screen. `VWLAZ ;VIEW ANY LASARS` draws gun-ports → site, and the site is the
//     reticle: the beam converges on what the player is pointing at, hit or miss.
//   - WHEN they are drawn is `state.laserOn` — the core's own LZ.ON gate, NOT the LZ.EDG counter
//     (8 game frames ≈ 0.39 s). The ROM draws the laser every frame it is on, and the
//     frames it is on are exactly the frames it can kill, so the flash window and the
//     collision window are one quantity. The shell keeps no timer of its own and cannot
//     drift from the frames that actually hit.
//
// What this file GUARDS is unchanged, and it is the geometry: four beams, one per screen
// corner, all meeting at ONE point, that point being the reticle and tracking it, in
// cockpit cyan, only during a live run. The exact glow/blur/line-width remain an EYEBALL
// concern per the repo convention (render.ts SURFACE_ORIENT note).
//
// SCOPE (per the story's scope guardrail): this is the PLAYER-LASER render only. Enemy
// fireballs (`state.enemyShots`) are a SEPARATE story (8-18) and MUST stay untouched —
// their own red sparkle (sw3-9) — pinned by the final guards here.

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
// cannon tip. Every site these fixtures aim at sits >250px from every corner, so
// nothing but a real beam can straddle the boundary — the separation is what makes
// the corner guards unambiguous.
const CORNER_TOL = 120
// Four beams "converge" when their far ends are the SAME point, not merely a cluster:
// render draws all four to one `tip`, so anything but a sub-pixel spread means they do
// not actually meet.
const MEET_TOL = 1
// How close the reticle's own ink must sit to that meeting point to say the beams land
// ON the crosshair. The reticle spans ~29px from its centre (drawCrosshair's GAP+CHEV),
// so this is "the same piece of screen furniture", not "somewhere in the same half".
const RETICLE_TOL = 35

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)
const nearCorner = (x: number, y: number) => CORNERS.some(([cx, cy]) => dist(x, y, cx, cy) <= CORNER_TOL)

/** Every stroked segment with exactly ONE endpoint at a cannon-tip corner — i.e.
 *  a laser beam. Returns each as {from: the corner end, to: the convergence end,
 *  color}. The crosshair sits at the site with neither endpoint at a corner, so it
 *  is excluded. */
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

/** The single point the beams meet at — asserted to BE single, then returned. Read
 *  off the drawing itself rather than recomputed from the yoke, so the tests that
 *  use it are pinning where render actually put the site, not a formula retyped
 *  from render.ts (the sw7-16 lesson: a constant compared against its own copy
 *  proves nothing). */
function convergencePoint(segments: ReadonlyArray<Seg>): [number, number] {
  const beams = laserBeams(segments)
  expect(beams.length).toBeGreaterThan(0)
  const [ax, ay] = beams[0].to
  for (const b of beams) expect(dist(b.to[0], b.to[1], ax, ay)).toBeLessThanOrEqual(MEET_TOL)
  return [ax, ay]
}

/** A "playing" space-combat scene with no enemies/fireballs, so the only world
 *  strokes are the player laser under test (plus the HUD crosshair at the site).
 *  `laserOn` is the whole gate now: initialState opens with the laser off. */
const scene = (over: Partial<GameState>): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  enemies: [],
  enemyShots: [],
  ...over,
})

/** A live sweep — the state a trigger pull leaves behind, mid-window. Carries BOTH the gate the
 *  shell reads (`laserOn`) and a mid-window counter, because a real mid-sweep state has both. The
 *  counter is deliberately mid-sweep rather than the full 8 frames: the shell must not care how
 *  freshly the trigger was pulled. */
const SWEEPING = { laserOn: true, laserEdge: 4 / 20.508 } as const

/** An enemy fireball in flight (the 8-18 scope guard's subject). ttl is the
 *  fireball's own ENEMY_SHOT_TTL — the player's projectile lifetime no longer has
 *  anything to do with anything the player fires. */
const fireballAt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, 0], ttl: ENEMY_SHOT_TTL })

describe('sw7-17 — the player laser renders as four cyan beams converging on the site', () => {
  it('fires a beam from each of the four cannon-tip corners while the sweep is live', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ ...SWEEPING }), W, H)

    const beams = laserBeams(segments)
    for (const [cx, cy] of CORNERS) {
      const fromThisCorner = beams.filter((b) => dist(b.from[0], b.from[1], cx, cy) <= CORNER_TOL)
      expect(fromThisCorner.length).toBeGreaterThan(0)
    }
  })

  it('converges every cannon-tip beam on ONE point, and that point is the reticle', () => {
    const { ctx, segments } = makeCtx()
    // Yoke centred: the site — and so the reticle — sits at screen centre.
    render(ctx, scene({ ...SWEEPING, aimX: 0, aimY: 0 }), W, H)

    // Each corner must emit a beam that actually REACHES the meeting point — not a
    // stray muzzle stub that stops short.
    const meet = convergencePoint(segments)
    for (const [cx, cy] of CORNERS) {
      const reaches = laserBeams(segments).some(
        (b) =>
          dist(b.from[0], b.from[1], cx, cy) <= CORNER_TOL &&
          dist(b.to[0], b.to[1], meet[0], meet[1]) <= MEET_TOL,
      )
      expect(reaches).toBe(true)
    }
    expect(dist(meet[0], meet[1], CENTER[0], CENTER[1])).toBeLessThanOrEqual(RETICLE_TOL)

    // ...and the beams land ON the crosshair, not merely near the middle of the screen:
    // the reticle's own cyan ink (drawn independently by drawCrosshair, from the same
    // core `crosshairNdc`) surrounds the meeting point. Beams are excluded from this by
    // construction — their other end is a corner, hundreds of pixels away.
    const reticleInk = segments.filter(
      (s) =>
        s.color === '#00e5ff' &&
        dist(s.x1, s.y1, meet[0], meet[1]) <= RETICLE_TOL &&
        dist(s.x2, s.y2, meet[0], meet[1]) <= RETICLE_TOL,
    )
    expect(reticleInk.length).toBeGreaterThan(0)
  })

  it('tracks the site: an off-centre yoke converges off-centre, on both axes', () => {
    const { ctx, segments } = makeCtx()
    // Yoke right and DOWN. +aimY is UP (the core's convention), so a negative aimY must
    // drag the site toward the BOTTOM of the canvas — the NDC→screen Y flip, pinned by
    // direction rather than by a hardcoded pixel.
    render(ctx, scene({ ...SWEEPING, aimX: 0.5, aimY: -0.4 }), W, H)

    const meet = convergencePoint(segments)
    expect(meet[0]).toBeGreaterThan(CENTER[0] + 20)
    expect(meet[1]).toBeGreaterThan(CENTER[1] + 20)
    // Every corner still reaches it — the whole fan tracks, not just one beam.
    for (const [cx, cy] of CORNERS) {
      const reaches = laserBeams(segments).some(
        (b) =>
          dist(b.from[0], b.from[1], cx, cy) <= CORNER_TOL &&
          dist(b.to[0], b.to[1], meet[0], meet[1]) <= MEET_TOL,
      )
      expect(reaches).toBe(true)
    }
  })

  it('strokes the player laser in cockpit cyan, not the green "+" placeholder', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ ...SWEEPING }), W, H)

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

  it('DRAWS on the last live frame, where the counter has clamped to 0 but the beam still kills', () => {
    // THE BUG THIS FILE SHIPPED FOR ONE ROUND, now pinned. Caught in review by the rule-checker.
    //
    // The core keeps two values, exactly as the cabinet does (WSLAZR.MAC:110-113):
    //
    //     LDA LZ.EDG / IFGT / DEC LZ.EDG / STA LZ.ON
    //
    // `laserOn` is read PRE-decrement; `laserEdge` is stored POST-decrement. So on the final live
    // frame of every single sweep the counter has already clamped to 0 while the laser is still on
    // and a kill can still land. Gating the shell on `laserEdge > 0` therefore drew NOTHING on a
    // frame the beam was still shooting — once per sweep, for ever, and invisible to every other
    // test in this file because they all use a mid-window fixture where the two agree.
    //
    // This is that exact state, and it is the ONLY fixture here where the counter and the gate
    // disagree — so it is the only one that can catch the regression.
    const c = makeCtx()
    render(c.ctx, scene({ laserOn: true, laserEdge: 0 }), W, H)

    expect(
      laserBeams(c.segments).length,
      'the shell must gate on laserOn (LZ.ON), never on the post-decrement counter',
    ).toBeGreaterThan(0)
  })

  it('is the sweep and nothing else: on while LZ.EDG runs, off the frame it expires', () => {
    // A live sweep flashes the cannon-tip beams…
    const on = makeCtx()
    render(on.ctx, scene({ ...SWEEPING }), W, H)
    expect(laserBeams(on.segments).length).toBeGreaterThan(0)

    // …and a spent one (the laser off, the pilot not shooting) draws none. The laser is a brief
    // "pew", not a cyan web that never clears — and the window the shell draws is exactly the
    // window the core can kill in, because it reads the SAME GATE the collision does (`laserOn`,
    // the ROM's LZ.ON). See the test below for why that phrasing is load-bearing rather than
    // decorative: an earlier cut of this file said "because it IS that counter", and that was
    // false — the counter and the gate are off by one frame.
    const off = makeCtx()
    render(off.ctx, scene({ laserOn: false, laserEdge: 0 }), W, H)
    expect(laserBeams(off.segments)).toHaveLength(0)

    // …and the sim freezes the state on the game-over screen (sim.ts), so a sweep caught
    // mid-flight there must not bleed its beams over the framing screens.
    const over = makeCtx()
    render(over.ctx, scene({ ...SWEEPING, mode: 'gameover' }), W, H)
    expect(laserBeams(over.segments)).toHaveLength(0)
  })
})

describe('sw7-17 — enemy fireballs keep their own render (scope guard for 8-18)', () => {
  it('leaves a fireball as its own red sparkle — it summons no cannon-tip beams', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ laserEdge: 0, enemyShots: [fireballAt([0, 0, -1000])] }), W, H)

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

  it('a firing player converges on the SITE, never on a fireball that happens to be in flight', () => {
    // The sharper half of the same guard, and the one the site model makes possible:
    // with the laser ON and a fireball off to the right, the beams must still meet at the
    // reticle. A render that chased shots would drag the fan onto the fireball instead.
    const { ctx, segments } = makeCtx()
    render(
      ctx,
      scene({ ...SWEEPING, aimX: 0, aimY: 0, enemyShots: [fireballAt([300, 0, -1000])] }),
      W,
      H,
    )

    const meet = convergencePoint(segments)
    expect(dist(meet[0], meet[1], CENTER[0], CENTER[1])).toBeLessThanOrEqual(RETICLE_TOL)
    expect(meet[0]).toBeLessThan(CENTER[0] + 20) // not dragged toward the +x fireball
  })
})
