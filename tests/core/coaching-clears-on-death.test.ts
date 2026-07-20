// tests/core/coaching-clears-on-death.test.ts
//
// sw7-10 REWORK RED — H-022: the coaching hint must not survive the player's death.
//
// WHY THIS FILE EXISTS (round-1 finding F3). `GameState.coaching`'s docstring promises
// the hint is "derived fresh every active-play step by `coachingFor` — never accumulated,
// so it cannot get stuck on screen." That claim is FALSE, and it was proven by probe, not
// by reading:
//
//   * Production signals death with `gameOver: true` while `mode` stays `'playing'`
//     (`sim.ts:537`, `:937`, `:1185`, `:1344`). NOTHING in `src/` ever assigns
//     `mode: 'gameover'` — only test fixtures do.
//   * `sim.ts:163` (`if (state.mode === 'gameover' || state.gameOver)`) returns EARLY,
//     without calling `finalizeFrame` — the only place `coaching` is re-derived.
//   * `render.ts` dispatches on `mode`, so with `mode === 'playing'` it falls to the
//     `else` branch and calls `drawCoaching` regardless.
//
// Net: die on wave 1 and "SHOOT FIREBALLS" freezes on screen over a frozen battlefield,
// permanently, until the player presses start. Measured: 120 frames after death the hint
// is still set and `starfield[0]` is bit-identical. Dying on wave 1 is the COMMON case
// for the player the hint exists to help.
//
// This is the one round-1 finding that is a live behaviour defect rather than prose, so
// this suite is a TRUE RED — it fails against today's implementation.
//
// The fix is Dev's to choose (clear `coaching` on the game-over branch, or run the frame
// finalizer there too). These tests pin the OBSERVABLE, not the mechanism.
import { describe, it, expect } from 'vitest'
import { initialState, type GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'

const DT = 1 / 60

/** A first-wave space frame that has been stepped once, so a hint is live. */
function coached(): GameState {
  const s = stepGame(initialState(1983), NO_INPUT, DT)
  // Fixture guard: if this ever stops being true the suite below proves nothing.
  expect(s.mode, 'fixture: must be in active play').toBe('playing')
  expect(s.wave, 'fixture: the hint is first-wave only').toBe(1)
  expect(s.coaching, 'fixture: a first-wave space frame must carry a hint').toBeTruthy()
  return s
}

/** Kill the player the way production does: lives 0 + gameOver, mode UNTOUCHED. */
function killed(s: GameState): GameState {
  return { ...s, lives: 0, gameOver: true }
}

describe('sw7-10 F3 — the coaching hint clears when the run ends', () => {
  it('a dead player is not still being coached', () => {
    let s = killed(coached())
    for (let i = 0; i < 120; i++) s = stepGame(s, NO_INPUT, DT)
    expect(
      s.coaching,
      'the hint must not outlive the run — a dead pilot cannot SHOOT FIREBALLS',
    ).toBeNull()
  })

  it('clears on the very first step after death, not eventually', () => {
    const s = stepGame(killed(coached()), NO_INPUT, DT)
    expect(s.coaching, 'the hint must clear immediately, not linger for a frame').toBeNull()
  })

  it('the docstring promise holds: the hint is never ACCUMULATED across the death boundary', () => {
    // The specific failure shape: whatever string was live at the moment of death must not
    // be the string still sitting in state many frames later.
    const alive = coached()
    const stale = alive.coaching
    let s = killed(alive)
    for (let i = 0; i < 60; i++) s = stepGame(s, NO_INPUT, DT)
    expect(s.coaching, `the pre-death hint (${stale}) must not persist`).not.toBe(stale)
  })
})

describe('sw7-10 F3 — the game-over hold does not freeze the rest of the frame furniture', () => {
  it('the starfield keeps drifting while the run is over', () => {
    // Same root cause: the game-over branch skips `finalizeFrame`, so the sky stops dead.
    // The attract screen drifts and the cabinet never shows a frozen sky, so neither
    // should the end-of-run hold.
    let s = killed(coached())
    const before = JSON.stringify(s.starfield[0])
    for (let i = 0; i < 60; i++) s = stepGame(s, NO_INPUT, DT)
    expect(
      JSON.stringify(s.starfield[0]),
      'the WSSTAR field must not freeze when the run ends',
    ).not.toBe(before)
  })
})
