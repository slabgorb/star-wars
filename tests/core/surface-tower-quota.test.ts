// tests/core/surface-tower-quota.test.ts
//
// Story sw3-3 — Surface phase: wave-scaled towers-remaining + a 50,000
// cleared-all-towers bonus. Migrated by sw7-18 (R11c, D-019 + D-015).
//
// *** sw7-18 RE-RECONCILE (D-019 decouples the quota from the clear) ***
// sw3-3 made `towersForWave(wave)` (the placed maze's .TWRS count) BOTH the 50k
// bonus threshold AND the surface→trench clear condition. The 1983 cabinet keeps
// them SEPARATE: killing every tower sets Q.ATP and shows "50,000 FOR SHOOTING
// ALL TOWERS" but does NOT shorten the phase — the ground run ends by TRAVERSAL
// alone (`GD.SEQ >= 5`, WSMAIN.MAC:1678; see surface-traversal-end.test.ts). So
// after sw7-18 the quota gates only the BONUS: reaching it banks the 50k, ONCE,
// mid-phase, and the pilot keeps flying the rest of the traversal. This file pins
// the quota→BONUS contract; the end condition is surface-traversal-end.test.ts's.
//
// *** sw7-18 D-015 (wave 1 has no ground phase) ***
// The wave-1 surface was invented (SQUARE served at both clone wave 1 and wave 3).
// D-015 drops it: wave 1 flies space→trench, and mazeForWave clamps wave 1 to the
// first real ground maze (wave 2 = BUNK). So the quota fixtures below run on wave
// 3+ (a real ground wave with towers) — never the retired wave-1 surface.
//
// --- ROM provenance (star-wars/reference/disasm/StarWars_annotated.lst) ------
//
// The surface is a fixed, finite maze; its ground routine seeds "# OF TOWERS
// LEFT" from the per-maze .TWRS count, so `towersForWave(wave) ===
// mazeForWave(wave).towerCount` (the full wave→maze table is pinned in
// surface-maze-field.test.ts).
//
//   50,000 bonus (ROM:973A sub_973A): each tower hit decrements byte_4B1A (BCD);
//   the step that drives it to 0 does `ldu #byte_9862; jsr Add-to-score` where
//     byte_9862: fcb 5, 0, 0     ; BCD 05,00,00 = 50,000 "Cleared all towers"
//   and sets the surface-cleared flag. The bonus fires ONCE, on the clearing
//   kill — not per tower, not per wave, and (post-D-019) not on the phase exit.
//
// Everything here obeys the sacred boundary: pure core, no DOM, no time except
// `dt`, no randomness except the seeded RNG carried in state.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  towersForWave,
  SURFACE_CLEAR_BONUS,
  TURRET_SCORE,
  SKIM_ALTITUDE,
  type GameState,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { fireAt } from '../support/aim'
import type { GameEvent } from '../../src/core/events'
import type { Vec3 } from '@arcade/shared/math3d'

/** A fresh surface at a chosen wave, padded so surface fire cannot end the run
 *  while we probe the quota/bonus — and entered via `enterPhase` so gdSeq and the
 *  scroll seed reset exactly as progression would. */
function surfaceAtWave(wave: number, seed = 1983): GameState {
  return { ...enterPhase({ ...initialState(seed), wave }, 'surface'), lives: 9999 }
}
const turretAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

/**
 * The clearing tower's seat — the PILOT'S OWN CRUISE HEIGHT, not the floor (sw7-17).
 * Level with the eye, a dead-on shot is purely lateral, the yoke stays at rest (its
 * vertical axis is also the throttle), and the tower is inside the FOV. The quota
 * never reads a tower's height.
 */
const EYE_HIGH = SKIM_ALTITUDE

const hasTowerBonus = (s: GameState): boolean =>
  (s.events as GameEvent[]).some((e) => e.type === 'tower-bonus')

// --- towersForWave is the placed maze's tower count --------------------------

describe('sw4-3 — towersForWave is the placed maze tower count (supersedes byte_98CB)', () => {
  // Concrete WSGRND TTWRS values (the full wave→maze table is pinned once in
  // surface-maze-field.test.ts). NOT `=== mazeForWave(w).towerCount`, a tautology
  // that can't catch a wrong wave→maze mapping.
  it('is the maze TTWRS: wave 2 (BUNK)=0, wave 3 (SQUARE)=16, wave 9 (SYMTRC)=21, wave 16 (3DIFF)=24', () => {
    expect(towersForWave(2)).toBe(0)
    expect(towersForWave(3)).toBe(16)
    expect(towersForWave(9)).toBe(21)
    expect(towersForWave(16)).toBe(24)
  })

  it('wave 1 has no ground phase (D-015): it clamps to wave 2 = BUNK = 0 towers', () => {
    expect(towersForWave(1)).toBe(0)
  })

  it('is a pure function of the wave — same wave, same count (no RNG, no time)', () => {
    expect(towersForWave(9)).toBe(towersForWave(9))
    expect(towersForWave(9)).toBe(21)
  })
})

// --- the 50,000 cleared-all-towers bonus value -------------------------------

describe('sw3-3 — SURFACE_CLEAR_BONUS is the ROM byte_9862 value', () => {
  it('is exactly 50,000', () => {
    expect(SURFACE_CLEAR_BONUS).toBe(50000)
  })
})

// --- the quota gates the BONUS, not the clear (D-019 decoupling) --------------

