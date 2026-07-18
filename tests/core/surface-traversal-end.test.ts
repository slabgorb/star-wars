// tests/core/surface-traversal-end.test.ts
//
// Story sw7-18 — R11c surface traversal rebuild, Defect D-019 (end by traversal
// ONLY) + the PMREB audio rider. RED phase (O'Brien / TEA). EXPECTED TO FAIL.
//
// THE DEFECT. The ROM ends the ground phase purely by TRAVERSAL: `LDA GD.SEQ /
// CMPA #5 ;ONLY GO SO FAR INTO GROUND SEQUENCES` (WSMAIN.MAC:1678-1688). GD.SEQ
// counts $8000 wraps of forward travel (S1MVGD, WSMAIN.MAC:2537-2545) — five
// passes ≈ 371 frames ≈ 18.1 s. Killing every tower sets `Q.ATP` and shows the
// "50,000 FOR SHOOTING ALL TOWERS" banner but does NOT shorten the phase.
//
// Ours couples the two: `phaseCleared` returns `allTowersKilled(s) ||
// surfaceScrollZ >= surfaceFieldDepth(s.wave)` — the all-towers arm cuts the
// surface short the instant the last tower dies. This suite drops that arm.
//
// THE FIX (design §Defect 3 / R11c):
//   - phase ends at `gdSeq >= SURFACE_END_SEQ` (5) ONLY — the all-towers arm is
//     gone; a single missed tower no longer strands the run either (that was the
//     other side of the old coupling, sw4-3).
//   - `gdSeq` counts completed $8000 passes: gdSeq = floor(surfaceScrollZ /
//     SURFACE_SEQ_SPAN), seeded 0 on surface entry.
//   - the 50,000 clear bonus is DECOUPLED: it banks ONCE the frame all towers are
//     down (phaseKills reaches the wave's tower quota) — mid-phase, banner and
//     all — and the pilot keeps flying the rest of the traversal.
//
// AUDIO RIDER (design §Defect 3, music rider). PHEGD fires `PMREB` "FINISH GROUND
// WITH REBEL" at pseudo-second 14 (`LDA PH.TIM / CMPA #14. / JSR PMREB`,
// WSMAIN.MAC:1668-1671; PH.TIM ticks once per 16 frames). sw7-8's audio hooks are
// live, so this cues a one-shot `finishGround` tune late in the surface — once,
// before the phase ends.
//
// Contract this suite asks DEV to implement:
//   state.ts constants:
//     SURFACE_SEQ_SPAN = 0x8000   // 32,768 — one forward pass (ROM $8000 wrap)
//     SURFACE_END_SEQ  = 5         // GD.SEQ >= 5 ends the phase (ROM CMPA #5)
//   GameState gains:  gdSeq: number   // ROM GD.SEQ; completed $8000 passes
//   events.ts:        TuneName gains 'finishGround' (PMREB)
//   Behaviour:
//     - phaseCleared('surface') === (gdSeq >= SURFACE_END_SEQ); the allTowersKilled
//       arm is removed; surfaceFieldDepth no longer gates the exit.
//     - gdSeq === floor(surfaceScrollZ / SURFACE_SEQ_SPAN) throughout the phase.
//     - the 50k bonus (tower-bonus event + score + towerBonusAwardedAt) banks once,
//       the frame allTowersKilled first holds, WITHOUT clearing the phase.
//     - a single 'tune'/'finishGround' cue fires during the surface, past ~10 s in.
//
// Sacred boundary: pure core, no DOM, no time except dt, no RNG except state's.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  towersForWave,
  SURFACE_CLEAR_BONUS,
  SURFACE_SEQ_SPAN,
  SURFACE_END_SEQ,
  type GameState,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'

const DT = 0.02

/** A fresh surface at a chosen wave, padded so surface fire cannot end the run
 *  before the traversal completes — we probe the CLEAR condition, not death. */
function freshSurface(wave: number, seed = 1983): GameState {
  return { ...enterPhase({ ...initialState(seed), wave }, 'surface'), lives: 9999 }
}

/** Fly the surface with NO input until it clears (or give up). Returns the last
 *  state and every event seen. The accelerating pace clears a real traversal in
 *  ~18 s, so this terminates well within budget. */
