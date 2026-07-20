// tests/core/attract-dwell-magnitude.test.ts
//
// sw7-10 REWORK RED — H-017: the ABSOLUTE attract dwell, in ROM ticks and in seconds.
//
// WHY THIS FILE EXISTS (round-1 finding F4). The only dwell assertion in the story was
// `attract-rotation.test.ts` — "a complete hiscore run is shorter than a complete banner
// run". That is an ORDERING, and an ordering is scale-invariant: a decimal misread of the
// ROM's hex operands (`#0200`/`#0100` read as 200/100) preserves it perfectly, because
// 100 < 200 just as 256 < 512. Mutation-proven in review: swapping `PAGE_TICKS` from
// `0x200`/`0x100` to `200`/`100` left the FULL suite (1751 tests) GREEN, a 2.56x dwell
// divergence nothing could see.
//
// This is the radix trap that has already drawn blood in this project (tempest tp1-7
// shipped an un-dotted hex operand read as decimal). The 1983 sources are `.RADIX 16`
// (WSCOMN.MAC:5), so a BARE operand is HEX and a TRAILING DOT means DECIMAL. Every dwell
// operand below is bare, therefore hex — verified firsthand in review:
//   * INS   `LDD #0200 / STD PH.TIM`   WSMAIN.MAC:688-689  (expires :707-708)
//   * SCR   `LDD #0200 / STD PH.TIM`   WSMAIN.MAC:718-719  (expires :738-739)
//   * HIS   `LDD #0100 / STD PH.TIM`   WSMAIN.MAC:883-884  (closes  :923-927)
//   * BNR   `CMPD #200` on BN.CNT      TCMES.MAC:440-444
// So the banner/brief/table hold 0x200 = 512 game frames and the board 0x100 = 256 —
// the board dwells for exactly HALF as long, which is the ordering the old test saw.
//
// Two independent assertions per page, deliberately:
//   (1) TICK COUNT — `dwell * TICK_HZ` must equal the ROM's hex literal. Catches the
//       radix misread even if someone also retunes TICK_HZ.
//   (2) ABSOLUTE SECONDS — catches a TICK_HZ regression even if the tick count is right.
// Neither alone is sufficient; the pair pins the magnitude from both ends.
import { describe, it, expect } from 'vitest'
import { pageDwellSeconds, type AttractPage } from '../../src/core/attract'
import { TICK_HZ } from '../../src/core/state'

/** The ROM dwell in GAME FRAMES per page. Bare `.RADIX 16` operands ⇒ HEX. */
const ROM_TICKS: Record<AttractPage, number> = {
  banner: 0x200, // TCMES.MAC:440-444 (BN.CNT >= #200)
  instructions: 0x200, // WSMAIN.MAC:688-689
  scoring: 0x200, // WSMAIN.MAC:718-719
  hiscore: 0x100, // WSMAIN.MAC:883-884
}

const PAGES = Object.keys(ROM_TICKS) as AttractPage[]

describe('sw7-10 F4 — each attract page dwells for its ROM tick count (hex, not decimal)', () => {
  it.each(PAGES)('%s dwells for exactly its ROM PH.TIM/BN.CNT ticks', (page) => {
    const ticks = pageDwellSeconds(page) * TICK_HZ
    expect(ticks, `${page} must dwell ${ROM_TICKS[page]} (0x${ROM_TICKS[page].toString(16)}) game frames`).toBeCloseTo(
      ROM_TICKS[page],
      6,
    )
  })

  it('rejects the DECIMAL misreading of the hex operands', () => {
    // The exact mutation that shipped green in round 1: 0x200 -> 200, 0x100 -> 100.
    // Stated as its own assertion so the failure message names the trap by name.
    const bannerTicks = pageDwellSeconds('banner') * TICK_HZ
    const hiscoreTicks = pageDwellSeconds('hiscore') * TICK_HZ
    expect(bannerTicks, '#0200 is HEX 512, not decimal 200 (.RADIX 16, WSCOMN.MAC:5)').not.toBeCloseTo(200, 0)
    expect(hiscoreTicks, '#0100 is HEX 256, not decimal 100 (.RADIX 16, WSCOMN.MAC:5)').not.toBeCloseTo(100, 0)
  })
})

describe('sw7-10 F4 — the dwell in ABSOLUTE seconds (catches a TICK_HZ regression)', () => {
  // 512 / 20.508 Hz and 256 / 20.508 Hz. Measured, then given +/-0.2s of headroom.
  it('the banner/brief/table each hold for ~24.97 s', () => {
    for (const page of ['banner', 'instructions', 'scoring'] as AttractPage[]) {
      expect(pageDwellSeconds(page), `${page} dwell in seconds`).toBeCloseTo(24.966, 1)
    }
  })

  it('the hi-score board holds for ~12.48 s — exactly half', () => {
    expect(pageDwellSeconds('hiscore')).toBeCloseTo(12.483, 1)
    expect(
      pageDwellSeconds('banner') / pageDwellSeconds('hiscore'),
      'the board is 0x100 against the others 0x200 — a factor of exactly 2',
    ).toBeCloseTo(2, 6)
  })
})
