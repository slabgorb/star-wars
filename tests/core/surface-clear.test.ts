// tests/core/surface-clear.test.ts
//
// Story sw4-3 — the finite surface field never soft-locks. Migrated by sw7-18
// (R11c): D-019 (end by traversal only) + D-015 (wave 1 has no ground phase).
//
// sw4-3 made the surface a FINITE authored maze and fixed sw3-3's soft-lock (a
// player who missed a tower could never meet the kill quota). Its escape hatch
// was scroll-completion PLUS an all-towers-killed EARLY clear. sw7-18 keeps the
// no-soft-lock guarantee but re-bases the mechanism on the ROM:
//
//   - the run ends by TRAVERSAL alone — five $8000 passes, `gdSeq >= 5`
//     (WSMAIN.MAC:1678); killing every tower banks the 50,000 but does NOT end
//     the phase early (surface-traversal-end.test.ts owns the end condition).
//   - wave 1 has NO ground phase (D-015): these fixtures run on real ground waves
//     (2+), entered directly via `enterPhase`.
//
// This suite pins the no-soft-lock + bonus-gating contract:
//   1. A missed-tower run still clears (traversal), never strands.
//   2. A scroll-completion clear with towers left un-killed banks NO bonus.
//   3. Killing every tower banks the 50k MID-PHASE — without cutting the run short.
//   4. Wave 2 (BUNK, 0 towers) does NOT insta-clear on entry, nor gift a free 50k.
//
// Sacred boundary: pure core, no DOM, no time except dt, no RNG except state's.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  towersForWave,
  SURFACE_CLEAR_BONUS,
  type GameState,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'
import { mazeForWave } from '../../src/core/surfaceMazes'

const DT = 0.05

/** A fresh surface at a chosen wave, entered exactly as progression would (via
 *  enterPhase, so gdSeq / the scroll seed reset). lives is padded so surface fire
 *  can't end the run before the traversal completes — we probe the clear, not death. */
function enterSurface(seed: number, wave: number, lives = 9999): GameState {
  return { ...enterPhase({ ...initialState(seed), wave }, 'surface'), lives }
}

/** Fly the surface with NO input until it clears (or give up). Returns the state
 *  and every event seen. The accelerating traversal ends in bounded time. */
function flyUntilClear(s: GameState, maxSteps = 6000): { s: GameState; events: GameEvent[] } {
  const events: GameEvent[] = []
  for (let i = 0; i < maxSteps && s.phase === 'surface' && !s.gameOver; i++) {
    s = stepGame(s, NO_INPUT, DT)
    events.push(...(s.events as GameEvent[]))
  }
  return { s, events }
}

// --- Finding 1: missed towers must NOT soft-lock the surface ------------------

describe('sw4-3 — the finite surface field never soft-locks', () => {
  it('clears to the trench even when no tower is shot (traversal-completion)', () => {
    // The soft-lock repro: fly a ground wave without firing. The maze traversal
    // completes; the surface must still end in the trench, not trap the run.
    const { s } = flyUntilClear(enterSurface(1983, 3))
    expect(s.gameOver).toBe(false) // padded lives — testing the phase, not death
    expect(s.phase).toBe('trench')
  })

  it('does not require the tower quota to be met to leave the surface', () => {
    // phaseKills stays 0 (nothing shot), yet the phase advances — the exit depends
    // on traversal (gdSeq), not phaseKills >= towersForWave.
    const { s } = flyUntilClear(enterSurface(7, 5))
    expect(s.phase).toBe('trench')
    expect(s.phaseKills).toBeLessThan(towersForWave(5)) // left WITHOUT clearing all towers
  })
})

// --- Finding 1b: the 50k bonus is gated on actually clearing the towers -------

describe('sw4-3 — the 50,000 bonus fires only when all towers are killed', () => {
  it('a scroll-completion clear with towers left un-killed banks NO bonus', () => {
    const start = enterSurface(1983, 3)
    const scoreBefore = start.score
    const { s, events } = flyUntilClear(start)
    expect(s.phase).toBe('trench')
    expect(s.score).toBe(scoreBefore) // no kills, no bonus — score untouched
    expect(events.some((e) => e.type === 'tower-bonus')).toBe(false)
  })

  it('killing every tower banks the 50k MID-PHASE without cutting the run short (D-019)', () => {
    // At the quota with towers present, the run banks the cleared-all bonus the
    // frame the last tower falls — and KEEPS FLYING the traversal (no early exit).
    const wave = 3
    const s0: GameState = {
      ...enterSurface(1983, wave),
      phaseKills: towersForWave(wave), // all towers accounted for
      score: 0,
      towerBonusAwardedAt: null,
    }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.phase).toBe('surface') // still on the surface — the bonus does not clear it
    expect(s1.score).toBe(SURFACE_CLEAR_BONUS)
    // Flying on to the natural end banks no SECOND bonus.
    const { s, events } = flyUntilClear(s1)
    expect(s.phase).toBe('trench')
    expect(events.filter((e) => e.type === 'tower-bonus')).toHaveLength(0) // already banked before the fly
    expect(s.score).toBe(SURFACE_CLEAR_BONUS)
  })
})

// --- Finding: wave 2 (BUNK, 0 towers) must not insta-clear or gift the bonus --

describe('sw4-3 — the bunkers-only wave 2 flies through, no free clear', () => {
  it('wave 2 has a 0-tower maze but the surface does NOT insta-clear on entry', () => {
    expect(mazeForWave(2).name).toBe('BUNK')
    expect(towersForWave(2)).toBe(0)
    // One frame in, the field is laid but the run must still be on the surface —
    // a 0-tower quota must not fire any clear gate the instant the phase opens.
    let s = enterSurface(1983, 2)
    s = stepGame(s, NO_INPUT, DT)
    expect(s.phase).toBe('surface')
  })

  it('wave 2 banks no 50,000 bonus (there were no towers to clear)', () => {
    const start = { ...enterSurface(1983, 2), score: 0 }
    const { s, events } = flyUntilClear(start)
    expect(s.phase).toBe('trench') // it still ends (traversal-completion)…
    expect(s.score).toBe(0) // …but with no free cleared-all bonus
    expect(events.some((e) => e.type === 'tower-bonus')).toBe(false)
  })
})
