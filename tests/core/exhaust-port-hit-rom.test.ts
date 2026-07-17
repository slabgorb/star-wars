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
//
// -- ⚠ RE-SEATED BY sw7-17 / R11b: HOW THE SHOT IS TAKEN ---------------------
//
// Every bound above is untouched; only the way this suite pulls the trigger moves. It used to
// hand-place a bolt at an (x, y) offset from the port and step once, because the player's gun threw
// a 12,000 u/s object. The gun is now the cabinet's HITSCAN beam (audit G-004): it spawns nothing,
// so there is no bolt to place, and a step with the trigger up fires no beam at all — the old
// fixture would have gone green on an arbitrarily broken hit test. `shootAt` therefore AIMS at the
// offset and PULLS, which is the same sentence the offsets always meant ("put the shot here") and
// is strictly stronger: it goes through the real yoke, the real ship point and the real resolve.
//
// It also has to fly the run out, and that is the machine's doing rather than ours. sw5-6 seated
// the pilot 768 above a porthole lying in the floor, so an in-window port is ~44° below him against
// a 30° cone: he cannot shoot from -300, and the old IN_WINDOW_Z is not a stale number but an
// impossible one. The ROM never asked for that shot — WSLAZR arms the torpedo when a laser gets
// close enuf to the hole, and WSMAIN reads the flag later at the $800 wall — so `shootAt` threads
// the porthole at the trench mouth, where the yoke can reach it, and follows the run to the window.
// The radius is what decides it either way; that is all this file has ever been about.
//
// One geometric consequence, stated rather than buried, because it changes what two of the shots
// below are worth. A bolt sat AT an offset, so the offset WAS the miss distance. A beam is a ray,
// and its miss distance is the perpendicular from the port to that ray — so an offset only counts
// in full where it lies across the beam. The pilot's line into a floor-mounted plate runs almost
// entirely in the Y-Z plane, which means:
//
//   • an X (lateral) offset is very nearly perpendicular to the beam and survives intact —
//     96 out reads as ~95.9 of miss distance. The lateral shots below still discriminate the
//     radius to within a fraction of a unit, and they are the ones with teeth.
//   • a Y offset is raked along the beam and foreshortens — 96 below the hole reads as ~90.3.
//     `shootAt(0, -96)` therefore still passes, and honestly (a ray through a point 96 under the
//     porthole really does pass 90 from its centre), but it no longer pins the radius at 96: it
//     would pass at 91. It is kept as second-axis COVERAGE, and the rim's discriminating case is
//     pinned on X — both signs of it.

import { describe, it, expect } from 'vitest'
import { initialState, PORT_HIT_RADIUS, EXHAUST_PORT_DISTANCE, type GameState } from '../../src/core/state'
import { EXHAUST_PORT } from '../../src/core/models'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'
import type { Vec3 } from '@arcade/shared/math3d'
import { aimAt, eyeOf, fireAt } from '../support/aim'

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
 *  spans (its two horizontal axes — the ROM's THIRD component is HEIGHT, and all twelve points
 *  sit at 0, so the plate lies FLAT IN THE FLOOR; sw5-6). Compared against the ROM
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

/** The range every shot below is taken from: the port's own spawn distance, at the trench mouth.
 *  RE-SEATED BY sw7-17 from the old in-window -300 — see the header. It is where the ROM means the
 *  shot to be earned, and (unlike -300) it is a range the yoke can actually point at, which the
 *  reachability guard inside `shootAt` proves rather than assumes. The window never confounds the
 *  RADIUS question here either: an armed run always resolves at the wall, a missed one never does,
 *  so the sphere alone still decides every outcome in this file. */
const SHOT_Z = -EXHAUST_PORT_DISTANCE

/** One real 60fps frame. */
const FRAME = 1 / 60

const hit = (events: readonly GameEvent[]): boolean =>
  events.some((e) => e.type === 'death-star-destroyed')

/** Put the crosshair at an (x,y) offset from the port's centre, pull the trigger ONCE, fly the run
 *  to the $800 wall, and report whether the Death Star blew. `trenchShotsFired: 2` keeps the
 *  clean-run Force bonus out of the way — this suite is about the sphere, not the bonus. */
function shootAt(x: number, y: number): boolean {
  const port: Vec3 = [0, 0, SHOT_Z]
  const s0 = trench(portAt(port), { trenchShotsFired: 2 })
  // ANTI-VACUOUS. `aimAt` deliberately does not clamp, so a test can ask for a yoke position no
  // player could hold (|NDC| > 1) and get a confident direction back. Every shot in this file is a
  // shot a pilot could actually take — which is exactly what the old -300 fixture was not.
  const aim = aimAt([x, y, SHOT_Z], eyeOf(s0))
  expect(aim.reachable, `the yoke can point at (${x}, ${y}) from the trench mouth`).toBe(true)
  let s = stepGame(s0, fireAt(s0, [x, y, SHOT_Z]), FRAME)
  // One pull is one shot (G-012), so the trigger comes up and the run coasts to the window; a
  // miss simply flies the whole trench and never resolves. The budget covers the full scroll from
  // the mouth to the cockpit with room to spare.
  for (let i = 0; i < 320 && s.phase === 'trench'; i++) {
    if (hit(s.events)) return true
    s = stepGame(s, NO_INPUT, FRAME)
  }
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
    // made this test RED in sw5-4, and what "re-tuned against the ROM" has to mean.
    //
    // sw7-17: the LATERAL rim is where this bites, so both signs of it are pinned — a beam through
    // either side of the hole reads ~95.9 of miss distance against the 108 sphere, and would go red
    // the moment the radius fell back under the rim. The Y shot below it is raked along the beam
    // and reads only ~90.3, so it is honest second-axis coverage rather than a 96 bound; the header
    // has the geometry. Neither line was dropped: the discriminating case was ADDED next to it.
    expect(shootAt(PORTHOLE_HALF_WIDTH, 0)).toBe(true)
    expect(shootAt(-PORTHOLE_HALF_WIDTH, 0)).toBe(true)
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
