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
  PROJECTILE_TTL,
  type GameState,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'

/** A playing trench state with the port at `portZ` and a bolt already on it. */
function portKill(state: GameState): GameState {
  const port = state.exhaustPort!.pos
  return {
    ...state,
    mode: 'playing',
    projectiles: [{ pos: [port[0], port[1], port[2]], vel: [0, 0, -1], ttl: PROJECTILE_TTL }],
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
    const s0 = enterPhase(initialState(), 'trench')
    const s1 = stepGame({ ...s0, mode: 'playing' }, { ...NO_INPUT, fire: true }, 1 / 60)
    expect(s1.trenchShotsFired).toBe(1)
  })

  it('a clean port kill (no prior shots) awards TRENCH_BONUS + FORCE_BONUS and the event', () => {
    const s0 = { ...portKill(enterPhase(initialState(), 'trench')), trenchShotsFired: 0 }
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