describe('sw7-18 / D-019 — reaching towersForWave(wave) banks the bonus WITHOUT clearing', () => {
  it('one kill short of the quota, no bonus banks and the surface holds', () => {
    const wave = 3 // SQUARE, 16 towers
    const s0: GameState = { ...surfaceAtWave(wave), phaseKills: towersForWave(wave) - 1, score: 0 }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.phase).toBe('surface')
    expect(s1.score).toBe(0)
    expect(hasTowerBonus(s1)).toBe(false)
  })

  it('at the quota, the 50k banks — but the phase stays on the surface (no early exit)', () => {
    const wave = 3
    const s0: GameState = {
      ...surfaceAtWave(wave),
      phaseKills: towersForWave(wave),
      score: 1000,
      towerBonusAwardedAt: null,
    }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.phase).toBe('surface') // D-019: killing all towers does NOT clear the phase
    expect(s1.score).toBe(1000 + SURFACE_CLEAR_BONUS) // 51,000 — the bonus, no extra kill
    expect(s1.events).toContainEqual({ type: 'tower-bonus', amount: SURFACE_CLEAR_BONUS })
  })

  it('the bonus amount is wave-independent — a deeper wave still banks a flat 50,000', () => {
    const wave = 12 // 3SQUARE
    const s0: GameState = {
      ...surfaceAtWave(wave),
      phaseKills: towersForWave(wave),
      score: 0,
      towerBonusAwardedAt: null,
    }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.score).toBe(SURFACE_CLEAR_BONUS)
  })

  it('the bunkers-only wave (0 towers) never banks the bonus (nothing to clear)', () => {
    const s0: GameState = { ...surfaceAtWave(2), phaseKills: towersForWave(2), score: 0 } // BUNK, 0
    let s = s0
    for (let i = 0; i < 20; i++) s = stepGame(s, NO_INPUT, 0.02)
    expect(s.score).toBe(0)
  })
})

// --- the bonus banks exactly once --------------------------------------------

describe('sw3-3 — clearing every tower banks the 50,000 exactly once', () => {
  it('does not re-bank on later surface frames', () => {
    const wave = 3
    let s: GameState = {
      ...surfaceAtWave(wave),
      phaseKills: towersForWave(wave),
      score: 0,
      towerBonusAwardedAt: null,
    }
    let bonuses = 0
    for (let i = 0; i < 40 && s.phase === 'surface'; i++) {
      s = stepGame(s, NO_INPUT, 0.02)
      bonuses += (s.events as GameEvent[]).filter((e) => e.type === 'tower-bonus').length
    }
    expect(bonuses).toBe(1)
    expect(s.score).toBe(SURFACE_CLEAR_BONUS)
  })

  it('the clearing tower kill scores BOTH its 200-point tower and the 50,000 bonus', () => {
    // The last (16th, SQUARE) tower is alive; the player's beam kills it, meeting
    // the quota — score gets TURRET_SCORE for the kill AND the completion bonus.
    // One pull (`fireAt`); the lone tower dies on the first frame and the aim never
    // moves, so the sweep's remaining frames find nothing under the site.
    const wave = 3
    const site: Vec3 = [0, EYE_HIGH, -100]
    const s0: GameState = {
      ...surfaceAtWave(wave),
      phaseKills: towersForWave(wave) - 1, // one short; this frame's kill meets it
      score: 0,
      turrets: [turretAt(site)],
      surfaceMazeLaid: true, // hand-placed field — don't lay the wave maze over it
      enemyShots: [],
      fireCooldown: 0,
      firePrev: false, // a pull only lands off a released trigger
    }
    const s1 = stepGame(s0, fireAt(s0, site), 0.001)
    expect(
      (s1.events as GameEvent[]).some((e) => e.type === 'enemy-death' && e.enemyType === 'turret'),
      'the clearing tower really was shot, not merely flown past',
    ).toBe(true)
    expect(s1.phase).toBe('surface') // banked, still flying (D-019)
    expect(s1.score).toBe(TURRET_SCORE + SURFACE_CLEAR_BONUS) // 200 + 50,000
  })

  it('does NOT award the tower bonus on the space→surface transition', () => {
    // The bonus is for clearing TOWERS, not TIEs — entering the surface must not bank it.
    const s0: GameState = {
      ...initialState(1983),
      wave: 2, // wave 2 DOES have a surface (D-015); the space quota clears into it
      phase: 'space',
      phaseKills: 9999, // ≥ the space quota
      score: 0,
      enemies: [],
      enemyShots: [],
    }
    let s = s0
    for (let i = 0; i < 6 && s.phase === 'space'; i++) s = stepGame(s, NO_INPUT, 0.001)
    expect(s.phase).toBe('surface')
    expect(s.score).toBe(0) // no tower bonus entering the surface
    expect(hasTowerBonus(s)).toBe(false)
  })
})

// --- Determinism: the quota/bonus carries no RNG -----------------------------

describe('sw3-3 — the wave-scaled bonus is deterministic (pure core)', () => {
  it('banks identically for a fixed seed', () => {
    const mk = (): GameState => ({
      ...surfaceAtWave(5, 7),
      phaseKills: towersForWave(5),
      score: 0,
      towerBonusAwardedAt: null,
    })
    let a = mk()
    let b = mk()
    for (let i = 0; i < 6; i++) {
      a = stepGame(a, NO_INPUT, 0.001)
      b = stepGame(b, NO_INPUT, 0.001)
    }
    expect(a.score).toBe(SURFACE_CLEAR_BONUS)
    expect(a).toEqual(b)
  })
})
