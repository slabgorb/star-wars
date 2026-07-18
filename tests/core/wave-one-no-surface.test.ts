// tests/core/wave-one-no-surface.test.ts
//
// Story sw7-18 — R11c surface traversal rebuild, Defect D-015 (drop the invented
// wave-1 surface). RED phase (O'Brien / TEA). EXPECTED TO FAIL until GREEN.
//
// THE DEFECT. The 1983 cabinet gives game wave 1 NO ground phase: `;WAVE 1 HAS NO
// GROUND PHASE` (WSGRND.MAC:637), TGDPTR starts at WAVE 02 = BUNK, and PHIGD's
// `DECA` is "ALWAYS SKIPPED ON FIRST GAME WAVE" (WSMAIN.MAC:1604). Wave 1 flies
// space → trench. Ours runs space → surface → trench EVERY wave, so sw4-3 had to
// invent a wave-1 maze and chose SQUARE — which then serves SQUARE at BOTH clone
// wave 1 and clone wave 3 (a doubling). The Jedi ruled 2026-07-16: drop it.
//
// THE FIX (design §Defect 3 / R11c, D-015 ruled):
//   - wave 1 progresses space → trench, skipping 'surface' entirely.
//   - the first surface a run ever sees is wave 2 (BUNK).
//   - the `mazeForWave(1) → SQUARE` special case is removed; SQUARE is a wave-3
//     maze only. For out-of-band callers (wave < 2 has no ground phase),
//     mazeForWave clamps to the first ground maze, wave 2's BUNK.
//
// Sacred boundary: pure core, no DOM, no time except dt, no RNG except state's.

import { describe, it, expect } from 'vitest'
import { initialState, SPACE_WAVE_QUOTA, type GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import { mazeForWave } from '../../src/core/surfaceMazes'

/** A space phase at a chosen wave, already at the kill quota, cleared of enemies
 *  and ordnance so the next step crosses the space edge cleanly. */
function spaceAtQuota(wave: number, seed = 1983): GameState {
  return {
    ...initialState(seed),
    wave,
    phase: 'space',
    phaseKills: SPACE_WAVE_QUOTA,
    enemies: [],
    enemyShots: [],
  }
}

/** Step small ticks until the phase leaves 'space' (or give up), recording every
 *  phase seen along the way — so a fleeting 'surface' can't slip past unnoticed. */
function crossSpace(s: GameState, input: Input = NO_INPUT): { s: GameState; phasesSeen: string[] } {
  const phasesSeen: string[] = [s.phase]
  for (let i = 0; i < 8 && s.phase === 'space'; i++) {
    s = stepGame(s, input, 0.001)
    phasesSeen.push(s.phase)
  }
  return { s, phasesSeen }
}

// --- AC: wave 1 skips the surface -------------------------------------------

describe('sw7-18 / D-015 — wave 1 flies space → trench, no ground phase', () => {
  it('clearing the wave-1 space phase drops straight into the trench', () => {
    const { s } = crossSpace(spaceAtQuota(1))
    expect(s.phase).toBe('trench')
  })

  it('a wave-1 run never passes through the surface phase', () => {
    const { phasesSeen } = crossSpace(spaceAtQuota(1))
    expect(phasesSeen).not.toContain('surface') // the invented wave-1 surface is gone
  })

  it('the wave-1 skip is deterministic for a fixed seed', () => {
    const a = crossSpace(spaceAtQuota(1, 7)).s
    const b = crossSpace(spaceAtQuota(1, 7)).s
    expect(a.phase).toBe('trench')
    expect(a.phase).toBe(b.phase)
  })
})

// --- AC: wave 2 is the first surface ----------------------------------------

describe('sw7-18 / D-015 — the first surface a run ever sees is wave 2', () => {
  it('clearing the wave-2 space phase enters the surface (unlike wave 1)', () => {
    const { s } = crossSpace(spaceAtQuota(2))
    expect(s.phase).toBe('surface')
  })

  it('wave 2 keeps the ROM ground order: its maze is BUNK', () => {
    expect(mazeForWave(2).name).toBe('BUNK')
  })
})

// --- AC: the SQUARE doubling is removed --------------------------------------

describe('sw7-18 / D-015 — SQUARE is a wave-3 maze only (no wave-1 duplicate)', () => {
  it('wave 3 still serves SQUARE (the ROM WAVE 03 assignment)', () => {
    expect(mazeForWave(3).name).toBe('SQUARE')
  })

  it('the mazeForWave(1) → SQUARE special case is gone', () => {
    // Wave 1 has no ground phase; an out-of-band maze lookup clamps to the first
    // ground maze (wave 2 = BUNK), never the wave-3 SQUARE it used to duplicate.
    expect(mazeForWave(1).name).not.toBe('SQUARE')
    expect(mazeForWave(1).name).toBe('BUNK')
  })
})
