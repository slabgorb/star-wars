// tests/core/wave-force-bonus.test.ts
//
// Story sw7-4 (R4), sub-task S-012 — RED phase. The "USE THE FORCE" clean-run
// bonus is WAVE-SCALED, not the flat 5,000 the clone awards today (state.ts
// FORCE_BONUS = 5000).
//
// PRIMARY SOURCE — Warp Speed (~/Projects/star-wars-1983-source-text; every file
// here is .RADIX 16, set by WSCOMN.MAC:5):
//
//   WSGAS.MAC:509-513  TSCFRC: the bonus table — FIVE entries, 3 bytes of packed
//     BCD each (value = b0*10000 + b1*100 + b2, each hex byte read as a DECIMAL
//     digit-pair, so 0x50 is the digits "50"):
//        .BYTE 00,50,00   ;USE THE FORCE IN THE TRENCH   ->  5,000
//        .BYTE 01,00,00                                   -> 10,000
//        .BYTE 02,50,00                                   -> 25,000
//        .BYTE 05,00,00                                   -> 50,000
//        .BYTE 10,00,00   ;LEVEL 5 AND ABOVE              -> 100,000
//     (The SAME five values the 2026-07-15 primary-source audit records for S-012.)
//
//   WSGAS.MAC:404-416  GETFRP: the consumer.
//        LDB GM.WAV
//        CMPB #TSCFRZ-TSCFRC/3      ; entry count = 5
//        IFHS                       ; GM.WAV >= 5 ?
//        LDU #TSCFRZ-3              ; ";HIGHER LEVELS USE MAX SCORE" -> clamp to last (100,000)
//        ELSE  LSLB / ADDB GM.WAV  ; index = GM.WAV*3 bytes, used DIRECTLY -> 0-based
//     GM.WAV starts at 0 (WSMAIN.MAC:1053 "LDA #00 / STA GM.WAV ;START AT EASY"),
//     so entry 0 (5,000) is the FIRST wave. For GM.WAV >= 5 the pointer is CLAMPED
//     to the last entry — no wrap, no fall-off.
//
// Our `state.wave` is 1-based; `romWave0(wave) = wave-1` IS GM.WAV (sw7-2). So the
// table is indexed by `wave-1`, clamped to the last entry — which is exactly WHY
// this story depends on sw7-2's wave-parity fix.
//
// `FORCE_BONUS_BY_WAVE` and `forceBonusForWave` do not exist pre-GREEN; the import
// error IS the RED signal until Dev adds them and wires the award/banner off the
// flat FORCE_BONUS onto the accessor.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  FORCE_BONUS_BY_WAVE,
  forceBonusForWave,
  type GameState,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'

// A port seated inside the ROM $800 approach window (sw3-15), so a single armed
// step detonates. Same seat force-bonus.test.ts uses.
const IN_WINDOW_PORT: Vec3 = [0, 0, -300]

/** A trench state on the frame the run is won at a given (1-based) `wave`: the
 *  proton torpedo is armed and the port sits in the window. `trenchShotsFired: 1`
 *  is the clean floor (only the killing torpedo). */
function wonRunAtWave(wave: number, trenchShotsFired = 1): GameState {
  return {
    ...enterPhase(initialState(1983), 'trench'),
    mode: 'playing',
    wave,
    trenchObstacles: [],
    exhaustPort: { pos: [...IN_WINDOW_PORT] as Vec3 },
    portTorpedoArmed: true,
    trenchShotsFired,
  }
}

const detonate = (s: GameState): GameState => stepGame(s, NO_INPUT, 1 / 60)

const forceBonusEvent = (s: GameState): { type: 'force-bonus'; amount: number } | undefined =>
  s.events.find(
    (e): e is { type: 'force-bonus'; amount: number } => e.type === 'force-bonus',
  )

