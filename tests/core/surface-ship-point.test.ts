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
//     render.ts stops existing. That is the fix; these tests are what keep it fixed.
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
import { stepGame, enterPhase, surfaceShip } from '../../src/core/sim'
import {
  initialState,
  SKIM_ALTITUDE,
  MIN_SKIM_ALTITUDE,
  MAX_SKIM_ALTITUDE,
  type GameState,
} from '../../src/core/state'
import { transform, type Vec3 } from '@arcade/shared/math3d'
import type { Input } from '../../src/core/input'
import * as RenderModule from '../../src/shell/render'

const DT = 1 / 60
const ASPECT = 16 / 9
const ORIGIN: Vec3 = [0, 0, 0]

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

/** The eye recovered from the camera the shell actually builds. See the sibling suite's
 *  `eyeOf` for why this is never hand-written. */
const eyeOf = (s: GameState): Vec3 => {
  const originInView = transform(RenderModule.cameraView(s), ORIGIN)
  return [-originInView[0] + 0, -originInView[1] + 0, -originInView[2] + 0]
}

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

  it.each(HEIGHTS)("IS the shell's camera eye at altitude %s — render.ts keeps no copy", (alt) => {
    // THE POINT OF THIS FILE. render.ts:284 used to hand-write `[0, state.altitude, 0]`; it
    // must go through `surfaceShip`. This assertion binds the shell's camera to the core's
    // ship point ARGUMENT AND ALL — it fails if the camera is lifted anywhere else, if it is
    // handed a different height, or if the view picks up an offset on the way out.
    const s = surface({ altitude: alt })
    expect(eyeOf(s)).toEqual(surfaceShip(s.altitude))
  })

  it('IS the muzzle — the gun and the camera cannot drift apart', () => {
    // The core's other consumer, closing the triangle: gun == ship point == camera eye. The
    // muzzle is the ship at the START of the step (the eye the pilot aimed down — see the
    // sibling suite's section (b)), so it is built from `s0`, not from the returned state.
    const s0 = surface({ altitude: 173 })
    const s = stepGame(s0, trigger(), DT)

    expect(s.projectiles).toHaveLength(1)
    expect(s.projectiles[0].pos).toEqual(surfaceShip(s0.altitude))
  })
})
