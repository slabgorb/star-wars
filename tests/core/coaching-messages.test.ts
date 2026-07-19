// tests/core/coaching-messages.test.ts
//
// sw7-10 RED — H-022: in-flight coaching messages (core half).
//
// Ground truth (TCMES.MAC defs + WSMAIN.MAC call sites, .RADIX 16 via WSCOMN.MAC:5 —
// every call site verified firsthand; "a label's comment is not a caller"):
//   * SFB <SHOOT FIREBALLS>  (TCMES.MAC:618) — space phase, first wave, alternates with
//     STF (WSMAIN.MAC:2987-2998, gated on SC.FWV first-wave).
//   * STF <SHOOT TIE FIGHTERS> (TCMES.MAC:619) — the ELSE of that alternation.
//   * ACW <AVOID CATWALKS> (TCMES.MAC:620) — base/trench, first wave (WSMAIN.MAC:3203).
//   * BON is defined <STARTING WAVE BONUS> (TCMES.MAC:617); its call site comment
//     (WSMAIN.MAC:3362 `;"DEATH STAR BONUS EARNED"`) is STALE and the clone already
//     inherited it (state.ts:171). The on-screen text is "STARTING WAVE BONUS".
//
// Clone hooks: initialState() IS a first-wave space frame (wave 1, phase 'space',
// mode 'playing'). NO_INPUT fires nothing, so the space phase never clears — the sweep
// stays in the first wave. Coaching rides `state.coaching` (undefined until Dev lands
// it → red). Already-green siblings NOT re-pinned here: BRE "BONUS FOR REMAINING ENERGY"
// and the 50,000-towers banner shipped in sw7-4 (drawTrenchBanners).
import { describe, it, expect } from 'vitest'
import { initialState, type GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { ext, withExt, COACH, BON_MISLABEL } from '../support/sw710-contract'

const DT = 1 / 60

/** Coaching messages observed over a NO_INPUT sweep from `start`. */
function coachingOverSweep(start: GameState, frames: number): string[] {
  let s = start
  const seen: string[] = []
  for (let i = 0; i < frames; i++) {
    s = stepGame(s, NO_INPUT, DT)
    const c = ext(s).coaching
    if (typeof c === 'string') seen.push(c)
  }
  return seen
}

describe('sw7-10 H-022 — first-wave space shows the SHOOT FIREBALLS / SHOOT TIE FIGHTERS hints', () => {
  it('the first space frame sets a first-wave coaching hint', () => {
    const c = ext(stepGame(initialState(1983), NO_INPUT, DT)).coaching
    expect(c, 'first-wave space must set a coaching hint').toBeTruthy()
    expect([COACH.shootFireballs, COACH.shootTies]).toContain(c)
  })

  it('both hints appear over the first wave (the ROM SFB/STF alternation)', () => {
    const seen = new Set(coachingOverSweep(initialState(1983), 300))
    expect(seen.has(COACH.shootFireballs), 'SHOOT FIREBALLS must appear').toBe(true)
    expect(seen.has(COACH.shootTies), 'SHOOT TIE FIGHTERS must appear').toBe(true)
  })

  it('a LATER wave shows neither space hint (first-wave-only, SC.FWV gate)', () => {
    // Guard (passes pre-GREEN while coaching is absent; bites if Dev over-triggers).
    const wave3 = withExt(initialState(1983), { wave: 3 })
    const seen = new Set(coachingOverSweep(wave3, 300))
    expect(seen.has(COACH.shootFireballs)).toBe(false)
    expect(seen.has(COACH.shootTies)).toBe(false)
  })
})

describe('sw7-10 H-022 — the trench shows AVOID CATWALKS on the first wave', () => {
  it('a first-wave trench frame sets the AVOID CATWALKS hint', () => {
    const trench = withExt(initialState(1983), { phase: 'trench', wave: 1 })
    const seen = new Set(coachingOverSweep(trench, 120))
    expect(seen.has(COACH.avoidCatwalks), 'AVOID CATWALKS must appear in the first-wave trench').toBe(true)
  })
})

describe('sw7-10 H-022 — the BON mislabel never leaks into a coaching message', () => {
  it('no swept coaching message is the stale "DEATH STAR BONUS EARNED"', () => {
    // Refutation guard for the WSMAIN.MAC:3362 stale comment (MS.BON is "STARTING WAVE
    // BONUS"). Passes pre-GREEN; bites the instant a real BON message copies the comment.
    const seen = coachingOverSweep(initialState(1983), 300)
    expect(seen).not.toContain(BON_MISLABEL)
  })
})