describe('S-012 — the force-bonus table (WSGAS.MAC:509-513 TSCFRC, packed BCD)', () => {
  it('is the ROM five: 5,000 / 10,000 / 25,000 / 50,000 / 100,000', () => {
    expect(FORCE_BONUS_BY_WAVE).toEqual([5_000, 10_000, 25_000, 50_000, 100_000])
  })

  it('the first entry is BCD 5,000, not the raw-hex misreading of `00,50,00`', () => {
    // 0x50 is the DIGIT PAIR "50" (BCD), giving 5,000 — not the byte value 0x0500 = 1,280.
    expect(FORCE_BONUS_BY_WAVE[0]).toBe(5_000)
    expect(FORCE_BONUS_BY_WAVE[0]).not.toBe(0x0500)
  })
})

describe('S-012 — forceBonusForWave is 0-based on the wave (romWave0 = wave-1; why it needs sw7-2)', () => {
  it('wave 1 gets the SMALLEST bonus (index 0 = 5,000), NOT 10,000', () => {
    // The whole point of the sw7-2 dependency. A 1-based index (BY_WAVE[wave]) would
    // hand wave 1 the SECOND entry, 10,000 — silently doubling the base bonus.
    expect(forceBonusForWave(1)).toBe(5_000)
  })

  it('climbs the table by wave: 2->10k, 3->25k, 4->50k, 5->100k', () => {
    expect(forceBonusForWave(2)).toBe(10_000)
    expect(forceBonusForWave(3)).toBe(25_000)
    expect(forceBonusForWave(4)).toBe(50_000)
    expect(forceBonusForWave(5)).toBe(100_000)
  })
})

describe('S-012 — the walk-off: waves past the table CLAMP to the last entry (GETFRP IFHS)', () => {
  // THE LOAD-BEARING TEST. `state.wave` is bumped every won run with NO cap
  // (sim.ts clearRun: `wave: s.wave + 1`), so the port reaches waves the 5-entry
  // table does not cover — a state the ROM reaches too (GM.WAV climbs to 98).
  // GETFRP clamps: `CMPB #...(=5) / IFHS / LDU #TSCFRZ-3 ;HIGHER LEVELS USE MAX
  // SCORE`. A naive `FORCE_BONUS_BY_WAVE[wave-1]` returns `undefined` at wave 6 —
  // the silent walk-off (the bug lives where the table ENDS).
  it('wave 6 (index 5, the first past the end) clamps to 100,000', () => {
    expect(forceBonusForWave(6)).toBe(100_000)
  })

  it('stays clamped for every deeper wave — 7, 10, 42, and the ROM cap 98', () => {
    for (const w of [7, 10, 42, 98]) expect(forceBonusForWave(w)).toBe(100_000)
  })

  it('the clamp value IS the last table entry, not a hardcoded 100,000 that could drift', () => {
    expect(forceBonusForWave(99)).toBe(FORCE_BONUS_BY_WAVE[FORCE_BONUS_BY_WAVE.length - 1])
  })
})

describe('S-012 — end-to-end: a clean port kill awards the WAVE bonus (force-bonus event)', () => {
  // Asserted on the `force-bonus` EVENT amount, which isolates S-012 from the
  // per-shield bonus (S-013) landing on the same detonation frame.
  it('wave 1 clean run: the force bonus is 5,000 (the base wave, unchanged)', () => {
    expect(forceBonusEvent(detonate(wonRunAtWave(1)))?.amount).toBe(5_000)
  })

  it('wave 3 clean run: the force bonus is 25,000 — NOT the flat 5,000 awarded today', () => {
    expect(forceBonusEvent(detonate(wonRunAtWave(3)))?.amount).toBe(25_000)
  })

  it('wave 6 clean run: the force bonus clamps to 100,000', () => {
    expect(forceBonusEvent(detonate(wonRunAtWave(6)))?.amount).toBe(100_000)
  })

  it('a DIRTY run (prior trench shots) still awards NO force bonus at any wave', () => {
    // Keep-behaviour guard: S-012 rescales the amount but does not touch the
    // clean-run gate (trenchShotsFired <= 1).
    expect(forceBonusEvent(detonate(wonRunAtWave(3, 4)))).toBeUndefined()
  })
})
