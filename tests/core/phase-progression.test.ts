// tests/core/phase-progression.test.ts
//
// Wave/phase progression (story 8-8), RED phase.
//
// These tests define the contract that wires the three phases of a run into an
// ordered progression — space -> surface -> trench — and are EXPECTED TO FAIL
// until the GREEN phase implements it. Today stepGame() starts in 'space' and
// never transitions, so the surface (8-4) and trench phases are dark code
// reachable only via constructed test states; this suite drives the machinery
// that makes them reachable in play. Everything obeys the sacred boundary: no
// DOM, no time except `dt`, no randomness except the seeded RNG in state.
//
// Contract this suite asks DEV to implement (per context-story-8-8.md):
//
//   GameState gains:
//     phaseKills: number          // enemies cleared in the CURRENT phase;
//                                 // starts 0, resets to 0 on each transition.
//
//   Constants (real-feel quotas, recovered/derived from StarWars.asm in GREEN
//   and single-sourced in src/core/state.ts exactly as the Wave 1/2 constants):
//     SPACE_WAVE_QUOTA   // TIEs to destroy to clear the space phase
//     SURFACE_WAVE_QUOTA // turrets to destroy to clear the surface phase
//
//   Advance condition (TEA design decision — see session deviation): a phase is
//   "cleared" when its kill quota is met. The story leaves the condition open
//   ("clear the wave / survive a timer"); this suite pins CLEAR-THE-WAVE. A
//   survive-timer was rejected because the existing within-phase suites step up
//   to ~150s of sim time in one phase and a timer would eject them mid-test;
//   a kill quota is inert under those idle/NO_INPUT runs. The condition is
//   checked every step, so a state already AT quota advances on the next step.
//
//   On clearing a phase, stepGame advances GameState.phase in order
//   (space->surface->trench), carries score and lives forward untouched, resets
//   phaseKills to 0, and opens the new phase clean (no leftover enemies/ordnance
//   from the phase just left; the surface opens at a skimmable altitude).
//
//   TRENCH IS TERMINAL HERE. Trench gameplay is story 8-5 (still backlog); 8-8
//   only proves the transition INTO the trench fires and that the phase then
//   holds safely (no space combat leaks in). When 8-5 lands it replaces this
//   hold. See the Delivery Finding in the session.
//
// Like the Wave 1/2 RED suites, this file references state fields and constants
// the GREEN phase will add, so `tsc` is red until then while vitest runs and
// reports the contract as failing. Once GREEN lands it typechecks with no casts.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TIE_SCORE,
  TURRET_SCORE,
  MIN_SKIM_ALTITUDE,
  PROJECTILE_TTL,
  SPACE_WAVE_QUOTA,
  towersForWave,
  SURFACE_CLEAR_BONUS,
  type GameState,
  type Projectile,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'

const FIRE: Input = { aimX: 0, aimY: 0, fire: true }

const space = (seed = 1983): GameState => initialState(seed)
const surface = (seed = 1983): GameState => ({ ...initialState(seed), phase: 'surface' })
const trench = (seed = 1983): GameState => ({ ...initialState(seed), phase: 'trench' })

// stepGame reads `.pos` for hit-tests (and a bolt's vel/ttl); minimal literals.
const bolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })
const tie = (pos: Vec3): Enemy => ({ pos } as Enemy)
const turretAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

/** Step in small ticks until the phase leaves `from` (or give up after a few). */
function crossFrom(s: GameState, from: string, input: Input = NO_INPUT): GameState {
  for (let i = 0; i < 4 && s.phase === from; i++) s = stepGame(s, input, 0.001)
  return s
}

// --- AC1: the phase-clear counter -------------------------------------------

describe('Wave progression — phase-clear counter', () => {
  it('a fresh run opens in the space phase with a zeroed kill counter', () => {
    const s = space()
    expect(s.phase).toBe('space')
    expect(s.phaseKills).toBe(0)
  })

  it('defines positive per-phase wave quotas', () => {
    expect(SPACE_WAVE_QUOTA).toBeGreaterThan(0)
    // The surface quota is now wave-scaled (sw3-3, byte_98CB) rather than a flat
    // constant; its wave-1 value must still be a positive kill target.
    expect(towersForWave(1)).toBeGreaterThan(0)
  })

  it('counts kills toward the current phase quota', () => {
    const s0: GameState = {
      ...space(),
      enemies: [tie([0, 0, -100])],
      projectiles: [bolt([0, 0, -100])],
    }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.phaseKills).toBe(1)
  })
})

// --- AC1: space -> surface ---------------------------------------------------

