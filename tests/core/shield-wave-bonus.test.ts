// tests/core/shield-wave-bonus.test.ts
//
// Story sw7-4 (R4), sub-task S-013 — RED phase. At the end of a won run the ROM
// banks 5,000 points per SURVIVING shield unit — a bonus the clone does not award
// at all today (audit S-013: "no per-shield wave bonus").
//
// PRIMARY SOURCE — Warp Speed (.RADIX 16):
//   WSGAS.MAC:375-391  SCRSHLD:: "GIVE POINTS FOR SHIELD ENERGY REMAINING" —
//     LDB S.GAS (shields left); loop, adding TSCSHL once per remaining unit with
//     BCD carry (ADDA/DAA/DECB).  Total = TSCSHL * shields.
//   WSGAS.MAC:519      TSCSHL: .BYTE 00,50,00  ;SHIELD SCORE PER UNIT -> 5,000 (BCD).
//   WSMAIN.MAC:3305-3308  the reward is banked in the end-of-wave VEWNXT sequence,
//     right after "DEATH STAR DESTROYED" — UNCONDITIONAL (no clean/dirty gate,
//     unlike the Force bonus). Its banner is MS.BRE (see render.reward-banners).
//   Shield count is DIP-set to 6..9 (WSMAIN.MAC:1294-1297); our clone starts at 6
//     (STARTING_LIVES), so a full survivor banks 6 * 5,000 = 30,000.
//
// In our sim a run is WON at the port-kill detonation (sim.ts clearRun loops to the
// next wave), so the per-shield bonus lands on that same frame, keyed off the
// surviving `lives`. `SHIELD_BONUS_PER_UNIT` and the `shield-bonus` event do not
// exist pre-GREEN — that is the RED signal.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  SHIELD_BONUS_PER_UNIT,
  TRENCH_BONUS,
  forceBonusForWave,
  type GameState,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'

const IN_WINDOW_PORT: Vec3 = [0, 0, -300]

/** A trench state on the winning frame, with the surviving shields / wave / prior
 *  shots the caller wants to probe. */
function wonRun(over: Partial<GameState> = {}): GameState {
  return {
    ...enterPhase(initialState(1983), 'trench'),
    mode: 'playing',
    wave: 1,
    score: 0,
    trenchObstacles: [],
    exhaustPort: { pos: [...IN_WINDOW_PORT] as Vec3 },
    portTorpedoArmed: true,
    trenchShotsFired: 1,
    ...over,
  }
}

const detonate = (s: GameState): GameState => stepGame(s, NO_INPUT, 1 / 60)

const shieldBonusEvent = (
  s: GameState,
): { type: 'shield-bonus'; amount: number; shields: number } | undefined =>
  s.events.find(
    (e): e is { type: 'shield-bonus'; amount: number; shields: number } =>
      e.type === 'shield-bonus',
  )

describe('S-013 — per-surviving-shield bonus (WSGAS.MAC:375-391 SCRSHLD, TSCSHL = 5,000)', () => {
  it('the per-shield unit value is 5,000 (TSCSHL `00,50,00`, BCD)', () => {
    expect(SHIELD_BONUS_PER_UNIT).toBe(5_000)
  })

  it('a full-survivor win (6 shields) banks 30,000 and reports the shield count', () => {
    const s = detonate(wonRun({ lives: 6 }))
    expect(shieldBonusEvent(s)?.amount).toBe(30_000)
    expect(shieldBonusEvent(s)?.shields).toBe(6)
  })

  it('scales with the shields actually left (4 -> 20,000; 1 -> 5,000)', () => {
    expect(shieldBonusEvent(detonate(wonRun({ lives: 4 })))?.amount).toBe(20_000)
    expect(shieldBonusEvent(detonate(wonRun({ lives: 1 })))?.amount).toBe(5_000)
  })

  it('is NOT gated on a clean run — a DIRTY win still banks it (unlike the Force bonus)', () => {
    // SCRSHLD runs unconditionally in VEWNXT; only the Force bonus is clean-gated.
    const dirty = detonate(wonRun({ lives: 5, trenchShotsFired: 4 }))
    expect(shieldBonusEvent(dirty)?.amount).toBe(25_000)
    expect(dirty.events.some((e) => e.type === 'force-bonus')).toBe(false)
  })
})

describe('S-013 + S-012 — the winning frame banks TRENCH + wave-force + per-shield together', () => {
  it('a clean wave-1 win with 6 shields scores 25,000 + 5,000 + 30,000', () => {
    const s = detonate(wonRun({ wave: 1, lives: 6, score: 0 }))
    expect(s.score).toBe(TRENCH_BONUS + forceBonusForWave(1) + SHIELD_BONUS_PER_UNIT * 6)
  })

  it('a clean wave-3 win with 4 shields scores 25,000 + 25,000 + 20,000', () => {
    const s = detonate(wonRun({ wave: 3, lives: 4, score: 0 }))
    expect(s.score).toBe(TRENCH_BONUS + forceBonusForWave(3) + SHIELD_BONUS_PER_UNIT * 4)
  })
})

describe('S-013 — determinism', () => {
  it('the shield bonus is a pure function of the surviving shields', () => {
    const a = detonate(wonRun({ lives: 3, score: 0 }))
    const b = detonate(wonRun({ lives: 3, score: 0 }))
    expect(a.score).toBe(b.score)
    expect(shieldBonusEvent(a)?.amount).toBe(15_000)
  })
})
