// tests/core/surface-clear.test.ts
//
// Story sw4-3 — RED rework (round-trip 1, Reviewer REJECT). Imperator Furiosa.
//
// The Reviewer proved a SOFT-LOCK: sw4-3 made the surface a FINITE authored maze
// but left sw3-3's clear gate ("surface clears only when phaseKills >= the tower
// count") unchanged. A player who misses ANY tower — and towers sit out to
// x = ±$8000, some never on-screen — can never reach the quota, so the run is
// trapped on the surface forever (only escape: a forced game-over). The old
// endless spawner hid this; the finite field exposes it.
//
// AUTHENTIC MODEL (WSGRND / ROM). The surface is a scroll-COMPLETION approach:
// the ship flies over the maze and drops into the trench when the field has
// passed. Destroying every tower is the 50,000 "cleared all towers" BONUS
// (WSGRND `sub_973A`: the bonus fires on the tower-kill that drives "towers
// left" to 0) and an EARLY clear — it is not the only way off the surface.
//
// This suite pins the corrected clear contract; it FAILS on the current code
// (which soft-locks / insta-clears the bunker wave) and drives the GREEN fix:
//   1. Missed towers still clear the surface (via scroll-completion) — no lock.
//   2. A scroll-completion clear with towers left un-killed banks NO 50k bonus.
//   3. Killing every tower still clears EARLY and banks the 50k (sw3-3 preserved).
//   4. Wave 2 (BUNK, 0 towers) does NOT insta-clear on entry, nor bank a free 50k.
//
// Sacred boundary: pure core, no DOM, no time except dt, no RNG except state's.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  towersForWave,
  SURFACE_CLEAR_BONUS,
  type GameState,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'
import { mazeForWave } from '../../src/core/surfaceMazes'

const DT = 0.05

/** Drive a fresh run through space→surface at a chosen wave (returns on the
 *  first surface frame). lives is padded so surface fire can't end the run
 *  before the field scrolls past — we are probing the clear condition, not death. */
function enterSurface(seed: number, wave: number, lives = 9999): GameState {
  let s: GameState = {
    ...initialState(seed),
    wave,
    lives,
    phase: 'space',
    phaseKills: 9999, // ≥ the space quota — force the space→surface cross
    enemies: [],
    enemyShots: [],
  }
  for (let i = 0; i < 200 && s.phase !== 'surface'; i++) s = stepGame(s, NO_INPUT, DT)
  return s
}

/** Fly the surface with NO input until it clears (or give up). Returns the state
 *  and every event seen along the way. Budget is generous and scroll-rate
 *  agnostic — the field is finite, so it MUST end in bounded time. */
function flyUntilClear(s: GameState, maxSteps = 6000): { s: GameState; events: GameEvent[] } {
  const events: GameEvent[] = []
  for (let i = 0; i < maxSteps && s.phase === 'surface' && !s.gameOver; i++) {
    s = stepGame(s, NO_INPUT, DT)
    events.push(...(s.events as GameEvent[]))
  }
  return { s, events }
}

// --- Finding 1: missed towers must NOT soft-lock the surface ------------------

describe('sw4-3 rework — the finite surface field never soft-locks', () => {
  it('clears to the trench even when no tower is shot (scroll-completion)', () => {
    // The soft-lock repro: fly wave 1 without firing. The whole maze scrolls
    // past; the surface must still end in the trench, not trap the run forever.
    const { s } = flyUntilClear(enterSurface(1983, 1))
    expect(s.gameOver).toBe(false) // padded lives — we're testing the phase, not death
    expect(s.phase).toBe('trench')
  })

  it('does not require the tower quota to be met to leave the surface', () => {
    // phaseKills stays 0 (nothing shot), yet the phase advances — proving the
    // exit no longer depends solely on phaseKills >= towersForWave.
    const { s } = flyUntilClear(enterSurface(7, 5))
    expect(s.phase).toBe('trench')
    expect(s.phaseKills).toBeLessThan(towersForWave(5)) // left WITHOUT clearing all towers
  })
})

// --- Finding 1b: the 50k bonus is gated on actually clearing the towers -------

describe('sw4-3 rework — the 50,000 bonus fires only when all towers are killed', () => {
  it('a scroll-completion clear with towers left un-killed banks NO bonus', () => {
    const start = enterSurface(1983, 1)
    const scoreBefore = start.score
    const { s, events } = flyUntilClear(start)
    expect(s.phase).toBe('trench')
    expect(s.score).toBe(scoreBefore) // no kills, no bonus — score untouched
    expect(events.some((e) => e.type === 'tower-bonus')).toBe(false)
  })

  it('killing every tower still clears EARLY and banks the 50k (sw3-3 preserved)', () => {
    // At the quota with towers present, the run drops to the trench and banks the
    // cleared-all bonus — the authentic early clear, unchanged for a full clear.
    const wave = 1
    const s0: GameState = {
      ...enterSurface(1983, wave),
      phaseKills: towersForWave(wave), // all towers accounted for
      score: 0,
    }
    let s = s0
    for (let i = 0; i < 8 && s.phase === 'surface'; i++) s = stepGame(s, NO_INPUT, 0.001)
    expect(s.phase).toBe('trench')
    expect(s.score).toBe(SURFACE_CLEAR_BONUS)
  })
})

// --- Finding: wave 2 (BUNK, 0 towers) must not insta-clear or gift the bonus --

describe('sw4-3 rework — the bunkers-only wave 2 flies through, no free clear', () => {
  it('wave 2 has a 0-tower maze but the surface does NOT insta-clear on entry', () => {
    expect(mazeForWave(2).name).toBe('BUNK')
    expect(towersForWave(2)).toBe(0)
    // One frame in, the field is laid but the run must still be on the surface —
    // a 0-tower quota must not fire the clear gate the instant the phase opens.
    let s = enterSurface(1983, 2)
    s = stepGame(s, NO_INPUT, DT)
    expect(s.phase).toBe('surface')
  })

  it('wave 2 banks no 50,000 bonus (there were no towers to clear)', () => {
    const start = { ...enterSurface(1983, 2), score: 0 }
    const { s, events } = flyUntilClear(start)
    expect(s.phase).toBe('trench') // it still ends (scroll-completion)…
    expect(s.score).toBe(0) // …but with no free cleared-all bonus
    expect(events.some((e) => e.type === 'tower-bonus')).toBe(false)
  })
})
