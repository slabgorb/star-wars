// tests/core/surface-tower-quota.test.ts
//
// Story sw3-3 — Surface phase: wave-scaled towers-remaining (ROM byte_98CB) +
// a 50,000 cleared-all-towers bonus, REPLACING the flat 4-kill quota. RED phase.
//
// These tests define the contract the GREEN phase implements; they are EXPECTED
// TO FAIL until then. They reference symbols GREEN will add
// (`towersForWave`, `SURFACE_CLEAR_BONUS`, the `tower-bonus` event), so `tsc` is
// red until GREEN lands — the same convention the 8-8 progression RED suite used.
//
// --- ROM provenance (star-wars/reference/disasm/StarWars_annotated.lst) ------
//
// The surface phase is NOT cleared by a flat 4 turret kills. The 1983 cabinet
// scales the number of towers to shoot by the mission counter and awards 50,000
// when the LAST tower falls:
//
//   byte_98CB  (ROM:98CB) — towers-per-mission table, indexed by the mission
//   counter byte_4B13 ( = the clone's 1-based `wave`; ROM index 0 is an unused
//   sentinel of 0, so wave 1 reads index 1):
//
//     fcb 0, $16,$16,$20,$20,$20,$21,$21, $27,$28,$20,$20,$24,$24,$24,$25, $25,$31
//     byte_98DD: fcb $32        ; index 18 — the table's tail value, 50
//
//     index: 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18
//     value: 0 22 22 32 32 32 33 33 39 40 32 32 36 36 36 37 37 49 50
//
//   Surface init (ROM:A1EF sub_A1CE): `ldb byte_4B13; ldx #byte_98CB; abx;
//   lda ,x; sta byte_4B1A` — byte_4B1A is the HUD "towers left to shoot count".
//   The table is clamped at the tail (index 18 = 50) for deep missions
//   (`cmpx #byte_98DE; bcs …; ldx #byte_98DD`). The cabinet ALSO re-rolls the
//   index via the PRNG once byte_4B13 ≥ 19 (ROM:A1DD-A1EC); the clone clamps to
//   50 deterministically instead — a logged design deviation (a seeded re-roll
//   would break the pure core's determinism). The observable table below is the
//   contract.
//
//   50,000 bonus (ROM:973A sub_973A): each tower hit decrements byte_4B1A (BCD);
//   the step that drives it to 0 does `ldu #byte_9862; jsr Add-to-score` where
//     byte_9862: fcb 5, 0, 0     ; BCD 05,00,00 = 50,000 "Cleared all towers"
//   and sets the surface-cleared flag (`inc byte_4B35`). The on-screen banner is
//   `"50,000 FOR SHOOTING ALL TOWERS"` (ROM:E039). So the bonus fires ONCE, on
//   the clearing transition — not per tower, not per wave independently.
//
// Everything here obeys the sacred boundary: pure core, no DOM, no time except
// `dt`, no randomness except the seeded RNG carried in state.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  towersForWave,
  SURFACE_CLEAR_BONUS,
  TURRET_SCORE,
  PROJECTILE_TTL,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'
import type { Vec3 } from '@arcade/shared/math3d'

const surface = (seed = 1983): GameState => ({ ...initialState(seed), phase: 'surface' })
const bolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })
const turretAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

/** Step in small ticks until the phase leaves `from` (or give up after a few). */
function crossFrom(s: GameState, from: string, input: Input = NO_INPUT): GameState {
  for (let i = 0; i < 6 && s.phase === from; i++) s = stepGame(s, input, 0.001)
  return s
}

// The ROM byte_98CB table, indexed by the clone's 1-based wave (index 0 sentinel
// dropped). This is the authored contract, transcribed straight from the disasm.
const ROM_TOWERS_BY_WAVE: ReadonlyArray<[wave: number, towers: number]> = [
  [1, 22],
  [2, 22],
  [3, 32],
  [4, 32],
  [5, 32],
  [6, 33],
  [7, 33],
  [8, 39],
  [9, 40],
  [10, 32],
  [11, 32],
  [12, 36],
  [13, 36],
  [14, 36],
  [15, 37],
  [16, 37],
  [17, 49],
  [18, 50],
]

// --- AC1: wave-scaled towers-remaining (ROM byte_98CB) -----------------------