describe('Wave progression — space clears to surface', () => {
  it('stays in space while kills are short of the quota', () => {
    const s0: GameState = { ...space(), phaseKills: SPACE_WAVE_QUOTA - 1, enemies: [], enemyShots: [] }
    const s1 = stepGame(s0, NO_INPUT, 0.05)
    expect(s1.phase).toBe('space')
  })

  it('advances to surface once the space quota is met', () => {
    const s0: GameState = { ...space(), phaseKills: SPACE_WAVE_QUOTA, enemies: [], enemyShots: [] }
    const s1 = crossFrom(s0, 'space')
    expect(s1.phase).toBe('surface')
  })

  it('the clearing kill scores and carries score/lives forward into surface', () => {
    const s0: GameState = {
      ...space(),
      phaseKills: SPACE_WAVE_QUOTA - 1,
      score: 555,
      lives: 4,
      enemies: [tie([0, 0, -100])],
      projectiles: [bolt([0, 0, -100])],
      enemyShots: [],
    }
    const s1 = crossFrom(s0, 'space')
    expect(s1.phase).toBe('surface')
    expect(s1.score).toBe(555 + TIE_SCORE) // the kill scored; nothing was reset
    expect(s1.lives).toBe(4) // no damage that frame — shields carry untouched
  })

  it('resets the kill counter for the new phase', () => {
    const s0: GameState = { ...space(), phaseKills: SPACE_WAVE_QUOTA, enemies: [], enemyShots: [] }
    const s1 = crossFrom(s0, 'space')
    expect(s1.phase).toBe('surface')
    expect(s1.phaseKills).toBe(0)
  })

  it('opens the surface clean and skimmable (no TIEs, no leftover ordnance, safe altitude)', () => {
    const s0: GameState = {
      ...space(),
      phaseKills: SPACE_WAVE_QUOTA,
      enemies: [tie([0, 0, -300]), tie([10, 0, -300])],
      enemyShots: [bolt([0, 0, -50])],
    }
    const s1 = crossFrom(s0, 'space')
    expect(s1.phase).toBe('surface')
    expect(s1.enemies).toHaveLength(0) // no TIE fighters on the Death Star surface
    expect(s1.enemyShots).toHaveLength(0) // space fireballs don't follow you down
    expect(s1.altitude).toBeGreaterThanOrEqual(MIN_SKIM_ALTITUDE) // not opening mid-crash
  })
})

// --- AC1: surface -> trench --------------------------------------------------

describe('Wave progression — surface clears to trench', () => {
  // sw3-3 replaced the flat 4-kill surface quota with the wave-scaled
  // towers-remaining table (byte_98CB); wave 1 (the default here) needs
  // towersForWave(1) = 22 kills, and clearing them all banks SURFACE_CLEAR_BONUS.
  it('advances to trench once the surface quota is met', () => {
    const s0: GameState = { ...surface(), phaseKills: towersForWave(1), turrets: [], enemyShots: [] }
    const s1 = crossFrom(s0, 'surface')
    expect(s1.phase).toBe('trench')
  })

  it('the clearing kill scores (+ the 50k all-towers bonus) and carries score/lives forward', () => {
    const s0: GameState = {
      ...surface(),
      phaseKills: towersForWave(1) - 1,
      score: 800,
      lives: 5,
      turrets: [turretAt([0, 0, -100])],
      projectiles: [bolt([0, 0, -100])],
      enemyShots: [],
    }
    const s1 = crossFrom(s0, 'surface')
    expect(s1.phase).toBe('trench')
    expect(s1.score).toBe(800 + TURRET_SCORE + SURFACE_CLEAR_BONUS)
    expect(s1.lives).toBe(5)
    expect(s1.phaseKills).toBe(0)
  })

  it('leaves no turrets standing when the trench opens', () => {
    const s0: GameState = {
      ...surface(),
      phaseKills: towersForWave(1),
      turrets: [turretAt([0, 0, -200]), turretAt([50, 0, -200])],
      enemyShots: [],
    }
    const s1 = crossFrom(s0, 'surface')
    expect(s1.phase).toBe('trench')
    expect(s1.turrets ?? []).toHaveLength(0)
  })
})

// --- AC1: ordering, determinism & trench safety ------------------------------

describe('Wave progression — ordering, determinism & trench safety', () => {
  it('reaches surface in one transition — never skips straight to trench', () => {
    const s0: GameState = { ...space(), phaseKills: SPACE_WAVE_QUOTA, enemies: [], enemyShots: [] }
    const s1 = crossFrom(s0, 'space')
    expect(s1.phase).toBe('surface') // not 'trench' — one phase at a time, in order
  })

  it('a finished run (game over) never advances phases', () => {
    const s0: GameState = { ...space(), phaseKills: SPACE_WAVE_QUOTA, lives: 0, gameOver: true }
    const s1 = stepGame(s0, NO_INPUT, 0.1)
    expect(s1.phase).toBe('space')
  })

  it('crosses identically for a fixed seed (deterministic transition)', () => {
    const mk = (): GameState => ({
      ...space(7),
      phaseKills: SPACE_WAVE_QUOTA - 1,
      enemies: [tie([0, 0, -100])],
      projectiles: [bolt([0, 0, -100])],
    })
    let a = mk()
    let b = mk()
    for (let i = 0; i < 6; i++) {
      a = stepGame(a, NO_INPUT, 0.1)
      b = stepGame(b, NO_INPUT, 0.1)
    }
    expect(a.phase).toBe('surface')
    expect(a).toEqual(b)
  })

  it('holds in the trench without leaking space combat (trench gameplay is 8-5)', () => {
    // Trench is terminal in 8-8: it must not wrap back, and must not run the
    // space spawner — the fall-through that today re-scrambles TIEs is the bug
    // this guards. When 8-5 builds the trench, it replaces this hold.
    let s: GameState = { ...trench(), phaseKills: 999, score: 1000, lives: 4 }
    for (let i = 0; i < 50; i++) s = stepGame(s, FIRE, 0.1)
    expect(s.phase).toBe('trench')
    expect(s.enemies).toHaveLength(0)
    expect(s.score).toBe(1000)
    expect(s.lives).toBe(4)
  })
})