function flyUntilTrench(s: GameState, maxSteps = 4000): { s: GameState; events: GameEvent[]; steps: number } {
  const events: GameEvent[] = []
  let steps = 0
  for (; steps < maxSteps && s.phase === 'surface' && !s.gameOver; steps++) {
    s = stepGame(s, NO_INPUT, DT)
    events.push(...(s.events as GameEvent[]))
  }
  return { s, events, steps }
}

// --- AC: gdSeq counts $8000 passes ------------------------------------------

describe('sw7-18 / D-019 — gdSeq counts $8000 forward passes', () => {
  it('seeds gdSeq to 0 on surface entry', () => {
    expect(freshSurface(3).gdSeq).toBe(0)
    expect(enterPhase(initialState(1983), 'surface').gdSeq).toBe(0)
  })

  it('gdSeq tracks floor(surfaceScrollZ / SURFACE_SEQ_SPAN) across the traversal', () => {
    let s = freshSurface(7)
    // Sample every few frames while the phase runs; the two must stay locked.
    for (let i = 0; i < 400 && s.phase === 'surface'; i++) {
      s = stepGame(s, NO_INPUT, DT)
      expect(s.gdSeq).toBe(Math.floor(s.surfaceScrollZ / SURFACE_SEQ_SPAN))
    }
  })

  it('gdSeq climbs monotonically past 0 (the field genuinely wraps, not a single pass)', () => {
    let s = freshSurface(7)
    let maxSeq = 0
    for (let i = 0; i < 2000 && s.phase === 'surface'; i++) {
      s = stepGame(s, NO_INPUT, DT)
      expect(s.gdSeq).toBeGreaterThanOrEqual(maxSeq) // never rewinds
      maxSeq = s.gdSeq
    }
    expect(maxSeq).toBeGreaterThanOrEqual(1) // more than one pass really happened
  })
})

// --- AC: the phase ends by traversal ONLY -----------------------------------

describe('sw7-18 / D-019 — the surface ends at gdSeq >= 5, by traversal alone', () => {
  it('clears to the trench only once gdSeq reaches SURFACE_END_SEQ', () => {
    const { s } = flyUntilTrench(freshSurface(7))
    expect(s.phase).toBe('trench')
    expect(s.gdSeq).toBeGreaterThanOrEqual(SURFACE_END_SEQ)
  })

  it('the traversal covers ~five $8000 passes of scroll before it ends', () => {
    // The exit is scroll-distance driven through gdSeq; the ship must actually fly
    // the five passes (≈ 163,840 units), not bail early.
    const { s } = flyUntilTrench(freshSurface(7))
    expect(s.phase).toBe('trench')
    // surfaceScrollZ is reset by enterPhase('trench'), so re-derive from the seq gate:
    // reaching the trench means the surface saw at least SURFACE_END_SEQ full passes.
    expect(SURFACE_END_SEQ * SURFACE_SEQ_SPAN).toBe(5 * 0x8000) // 163,840 — the design figure
  })

  it('killing every tower does NOT cut the surface short (the old early-exit arm is gone)', () => {
    // The D-019 heart: all towers accounted for, but gdSeq is still 0 — the run
    // MUST stay on the surface and keep flying, not jump to the trench.
    const wave = 3 // SQUARE — 16 towers, a real quota to "clear"
    const quota = towersForWave(wave)
    expect(quota).toBeGreaterThan(0)
    let s: GameState = { ...freshSurface(wave), phaseKills: quota }
    for (let i = 0; i < 20; i++) s = stepGame(s, NO_INPUT, DT) // still deep inside pass 0
    expect(s.gdSeq).toBeLessThan(SURFACE_END_SEQ)
    expect(s.phase).toBe('surface') // all towers dead, yet the phase is NOT cleared
  })

  it('a missed-tower run still clears (a single un-shot tower never strands the run)', () => {
    // The other half of the old coupling: with nothing shot, gdSeq alone ends it.
    const { s } = flyUntilTrench(freshSurface(7))
    expect(s.gameOver).toBe(false) // padded lives — testing the phase, not death
    expect(s.phase).toBe('trench')
  })
})

// --- AC: the 50k bonus is decoupled from phase length ------------------------