describe('sw3-3 — towersForWave pins the ROM byte_98CB table', () => {
  it.each(ROM_TOWERS_BY_WAVE)('wave %i requires %i towers', (wave, towers) => {
    expect(towersForWave(wave)).toBe(towers)
  })

  it("opens 22 / 22 / 32 — the title's byte_98CB sequence for waves 1-3", () => {
    expect([towersForWave(1), towersForWave(2), towersForWave(3)]).toEqual([22, 22, 32])
  })

  it('clamps to the table tail (50) for missions past the end of the table', () => {
    // ROM re-rolls byte_4B13 past index 18; the clone clamps to byte_98DD = 50.
    expect(towersForWave(18)).toBe(50)
    expect(towersForWave(19)).toBe(50)
    expect(towersForWave(25)).toBe(50)
    expect(towersForWave(999)).toBe(50)
  })

  it('never yields 0 towers for any playable wave (the ROM index-0 sentinel is not exposed)', () => {
    // A 0 would insta-clear the surface — the sentinel byte_98CB[0] must stay hidden.
    for (let wave = 1; wave <= 60; wave++) {
      expect(towersForWave(wave)).toBeGreaterThanOrEqual(22)
      expect(towersForWave(wave)).toBeLessThanOrEqual(50)
    }
  })

  it('is a pure function of the wave — same wave, same count (no RNG, no time)', () => {
    expect(towersForWave(9)).toBe(towersForWave(9))
    expect(towersForWave(9)).toBe(40)
  })
})

// --- AC2: the 50,000 cleared-all-towers bonus value --------------------------

describe('sw3-3 — SURFACE_CLEAR_BONUS is the ROM byte_9862 value', () => {
  it('is exactly 50,000', () => {
    expect(SURFACE_CLEAR_BONUS).toBe(50000)
  })
})

// --- AC3: the surface clears at the wave-scaled count, not the flat 4 --------

describe('sw3-3 — surface clears at towersForWave(wave), replacing the flat 4-kill quota', () => {
  it('wave 1 stays on the surface one kill short of its 22-tower quota', () => {
    const s0: GameState = {
      ...surface(),
      wave: 1,
      phaseKills: towersForWave(1) - 1, // 21
      turrets: [],
      enemyShots: [],
    }
    const s1 = crossFrom(s0, 'surface')
    expect(s1.phase).toBe('surface')
  })

  it('wave 1 clears to the trench once its 22-tower quota is met', () => {
    const s0: GameState = {
      ...surface(),
      wave: 1,
      phaseKills: towersForWave(1), // 22
      turrets: [],
      enemyShots: [],
    }
    const s1 = crossFrom(s0, 'surface')
    expect(s1.phase).toBe('trench')
  })

  it('the OLD flat 4-kill quota no longer clears the surface (regression pin)', () => {
    // 4 kills used to drop the run into the trench; wave 1 now needs 22.
    const s0: GameState = { ...surface(), wave: 1, phaseKills: 4, turrets: [], enemyShots: [] }
    const s1 = crossFrom(s0, 'surface')
    expect(s1.phase).toBe('surface')
  })

  it('scales with the wave — wave 3 needs 32, not 22', () => {
    const short: GameState = { ...surface(), wave: 3, phaseKills: 31, turrets: [], enemyShots: [] }
    expect(crossFrom(short, 'surface').phase).toBe('surface') // 31 < 32: not cleared
    const met: GameState = { ...surface(), wave: 3, phaseKills: 32, turrets: [], enemyShots: [] }
    expect(crossFrom(met, 'surface').phase).toBe('trench') // 32 == quota: cleared
  })

  it('a mid-table wave uses its own count — wave 9 needs 40', () => {
    const short: GameState = { ...surface(), wave: 9, phaseKills: 39, turrets: [], enemyShots: [] }
    expect(crossFrom(short, 'surface').phase).toBe('surface')
    const met: GameState = { ...surface(), wave: 9, phaseKills: 40, turrets: [], enemyShots: [] }
    expect(crossFrom(met, 'surface').phase).toBe('trench')
  })
})

// --- AC2: clearing all towers awards 50,000 ----------------------------------

