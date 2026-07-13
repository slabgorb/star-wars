// tests/core/exhaust-port-hit-rom.test.ts
//
// Story sw5-4 — RED phase (O'Brien / TEA): AC-4, the gameplay half.
//
// Re-porting the port's GEOMETRY (exhaust-port-rom.test.ts) silently re-tunes the
// hardest shot in the game, so AC-4 requires the hit test to be re-derived against
// the ROM object rather than left assuming the octagon — and the resulting change
// in difficulty to be called out, not slipped in. This suite is that call-out,
// written as executable assertions.
//
// -- WHAT THE PLAYER IS ACTUALLY SHOOTING ------------------------------------
//
// The whole 12-point plate is NOT the target. `.WGD PORT` (WSOBJ.MAC:1855) strokes
// it in three pens, and the pen changes name the parts:
//
//   MOVD #VGCGRN ;OUTER BASE     the ±256 square + its skirt   — Death Star surface
//   MOVD #VGCTRQ ;INNER BERM     the ±160 square               — the raised lip
//   MOVD #VGCRED ;PORTHOLE       the ±96 square, closed        — THE HOLE
//
// The red pen strokes points 0-3 and nothing else, and the ROM's point table calls
// that same group ";0-3 INNER CIRCLE". So the thing a torpedo must go INTO is the
// ±96 porthole. Putting a proton torpedo into the green outer base is hitting the
// armoured surface AROUND the shaft — it must not blow up the Death Star.
//
// This matters because the story's AC-4 headline ("the ROM target is roughly 3.6x
// wider than ours") measures the whole PLATE (512 across, vs the octagon's ~140).
// Tuning the hit sphere to the plate would make the finish a barn door — bigger
// than the 120-unit sphere sw3-15 removed for being unmissable. Tuned to the
// PORTHOLE, the target grows honestly but stays a target. Logged as a deviation.
//
// -- THE RESULTING DIFFICULTY CHANGE (the explicit call-out AC-4 demands) -----
//
//   octagon (authored, sw3-15):  reach hypot(64,27)  = 69.5  -> PORT_HIT_RADIUS 70
//   ROM porthole (this story):   half-width 96, corner hypot(96,96) = 135.8
//
// So the hit sphere must grow from 70 to somewhere in [96, 136]: at least the
// porthole's half-width (you must be able to hit the hole you can see) and at most
// its corner reach (you may not hit MORE than you can see — sw3-15's WYSIWYG rule,
// which this story keeps and merely re-points at the real geometry).
//
//   => the port becomes EASIER to hit: 1.4-1.9x the radius, ~1.9-3.8x the disc area.
//
// That is a real difficulty reduction and it is intentional: the old sphere was
// tuned to a fabricated octagon that was ~30% too small in the first place. Note
// the irony worth stating out loud — the "fat 120 sphere" sw3-15 removed for being
// ~2x the visible target is, against the REAL porthole, actually TIGHTER than the
// hole the player is aiming at. The 120 ceiling in the sibling suites is therefore
// re-seated here, not deleted: the ceiling is now the porthole, as WYSIWYG always
// intended.
//
// Behaviour is driven through the pure surface — stepGame(state, input, dt) — and
// asserts observable gameplay (the event stream), never internal shape.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  PORT_HIT_RADIUS,
  PROJECTILE_TTL,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { EXHAUST_PORT } from '../../src/core/models'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'
import type { Vec3 } from '@arcade/shared/math3d'

// --- the ROM geometry the contract is pinned against ------------------------
//
// These are the ROM's OWN numbers (WSOBJ.MAC `.WP PORT`, `.S=8`: 0x0C/0x14/0x20
// × 8), NOT values read back out of EXHAUST_PORT. That distinction is the whole
// integrity of this suite: deriving the target size from the model under test
// makes every bound self-fulfilling — against today's octagon such a derivation
// yields a "porthole" of 27 and a hit sphere of 70 sails past it, so the tests
// would go GREEN on the broken geometry they exist to reject.
//
// The bridge back to the model is asserted explicitly, once, below.

