// tests/core/bounded-eye-combat.test.ts
//
// sw8-2 RED — the moving eye must be BOUNDED so space combat stays reachable and
// incoming fire stays fair (ACs 11, 9, and the 12 fairness half).
//
// sw8-1 shipped the moving eye: `spaceEye(state) = [state.frame * SPACE_EYE_SHIFT_PER_FRAME,
// 0, 0]` (src/core/sim.ts) — a pure function of the free-running frame counter, and it is
// UNBOUNDED. `state.frame` never resets inside a run (only `startRun` zeroes it; `enterPhase`
// spreads `...s`), so the eye slides laterally without limit. Meanwhile TIEs spawn
// ORIGIN-relative (tie-waves.ts `TBG`) and the crosshair NDC is CLAMPED to ±1 (gameRules.ts
// `crosshairNdc`), so once the eye has slid far enough the whole origin-anchored fight is off
// the side of the screen and the yoke physically cannot point at it — space combat slides
// off-screen and can SOFT-LOCK on a long run (sw8-1 Reviewer finding: a close approaching TIE
// clears the FOV edge at eye_x ≈ 3078). Wave 1 from a fresh run (frame ≈ 0) is fine.
//
// GROUND TRUTH: the ROM's ST.UX viewer register is 16-bit and WRAPS (~±32768 raw); it does not
// free-run to arbitrary magnitude the way `frame * 8` does. The fix is Dev's to RULE (design §3
// — per-phase reset / clamp / slower drift / reconcile the hit-test), but the OBSERVABLE it must
// produce is fixed: over a long continuous space phase a representative combat target stays
// AIM-REACHABLE (|NDC| ≤ 1), and the eye does not grow without bound. This suite pins that
// observable, not a specific bound value — the drift magnitude is Dev's tuning, verified against
// the longplay in the visual QA (ACs 5/10).
//
// SEAM-AGNOSTIC. `eyeOf(s)` recovers the eye the shell's camera actually builds (it inverts
// `cameraView`), and `aimAt(target, eye)` inverts the SAME projection the crosshair is drawn
// under — so "reachable" here is literally "the yoke can point at it", not a formula retyped
// from render.ts.
//
// Sacred boundary: drives the public `stepGame`; no DOM, no time except `dt`, no randomness
// except the seeded RNG carried in state.

import { describe, it, expect } from 'vitest'
import { initialState, TICK_HZ, type GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { eyeOf, aimAt } from '../support/aim'
import type { Vec3 } from '@arcade/shared/math3d'

/** One whole game frame of dt — one decision tick per `stepGame`, so N steps advance the frame
 *  counter (and the moving eye) by ~N game frames. */
const TICK_DT = 1 / TICK_HZ

/** A live space scene with NO combatants — the fight is represented by fixed world positions
 *  below, so the run only advances `frame` (and the moving eye) without a TIE beelining the
 *  cockpit or a shot draining a shield mid-measurement. `initialState` already opens in
 *  phase:'space' / mode:'playing' / frame:0. */
const spaceRun = (seed = 1983): GameState => ({
  ...initialState(seed),
  enemies: [],
  enemyShots: [],
  spawnTimer: 1e9,
  lives: 999,
})

/** Step the real sim `steps` game frames on neutral input, staying in the space phase (no kills
 *  ⇒ `phaseKills` never advances) so only the eye drifts. */
function advance(s0: GameState, steps: number): GameState {
  let s = s0
  for (let i = 0; i < steps; i++) s = stepGame(s, NO_INPUT, TICK_DT)
  return s
}

// Representative space-combat positions at a mid-approach range (TIEs close from
// TIE_SPAWN_DISTANCE = 31,744 toward the cockpit). At depth 8,000 the FOV envelope is
// depth·tan(30°) ≈ 4,600, which comfortably exceeds the ~3,078 eye_x the sw8-1 finding names as
// the close-TIE FOV edge — so ANY bound that keeps combat on-screen leaves these reachable,
// while today's unbounded eye slides them off.
const combatTie: Vec3 = [0, 0, -8000] // an approaching TIE dead ahead
const incomingFireball: Vec3 = [1200, 0, -8000] // an incoming fireball, off to one side

// Long enough that today's `frame * 8` eye slides WELL past the combat FOV envelope (~4,600):
// ~1,600 game frames ⇒ eye_x ≈ 12,800. A bounded eye stays put. This is the "continuous space
// flight" the finding warns about.
const LONG_RUN = 1600

describe('sw8-2 — the moving eye is BOUNDED so space combat stays reachable', () => {
  it('AC11 anchor: fresh space combat (frame 0, no drift) is aim-reachable', () => {
    // Holds today and must survive the fix — wave 1 from a fresh run is fine (eye ≈ 0).
    const s = spaceRun()
    expect(aimAt(combatTie, eyeOf(s)).reachable).toBe(true)
    expect(aimAt(incomingFireball, eyeOf(s)).reachable).toBe(true)
  })

  it('AC11: a TIE dead ahead stays aim-reachable across a long continuous space run', () => {
    // Today the eye slides to eye_x ≈ 12,800 while the TIE stays origin-anchored, so it clears
    // the FOV edge and the yoke (NDC-clamped to ±1) cannot point at it — the soft-lock. A
    // bounded eye keeps it reachable.
    const s = advance(spaceRun(), LONG_RUN)
    expect(aimAt(combatTie, eyeOf(s)).reachable).toBe(true)
  })

  it('AC9: an incoming fireball stays aim-reachable (shootable) across a long run', () => {
    // Fire fairness: a fireball can already be shot down (sim.ts beamHit vs enemyShots), but
    // once the eye has drifted the origin-homing shot is off the side of the view and the
    // crosshair cannot reach it — an unshootable, undodgeable hit from off-screen. A bounded eye
    // keeps incoming fire inside the arc the player can answer.
    const s = advance(spaceRun(), LONG_RUN)
    expect(aimAt(incomingFireball, eyeOf(s)).reachable).toBe(true)
  })

  it('AC11/AC12: the space eye does not free-run past the ROM ST.UX 16-bit range', () => {
    // The ROM's ST.UX register is 16-bit and wraps (~±32768 raw); our derived eye must likewise
    // stay bounded, not grow linearly with the frame counter for ever. At a deep frame the
    // unbounded `frame * 8` is far outside that range (≈ 400,000) — the ever-growing divergence
    // between where the pilot looks/shoots (the eye) and the origin-anchored cockpit he is hit
    // at. A bound of any kind (reset/clamp/wrap/slow) keeps it inside.
    const s: GameState = { ...spaceRun(), frame: 50_000 }
    const eye = eyeOf(s)
    expect(Math.hypot(eye[0], eye[1], eye[2])).toBeLessThan(33_000)
  })
})