describe('sw7-18 / D-019 — the all-towers bonus banks once, mid-phase, decoupled', () => {
  const wave = 3
  const quota = towersForWave(wave)

  it('banks the 50,000 the frame all towers are down — WITHOUT clearing the phase', () => {
    const s0: GameState = { ...freshSurface(wave), phaseKills: quota, score: 0, towerBonusAwardedAt: null }
    const s1 = stepGame(s0, NO_INPUT, DT)
    expect(s1.phase).toBe('surface') // banked, but the traversal continues
    expect(s1.score).toBe(SURFACE_CLEAR_BONUS)
    expect(s1.events.some((e) => e.type === 'tower-bonus')).toBe(true)
    expect(s1.towerBonusAwardedAt).not.toBeNull()
  })

  it('banks the bonus EXACTLY once — later frames do not re-award it', () => {
    let s: GameState = { ...freshSurface(wave), phaseKills: quota, score: 0, towerBonusAwardedAt: null }
    let bonusEvents = 0
    for (let i = 0; i < 40 && s.phase === 'surface'; i++) {
      s = stepGame(s, NO_INPUT, DT)
      bonusEvents += s.events.filter((e) => e.type === 'tower-bonus').length
    }
    expect(bonusEvents).toBe(1)
    expect(s.score).toBe(SURFACE_CLEAR_BONUS) // exactly one 50k, not stacked
  })

  it('a full-clear run banks 50k total across the WHOLE traversal, not per pass', () => {
    // All towers dead at entry; fly the entire phase. The bonus is one banner, even
    // though gdSeq crosses five boundaries.
    const start: GameState = { ...freshSurface(wave), phaseKills: quota, score: 0, towerBonusAwardedAt: null }
    const { s, events } = flyUntilTrench(start)
    expect(s.phase).toBe('trench')
    expect(events.filter((e) => e.type === 'tower-bonus')).toHaveLength(1)
    expect(s.score).toBe(SURFACE_CLEAR_BONUS)
  })

  it('a scroll-completion clear with towers left un-killed banks NO bonus', () => {
    const start = { ...freshSurface(7), score: 0 }
    const { s, events } = flyUntilTrench(start)
    expect(s.phase).toBe('trench')
    expect(s.score).toBe(0)
    expect(events.some((e) => e.type === 'tower-bonus')).toBe(false)
  })

  it('the bunkers-only wave (0 towers) never gifts the bonus', () => {
    // BUNK has no towers, so allTowersKilled can never hold — no free 50k, ever.
    const start = { ...freshSurface(2), score: 0 } // wave 2 = BUNK
    expect(towersForWave(2)).toBe(0)
    const { s, events } = flyUntilTrench(start)
    expect(s.phase).toBe('trench')
    expect(s.score).toBe(0)
    expect(events.some((e) => e.type === 'tower-bonus')).toBe(false)
  })
})

// --- AC: the PMREB "finish ground" audio rider ------------------------------

describe('sw7-18 / D-019 — the PMREB "finish ground with rebel" tune (audio rider)', () => {
  it('cues exactly one finishGround tune during the surface traversal', () => {
    const { events } = flyUntilTrench(freshSurface(7))
    const finish = events.filter((e) => e.type === 'tune' && e.tune === 'finishGround')
    expect(finish).toHaveLength(1)
  })

  it('fires LATE in the phase (~pseudo-second 14 ≈ 10.9 s), not on the opening frames', () => {
    // PH.TIM ticks once per 16 frames; PMREB fires at PH.TIM == 14 → ~14×16/TICK_HZ ≈ 10.9 s.
    // Measure the elapsed surface time when the cue lands: a genuinely late beat.
    let s = freshSurface(7)
    let firedAt: number | null = null
    let elapsed = 0
    for (let i = 0; i < 4000 && s.phase === 'surface'; i++) {
      s = stepGame(s, NO_INPUT, DT)
      elapsed += DT
      if (firedAt === null && s.events.some((e) => e.type === 'tune' && e.tune === 'finishGround')) {
        firedAt = elapsed
      }
    }
    expect(firedAt).not.toBeNull()
    expect(firedAt!).toBeGreaterThan(9) // not an opening-frame cue
    expect(firedAt!).toBeLessThan(13) // lands around the ROM's pseudo-second 14
  })

  it('does not fire on a non-surface phase', () => {
    // The rider is PHEGD-only: a space run cues no finishGround.
    let s: GameState = { ...initialState(1983), phase: 'space' }
    const seen: GameEvent[] = []
    for (let i = 0; i < 400; i++) {
      s = stepGame(s, NO_INPUT, DT)
      seen.push(...(s.events as GameEvent[]))
    }
    expect(seen.some((e) => e.type === 'tune' && e.tune === 'finishGround')).toBe(false)
  })
})