describe('sw3-3 — clearing every tower scores the 50,000 bonus', () => {
  it('adds exactly SURFACE_CLEAR_BONUS to the score on the surface→trench clear', () => {
    const s0: GameState = {
      ...surface(),
      wave: 1,
      phaseKills: towersForWave(1), // at quota, no live turret this frame
      score: 1000,
      turrets: [],
      enemyShots: [],
    }
    const s1 = crossFrom(s0, 'surface')
    expect(s1.phase).toBe('trench')
    expect(s1.score).toBe(1000 + SURFACE_CLEAR_BONUS) // 51,000 — only the bonus, no extra kill
  })

  it('emits a tower-bonus event carrying the 50,000 amount for the HUD/audio banner', () => {
    const s0: GameState = {
      ...surface(),
      wave: 1,
      phaseKills: towersForWave(1),
      turrets: [],
      enemyShots: [],
    }
    const s1 = crossFrom(s0, 'surface')
    expect(s1.phase).toBe('trench')
    expect(s1.events).toContainEqual({ type: 'tower-bonus', amount: SURFACE_CLEAR_BONUS })
  })

  it('scores the same flat 50,000 on a deeper wave (the bonus amount is wave-independent)', () => {
    const s0: GameState = {
      ...surface(),
      wave: 12,
      phaseKills: towersForWave(12), // 36
      score: 0,
      turrets: [],
      enemyShots: [],
    }
    const s1 = crossFrom(s0, 'surface')
    expect(s1.phase).toBe('trench')
    expect(s1.score).toBe(SURFACE_CLEAR_BONUS)
  })

  it('awards the bonus ONCE — it is not re-added on later trench frames', () => {
    const s0: GameState = {
      ...surface(),
      wave: 1,
      phaseKills: towersForWave(1),
      score: 0,
      turrets: [],
      enemyShots: [],
    }
    const entered = crossFrom(s0, 'surface')
    expect(entered.phase).toBe('trench')
    expect(entered.score).toBe(SURFACE_CLEAR_BONUS)
    // A further trench frame with no port hit must not re-bank the bonus.
    const later = stepGame({ ...entered, mode: 'playing' }, NO_INPUT, 0.001)
    expect(later.score).toBe(SURFACE_CLEAR_BONUS)
    expect((later.events as GameEvent[]).some((e) => e.type === 'tower-bonus')).toBe(false)
  })

  it('the clearing tower kill scores BOTH its 200-point tower and the 50,000 bonus', () => {
    // The 22nd tower is alive this frame; the player bolt kills it, meeting the
    // quota — score gets TURRET_SCORE for the kill AND the completion bonus.
    const s0: GameState = {
      ...surface(),
      wave: 1,
      phaseKills: towersForWave(1) - 1, // one short; this frame's kill meets it
      score: 0,
      turrets: [turretAt([0, 0, -100])],
      projectiles: [bolt([0, 0, -100])],
      enemyShots: [],
    }
    const s1 = crossFrom(s0, 'surface')
    expect(s1.phase).toBe('trench')
    expect(s1.score).toBe(TURRET_SCORE + SURFACE_CLEAR_BONUS) // 200 + 50,000
  })

  it('does NOT award the tower bonus on the space→surface transition', () => {
    // The bonus is for clearing TOWERS, not TIEs — entering the surface must not bank it.
    const s0: GameState = {
      ...initialState(1983),
      phase: 'space',
      phaseKills: towersForWave(1), // arbitrary large count ≥ the space quota
      score: 0,
      enemies: [],
      enemyShots: [],
    }
    const s1 = crossFrom(s0, 'space')
    expect(s1.phase).toBe('surface')
    expect(s1.score).toBe(0) // no tower bonus entering the surface
    expect((s1.events as GameEvent[]).some((e) => e.type === 'tower-bonus')).toBe(false)
  })
})

// --- Determinism: the quota carries no RNG -----------------------------------

describe('sw3-3 — the wave-scaled clear is deterministic (pure core)', () => {
  it('crosses identically for a fixed seed', () => {
    const mk = (): GameState => ({
      ...surface(7),
      wave: 5,
      phaseKills: towersForWave(5), // 32
      turrets: [],
      enemyShots: [],
    })
    let a = mk()
    let b = mk()
    for (let i = 0; i < 6; i++) {
      a = stepGame(a, NO_INPUT, 0.001)
      b = stepGame(b, NO_INPUT, 0.001)
    }
    expect(a.phase).toBe('trench')
    expect(a).toEqual(b)
  })
})
