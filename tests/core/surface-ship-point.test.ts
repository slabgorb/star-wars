// tests/core/surface-ship-point.test.ts
//
// Story sw7-16 / R11a round 2 — RED (Han Solo / TEA). "ONE ship point", made literal.
//
// == WHY THIS FILE EXISTS =====================================================
//
// The story's headline is that the surface has ONE ship point, `[0, altitude, 0]`, shared by
// the muzzle, the fire target, the cockpit hit-test and the camera. Round 1 shipped that
// claim with the point written out BY HAND in three places:
//
//     src/core/sim.ts        surfaceShip(altitude)  ->  [0, altitude, 0]
//     src/shell/render.ts    cameraView             ->  viewMatrix([0, state.altitude, 0], …)
//     tests/…/surface-aim-wysiwyg.test.ts  flyingEye ->  [0, s.altitude, 0]
//
// — tied together by nothing but three people typing the same thing on three different days.
// "One ship point" was a sentence in a docstring, not a fact about the program. The
// reviewer's words: "today 'one ship point' is 3 hand-matched copies tied by no test."
//
// This file makes it a fact, from both ends:
//
//   * `surfaceShip` is EXPORTED from the core and the shell's camera calls it, so the copy in
//     render.ts stops existing. **The EXPORT is what removes the copy — not these tests.**
//     Be precise about what is guarded here, because the imprecise version is the sin this
//     story exists to punish: re-inlining `[0, state.altitude, 0]` into `cameraView` returns a
//     bit-identical value, so it is invisible to every assertion below and always will be.
//     "Did you call the function or retype its body?" is a question about SOURCE, and these
//     are value tests. What they DO pin — and it is the risk that actually matters — is DRIFT:
//     let the camera and the ship point disagree by one unit and this file goes red at every
//     height. A re-inlined copy is harmless until it drifts, and the drift is caught.
//   * The sibling suite's `eyeOf` now recovers the eye from `cameraView` rather than typing
//     the point a fourth time, so its muzzle assertions bind the gun to the real camera too.
//
// == WHY THIS IS RED ==========================================================
//
// `surfaceShip` is not exported yet, so this file will not compile — every test in it errors
// at collection. That is deliberate and it is the loudest RED available: the export IS the
// fix, and an import is the only thing that can force a function to become part of the core's
// surface rather than a private helper someone re-inlines next sprint.
//
// It is a SEPARATE file for a reason: a collection failure takes the whole file with it, and
// the guards in `surface-aim-wysiwyg.test.ts` must stay runnable (and mutation-checkable)
// while this one is red.
//
// == THE BOUNDARY =============================================================
//
// The shell importing the core is the allowed direction — `core/` must never import `shell/`,
// and does not: the arrow runs render.ts -> sim.ts. `cameraView` stays what it always was, a
// pure function of GameState; it just stops keeping its own private copy of where the ship is.

import { describe, it, expect } from 'vitest'
import { stepGame, enterPhase, surfaceShip, shipPoint } from '../../src/core/sim'
import {
  initialState,
  SKIM_ALTITUDE,
  MIN_SKIM_ALTITUDE,
  MAX_SKIM_ALTITUDE,
  type GameState,
} from '../../src/core/state'
import type { Input } from '../../src/core/input'
import { eyeOf } from '../support/aim'

const DT = 1 / 60
const ASPECT = 16 / 9

const surface = (over: Partial<GameState> = {}): GameState => ({
  ...enterPhase(initialState(1983), 'surface'),
  mode: 'playing',
  turrets: [],
  surfaceMazeLaid: true,
  projectiles: [],
  enemyShots: [],
  fireCooldown: 0,
  ...over,
})

const trigger = (over: Partial<Input> = {}): Input => ({
  aimX: 0,
  aimY: 0,
  fire: true,
  aspect: ASPECT,
  ...over,
})

/** Heights worth probing: both ends of the flight band, the nominal skim, an arbitrary
 *  in-band value that is not any constant, and 0 — falsy but perfectly valid. */
