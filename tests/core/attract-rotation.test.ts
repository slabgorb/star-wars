// tests/core/attract-rotation.test.ts
//
// sw7-10 RED — H-017: the rotating attract page machine (core half).
//
// Ground truth (WSMAIN.MAC, .RADIX 16 via WSCOMN.MAC:5 — verified firsthand):
//   * dispatcher `LDA PHASE / LSLA / LDX #TPHASE / JSR @A(X)` (WSMAIN.MAC:307-312)
//     over the phase table TPHASE (WSMAIN.MAC:330-341): …BNR, INS, SCR, HIS…
//   * the idle loop is a closed cycle HIS→BNR→INS→SCR→HIS:
//       HIS→BNR  WSMAIN.MAC:925-927  (PH.TIM<0 → LDA #PH$BNR)
//       BNR→INS  TCMES.MAC:441-444   (BN.CNT>=#200 → LDA #PH$INS)
//       INS→SCR  WSMAIN.MAC:708-709  (PH.TIM<0 → INC PHASE)
//       SCR→HIS  WSMAIN.MAC:739-740  (PH.TIM<0 → INC PHASE)
//   * dwell: INS/SCR `PH.TIM=#0200` (512) (WSMAIN.MAC:688-689, 718-719);
//     HIS `PH.TIM=#0100` (256) (WSMAIN.MAC:883-884); BANNER threshold BN.CNT>=#0200.
//     So the HI-SCORE page dwells for HALF as long as the others.
//
// Today's clone attract branch (sim.ts:147-149) just advances `t` — one static page.
// So a swept attract never leaves its start page → red. `state.attract` is undefined
// until Dev lands it (see tests/support/sw710-contract.ts).
import { describe, it, expect } from 'vitest'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { attractOn, ext, type AttractPage } from '../support/sw710-contract'

// The ROM cycle order (the observable this cluster pins).
const NEXT: Record<AttractPage, AttractPage> = {
  banner: 'instructions',
  instructions: 'scoring',
  scoring: 'hiscore',
  hiscore: 'banner',
}

interface Segment {
  page: AttractPage
  frames: number
}

/** Sweep attract mode and return the run-length-collapsed page sequence. */
function sweepPages(seconds: number, dt = 1 / 30): Segment[] {
  let s = attractOn('banner')
  const segs: Segment[] = []
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) {
    const page = ext(s).attract?.page
    if (page === undefined) return segs // undefined until Dev lands `attract` → red below
    const last = segs[segs.length - 1]
    if (last && last.page === page) last.frames++
    else segs.push({ page, frames: 1 })
    s = stepGame(s, NO_INPUT, dt)
  }
  return segs
}

describe('sw7-10 H-017 — the attract page rotates through all four screens', () => {
  it('a long idle sweep visits banner, instructions, scoring AND hiscore', () => {
    const seen = new Set(sweepPages(200).map((s) => s.page))
    // Today the page never changes from its start → only one is ever seen (red).
    expect([...seen].sort()).toEqual(['banner', 'hiscore', 'instructions', 'scoring'])
  })

  it('every transition follows the ROM cycle order BNR→INS→SCR→HIS→BNR', () => {
    const segs = sweepPages(200)
    expect(segs.length, 'the page must actually rotate').toBeGreaterThan(3)
    for (let i = 1; i < segs.length; i++) {
      expect(NEXT[segs[i - 1].page], `${segs[i - 1].page} must advance to ${NEXT[segs[i - 1].page]}, not ${segs[i].page}`).toBe(segs[i].page)
    }
  })
})

describe('sw7-10 H-017 — the hi-score page dwells for less time than the others (0x100 vs 0x200)', () => {
  it('a complete hiscore run is shorter than a complete banner run', () => {
    const segs = sweepPages(300)
    // Interior segments are complete (bounded by a transition on both sides); the
    // first/last may be partial.
    const interior = segs.slice(1, -1)
    const hiscore = interior.find((s) => s.page === 'hiscore')
    const banner = interior.find((s) => s.page === 'banner')
    expect(hiscore, 'need a complete hiscore run to measure its dwell').toBeDefined()
    expect(banner, 'need a complete banner run to measure its dwell').toBeDefined()
    expect(hiscore!.frames).toBeLessThan(banner!.frames)
  })
})
