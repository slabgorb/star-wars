// tests/core/late-wave-fire-cadence.test.ts
//
// sw8-2 RED (AC7) — the deeper TGPROB fire-probability rows (sw7-24 T5a).
//
// The 1983 cabinet escalates TIE fire aggression per wave through the TGPROB table
// (WSCPU.MAC:736). Verified verbatim from ~/Projects/star-wars-1983-source-text WSCPU.MAC:736-748
// — the THRESHOLD column is the unsigned P.RND1 compare; a shot fires when the draw is STRICTLY
// GREATER, so P(fire | window) = (255 − threshold)/256:
//
//     row 0..7 : 80 80 80 40 80 20 20 80
//     row 8    : 60   (≈62%)   .PROB 03,060,6
//     row 9    : 40   (≈75%)   .PROB 03,040,6
//     row 10   : 30   (≈81%)   .PROB 03,030,6
//     TGPROZ:  ← the table ENDS at row 10 (11 rows defined)
//
// The port (state.ts FIRE_THRESHOLD) stubs rows 8/9/10 at 0x80 (saturating row 7) and carries
// 0x80 through indices 11..15 — so late-wave fire never escalates past ~50%. The ROM CLAMPS the
// fire-index to the last DEFINED row (WSCPU.MAC:636-644: `CMPB #TGPROZ-TGPROB/4 / IFHS /
// LDU #TGPROZ-4`), so waves past 11 reuse row 10 (03,030,6) — NOT row 7's 0x80. This suite pins
// the ROM rows and that saturation.
//
// Pure DATA transcription: reads the constants and the `waveParams` index the sim actually fires
// through. No DOM/time/rng.

import { describe, it, expect } from 'vitest'
import { FIRE_THRESHOLD, FIRE_MASK } from '../../src/core/state'
import { waveParams } from '../../src/core/gameRules'

describe('sw8-2 AC7 — deeper TGPROB fire-probability rows (WSCPU.MAC:736)', () => {
  it('ports the ROM threshold for rows 8, 9, 10 (60, 40, 30 — escalating aggression)', () => {
    // Today all three are stubbed at 0x80 (row 7) → RED.
    expect(FIRE_THRESHOLD[8]).toBe(0x60)
    expect(FIRE_THRESHOLD[9]).toBe(0x40)
    expect(FIRE_THRESHOLD[10]).toBe(0x30)
  })

  it('saturates indices past the last defined ROM row (11..15 reuse row 10 = 0x30)', () => {
    // The ROM clamps the fire-index to the last defined wave (row 10), so deep waves reuse
    // 03,030,6 — not row 7's 0x80. Today the port carries 0x80 through → RED.
    for (let i = 11; i <= 15; i++) expect(FIRE_THRESHOLD[i]).toBe(0x30)
  })

  it('escalates the fire index the sim fires through: wave 9 → 0x60, wave 11 → 0x30, wave 12 saturates', () => {
    // `waveParams` addresses FIRE_THRESHOLD at fireIndex = min(wave-1, 15). The "wave after the
    // last row" (12 → index 11) is where a wrong fallthrough hides — it must reuse row 10, not
    // row 7.
    expect(waveParams(9).fireThreshold).toBe(0x60)
    expect(waveParams(11).fireThreshold).toBe(0x30)
    expect(waveParams(12).fireThreshold).toBe(0x30)
  })

  it('GUARD: rows 0..7 (already ROM-correct) and the cadence-mask column are unchanged', () => {
    // The early rows are already faithful — the fix must not disturb them — and the cadence MASK
    // column (0x03 for rows 8..10) is already correct. Keeps the change scoped to the three
    // stubbed thresholds + their saturation.
    expect(Array.from(FIRE_THRESHOLD.slice(0, 8))).toEqual([0x80, 0x80, 0x80, 0x40, 0x80, 0x20, 0x20, 0x80])
    expect(FIRE_MASK[8]).toBe(0x03)
    expect(FIRE_MASK[9]).toBe(0x03)
    expect(FIRE_MASK[10]).toBe(0x03)
  })
})