/** The porthole — the innermost square (`.PH 0C,0C,0`, ";0-3 INNER CIRCLE"), the
 *  one the red `;PORTHOLE` pen closes. This is the hole. */
const PORTHOLE_HALF_WIDTH = 96 //                            0x0C * 8 — edge midpoints
const PORTHOLE_REACH = Math.hypot(PORTHOLE_HALF_WIDTH, PORTHOLE_HALF_WIDTH) // 135.8 — corners
/** The support berm (`.PH 14,14,0`) — the first ring OUTSIDE the hole. A torpedo
 *  out here has hit the lip, not the shaft. */
const BERM_HALF_WIDTH = 160 //                               0x14 * 8
/** The outer base (`.PH 20,20,0`) — Death Star surface. Emphatically not a target. */
const BASE_HALF_WIDTH = 256 //                               0x20 * 8

/** The ring magnitudes the PORT MODEL actually ships, in the plane the ROM plate
 *  lies in (x/y — it is flat in z, facing the pilot). Compared against the ROM
 *  constants above rather than used in their place. */
const MODEL_RINGS = [...new Set(EXHAUST_PORT.vertices.map((v) => Math.abs(v[0])))].sort(
  (a, b) => a - b,
)

/** The sphere the octagon bought. Named so the "it must actually move" assertions
 *  below read as intent rather than as a magic number. */
const OCTAGON_RADIUS = 70

// --- staging (the sibling suites' idiom) ------------------------------------

const portAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

const trench = (
  port: { pos: Vec3 } | null,
  over: Partial<GameState> = {},
  seed = 1983,
): GameState => ({ ...initialState(seed), phase: 'trench', exhaustPort: port, ...over })

/** A hand-placed bolt at rest — the geometry is pinned dead-on, so real-speed
 *  flight is irrelevant and a micro-tick keeps the scroll from moving the port. */
const bolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })

/** Deep inside any plausible approach window, so the RADIUS (not the sw3-15 $800
 *  window) decides every outcome below. Matches the sibling suites' -300. */
const IN_WINDOW_Z = -300

const hit = (events: readonly GameEvent[]): boolean =>
  events.some((e) => e.type === 'death-star-destroyed')

/** Fire one hand-placed bolt at an (x,y) offset from the port's centre and report
 *  whether the Death Star blew. `trenchShotsFired: 2` keeps the clean-run Force
 *  bonus out of the way — this suite is about the sphere, not the bonus. */
function shootAt(x: number, y: number): boolean {
  const port: Vec3 = [0, 0, IN_WINDOW_Z]
  const base = trench(portAt(port), { trenchShotsFired: 2 })
  const s = stepGame({ ...base, projectiles: [bolt([x, y, IN_WINDOW_Z])] }, NO_INPUT, 0.001)
  return hit(s.events)
}

// ---------------------------------------------------------------------------
// The geometry the contract stands on. If this is wrong, every bound below is
// meaningless — so it fires first, and with a legible message.
// ---------------------------------------------------------------------------

