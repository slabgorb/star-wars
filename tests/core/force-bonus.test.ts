// tests/core/force-bonus.test.ts
//
// Fidelity epic, task 4 — the arcade's "Use the Force" bonus: finishing the
// trench WITHOUT firing at anything before the port kill (only the killing
// torpedo itself counted) awards FORCE_BONUS on top of TRENCH_BONUS, and the
// shell shows the banner across the wave transition (findings ## Exhaust port
// & run outcome — the type-4 "Use the Force" marker plane's one-shot latch).

import { describe, it, expect } from 'vitest'
import {
  initialState,
  FORCE_BONUS,
  TRENCH_BONUS,
  PORT_AHEAD_RANGE,
  type GameState,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'

/** A port kill now lands only inside the narrow approach window (sw3-15: the ROM
 *  $800 window near the end wall). spawnPort seeds the port far downrange at
 *  -EXHAUST_PORT_DISTANCE, which is OUTSIDE that window, so we seat the port near the
 *  cockpit — deep inside any plausible window — where a kill actually registers. The
 *  bonus semantics under test (clean run vs prior shots) are unchanged by WHERE the
 *  kill lands; only that it lands at all, which requires the in-window port. */
const IN_WINDOW_PORT: Vec3 = [0, 0, -300]

/**
 * A playing trench state on the frame the run is won: the port has scrolled into the $800 window
 * with the proton torpedo already ARMED.
 *
 * RE-SEATED BY sw7-17 / R11b. This used to park a bolt on the port, because the player's gun threw
 * an object you could stand still. It is now the cabinet's hitscan beam and spawns nothing (audit
 * G-004), so there is no bolt — and, more to the point, there is no shot to be taken from HERE at
 * all: the pilot sits 768 above a porthole lying in the floor, so an in-window port is ~44° below
 * him against a 30° cone. The ROM's answer, which the sim now follows, is that the laser ARMS the
 * torpedo early (out where the hole is reachable — `?LAZAR GOT CLOSE ENUF TO FIRE PROTON TORPS?` →
 * `JSR FRPTGN`) and WSMAIN RESOLVES it late, reading `LDA PT.LIV` at the window. This fixture is
 * that resolving frame, and it is exactly what a pilot who threaded the hole at the trench mouth
 * is flying when it opens.
 *
 * The latch, not a bolt, is what this suite needs: `trenchShotsFired` is the whole subject here,
 * and arriving armed is what lets each test state its own shot count and have the step change
 * nothing else.
 */
function portKill(state: GameState): GameState {
  return {
    ...state,
    mode: 'playing',
    exhaustPort: { pos: [...IN_WINDOW_PORT] as Vec3 },
    portTorpedoArmed: true,
  }
}

describe('force bonus — using the Force in the trench', () => {
  it('enterPhase(trench) resets trenchShotsFired and forceBonusAwardedAt', () => {
    const dirty = { ...initialState(1983), trenchShotsFired: 9, forceBonusAwardedAt: 5 }
    const t = enterPhase(dirty, 'trench')
    expect(t.trenchShotsFired).toBe(0)
    expect(t.forceBonusAwardedAt).toBeNull()
  })

  it('counts shots fired while flying the trench', () => {
    // The trigger is edge-triggered semi-auto (sw7-17 / G-012), so this counts a PULL: the state
    // carries `firePrev: false` out of enterPhase and this frame's `fire: true` is the rising edge.
    // `trenchShotsFired` still counts the `fire` event, which is unchanged by the hitscan gun —
    // what it tallies is the pilot pulling the trigger, not anything that flies.
    const s0 = enterPhase(initialState(), 'trench')
    const s1 = stepGame({ ...s0, mode: 'playing' }, { ...NO_INPUT, fire: true }, 1 / 60)
    expect(s1.trenchShotsFired).toBe(1)
  })

  it('a clean port kill (only the shot that armed it) awards TRENCH_BONUS + FORCE_BONUS and the event', () => {
    // sw7-17: ONE, not zero. `clean` is `trenchShotsFired <= 1` — "no trench shots before the
    // killing torpedo itself" — and one is the honest floor now that the torpedo is armed by the
    // pilot's own laser: arriving at the window armed means he pulled the trigger exactly once, out
    // at the trench mouth, and hit the hole with it. A state carrying `portTorpedoArmed` with a
    // shot count of ZERO is unreachable in play, and a fixture that asserted from there would be
    // pinning the bonus against a run nobody can fly. The discrimination is untouched: this is the
    // clean side of the `<= 1` boundary, the test below is the dirty side.
    const s0 = { ...portKill(enterPhase(initialState(), 'trench')), trenchShotsFired: 1 }
    const s1 = stepGame(s0, NO_INPUT, 1 / 60)
    expect(s1.score).toBe(TRENCH_BONUS + FORCE_BONUS)
    expect(s1.forceBonusAwardedAt).not.toBeNull()
    expect(s1.events).toContainEqual({ type: 'force-bonus', amount: FORCE_BONUS })
  })

  it('a port kill after prior trench shots scores only TRENCH_BONUS', () => {
    const s0 = { ...portKill(enterPhase(initialState(), 'trench')), trenchShotsFired: 3 }
    const s1 = stepGame(s0, NO_INPUT, 1 / 60)
    expect(s1.score).toBe(TRENCH_BONUS)
    expect(s1.forceBonusAwardedAt).toBeNull()
    expect(s1.events.some((e) => e.type === 'force-bonus')).toBe(false)
  })

  it('PORT_AHEAD_RANGE and FORCE_BONUS are positive (banner/table sanity)', () => {
    expect(FORCE_BONUS).toBeGreaterThan(0)
    expect(PORT_AHEAD_RANGE).toBeGreaterThan(0)
  })
})