const HEIGHTS = [0, MIN_SKIM_ALTITUDE, SKIM_ALTITUDE, MAX_SKIM_ALTITUDE, 173] as const

describe('sw7-16 — the surface ship point is ONE function', () => {
  it('is the flying point [0, altitude, 0] — laterally centred, on the floor of nothing', () => {
    expect(surfaceShip(173)).toEqual([0, 173, 0])
  })

  it.each(HEIGHTS)('reads altitude verbatim at %s — no default, no clamp, no remembered constant', (alt) => {
    // altitude 0 is falsy-but-valid, so a `|| SKIM_ALTITUDE` default would be a bug — the same
    // trap `surface-visibility.test.ts` pins on the camera. And the point must READ the
    // altitude it is handed rather than reaching for a constant: a `surfaceShip` that returns
    // SKIM_ALTITUDE satisfies the nominal case and leaves the gun off the ship everywhere else.
    expect(surfaceShip(alt)).toEqual([0, alt, 0])
  })

  it('is a pure function of altitude — same height in, same point out, no shared array', () => {
    // A returned-by-reference constant would let any caller mutate every other caller's ship
    // point. `surfaceShip` hands out a fresh Vec3.
    const a = surfaceShip(SKIM_ALTITUDE)
    const b = surfaceShip(SKIM_ALTITUDE)
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it.each(HEIGHTS)("IS the shell's camera eye at altitude %s — the two cannot drift apart", (alt) => {
    // THE POINT OF THIS FILE. This assertion binds the shell's camera to the core's ship point
    // ARGUMENT AND ALL — it fails if the camera is lifted anywhere else, if it is handed a
    // different height, or if the view picks up an offset on the way out. Mutation-checked: a
    // one-unit camera drift reddens this file and its sibling.
    //
    // It does NOT — and cannot — detect `cameraView` re-inlining `[0, state.altitude, 0]`:
    // that returns the same value, so both sides of the `toEqual` move together. The export is
    // what removes the copy; this test is what stops the copy mattering. See the header.
    const s = surface({ altitude: alt })
    expect(eyeOf(s)).toEqual(surfaceShip(s.altitude))
  })

  it('IS where the gun is — `shipPoint` and the camera cannot drift apart', () => {
    // The core's other consumer, closing the triangle: gun == ship point == camera eye.
    //
    // == HOW sw7-17 CHANGED THIS TEST, AND WHY IT IS NOT WEAKER =================
    //
    // Round 2 pinned this through the muzzle of a travelling bolt:
    //
    //     const s = stepGame(s0, trigger(), DT)
    //     expect(s.projectiles[0].pos).toEqual(surfaceShip(s0.altitude))
    //
    // sw7-17 took the bolt away — the player's laser is a HITSCAN beam and spawns nothing that
    // flies (audit G-004), so `s.projectiles` is empty after a trigger frame and there is no
    // object anywhere on the state whose position IS the muzzle. The gun's origin is now
    // `shipPoint(state)` itself, read straight out of the core.
    //
    // So the assertion splits in two, and BOTH halves are held:
    //
    //   * THE VALUE half is here: `shipPoint` — the phase-dispatching function the gun actually
    //     calls — agrees with the shell's REAL camera (`eyeOf` inverts `render.ts cameraView`) at
    //     an arbitrary in-band height. This is a strictly TIGHTER link than the test above it,
    //     which checks `surfaceShip` against the camera: this one goes through the phase switch,
    //     so it also fails if `shipPoint`'s surface branch is ever wired to something else.
    //
    //   * THE BEHAVIOURAL half — that the gun really does cast from this point rather than merely
    //     agreeing with it — is `hitscan-laser.test.ts`'s "the beam is cast from the ship point,
    //     not the world origin", which fires a shot that lands ONLY from the flying eye (the same
    //     ray cast from the origin passes ~228 away, outside TURRET_HIT_RADIUS). That is where the
    //     "the gun uses it" claim is earned; this file does not take credit for it.
    const s0 = surface({ altitude: 173 })
    expect(shipPoint(s0)).toEqual(eyeOf(s0))
  })
})