describe('sw5-4 AC-4 — the hit sphere is re-derived against the ROM porthole', () => {
  it('the shipped port model IS the ROM plate — 96 / 160 / 256', () => {
    // THE BRIDGE. Every bound below is stated in the ROM's own units, so it is only
    // meaningful if the model the sim renders and collides against is actually that
    // object. This is the single assertion tying the two together; if it fails, read
    // nothing else in this file as evidence.
    expect(MODEL_RINGS).toEqual([PORTHOLE_HALF_WIDTH, BERM_HALF_WIDTH, BASE_HALF_WIDTH])
    expect(PORTHOLE_REACH).toBeCloseTo(135.76, 1)
  })

  it('PORT_HIT_RADIUS is no longer the octagon\'s 70 — it was RE-TUNED, not left alone', () => {
    // AC-4's literal demand. Leaving the constant untouched while the model is
    // swapped underneath it is the exact failure this story exists to prevent:
    // the sphere would then be 27% smaller than the hole the player is aiming at,
    // and a torpedo visibly inside the porthole would sail straight through.
    expect(PORT_HIT_RADIUS).not.toBe(OCTAGON_RADIUS)
    expect(PORT_HIT_RADIUS).toBeGreaterThan(OCTAGON_RADIUS)
  })

  it('covers the whole visible porthole: ≥ its half-width (96)', () => {
    // The floor. A shot the player can SEE go into the hole must detonate it.
    expect(PORT_HIT_RADIUS).toBeGreaterThanOrEqual(PORTHOLE_HALF_WIDTH)
  })

  it('never exceeds the porthole\'s own corner reach (~136) — sw3-15\'s WYSIWYG rule, kept', () => {
    // The ceiling. "You may only HIT what you can SEE" survives this story intact;
    // it is simply re-pointed at the real hole instead of a fabricated octagon.
    expect(PORT_HIT_RADIUS).toBeLessThanOrEqual(Math.ceil(PORTHOLE_REACH))
  })

  it('does NOT reach the support berm — the hole is the target, not the plate', () => {
    // The load-bearing bound, and the one that keeps AC-4 honest. The plate is
    // 3.6x wider than the old octagon, but the plate is not the target: tuning to
    // it (a ~256-362 sphere) would hand the player a finish far more forgiving
    // than the 120 sphere sw3-15 deleted for being unmissable.
    expect(PORT_HIT_RADIUS).toBeLessThan(BERM_HALF_WIDTH)
    expect(PORT_HIT_RADIUS).toBeLessThan(BASE_HALF_WIDTH)
  })
})

// ---------------------------------------------------------------------------
// ...and the same contract, proven through the SIM rather than the constant.
// A radius that satisfies the bounds above but is wired up wrong still fails here.
// ---------------------------------------------------------------------------

describe('sw5-4 AC-4 — what detonates the port, and what does not', () => {
  it('a torpedo dead-centre in the porthole still blows the Death Star', () => {
    expect(shootAt(0, 0)).toBe(true)
  })

  it('a torpedo on the porthole\'s edge (96 out, dead on the rim) detonates it', () => {
    // The WYSIWYG floor, as behaviour: this shot is visibly ON the red porthole
    // the ROM draws. Under the old octagon sphere (70) it MISSES — which is what
    // makes this test RED today, and what "re-tuned against the ROM" has to mean.
    expect(shootAt(PORTHOLE_HALF_WIDTH, 0)).toBe(true)
    expect(shootAt(0, -PORTHOLE_HALF_WIDTH)).toBe(true)
  })

  it('a torpedo out on the SUPPORT BERM misses — that is the lip, not the hole', () => {
    expect(shootAt(BERM_HALF_WIDTH, 0)).toBe(false)
  })

  it('a torpedo out on the OUTER BASE misses — that is Death Star surface', () => {
    // The barn-door guard. If someone tunes the sphere to the plate's 256/362
    // instead of the porthole, this is the test that says no.
    expect(shootAt(BASE_HALF_WIDTH, 0)).toBe(false)
    expect(shootAt(BASE_HALF_WIDTH, BASE_HALF_WIDTH)).toBe(false)
  })

  it('the difficulty change is real and bounded: a shot at 90 now scores, a shot at 200 still does not', () => {
    // The explicit before/after that AC-4 asks to be called out rather than
    // slipped in. 90 sits in the band the re-tune OPENS (outside the old octagon
    // sphere of 70, inside the real porthole) — it used to miss, and now it must
    // score. 200 sits in the band that stays SHUT (past the porthole, out on the
    // berm) — it missed before and must still miss.
    expect(90).toBeGreaterThan(OCTAGON_RADIUS)
    expect(90).toBeLessThan(PORTHOLE_HALF_WIDTH)
    expect(shootAt(90, 0), 'the finish gets easier — by exactly the porthole').toBe(true)

    expect(200).toBeGreaterThan(Math.ceil(PORTHOLE_REACH))
    expect(shootAt(200, 0), '...but not a barn door').toBe(false)
  })
})
