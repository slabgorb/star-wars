// tests/core/phase-progression.test.ts
//
// Wave/phase progression (story 8-8). Migrated by sw7-18 (R11c).
//
// This suite wires the three phases of a run into an ordered progression —
// space -> surface -> trench. Everything obeys the sacred boundary: no DOM, no
// time except `dt`, no randomness except the seeded RNG in state.
//
// == sw7-18 MIGRATION (D-015 + D-019) =========================================
//
// Two R11c changes reshape the progression fixtures:
//
//   D-015 — WAVE 1 HAS NO GROUND PHASE. The cabinet flies wave 1 space→trench
//   (WSGRND.MAC:637). The clone now matches: clearing the wave-1 space phase
//   drops STRAIGHT into the trench (that edge is wave-one-no-surface.test.ts's).
//   So every space→surface fixture here runs on WAVE 2, the first real ground
//   wave — wave 1 would skip the surface this block is about.
//
//   D-019 — THE SURFACE ENDS BY TRAVERSAL ONLY. Killing every tower no longer
//   clears the phase; the run ends at gdSeq >= 5 (~18 s of accelerating scroll,
//   WSMAIN.MAC:1678). The all-towers bonus banks mid-phase, decoupled (that is
//   surface-tower-quota / surface-traversal-end's detail). So the surface→trench
//   fixtures below FLY the traversal to its natural end rather than parking at a
//   kill quota.
//
// == sw7-17 FIXTURE MIGRATION (the kills, not the progression) ================
//
// The player's laser is HITSCAN (sw7-17): the gun spawns nothing, so a kill is a
// real trigger pull (`fireAt` — aim at it, pull), which runs through the real aim,
// ship point, and resolve. `bolt` survives only because enemy fire is still a
// genuine travelling object. One pull is one ~0.39 s sweep that re-resolves against
// the CURRENT aim each frame; the fixtures below fire once at a lone target that
// dies on frame 1 with the aim held still, so the sweep finds nothing after.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TIE_SCORE,
  MIN_SKIM_ALTITUDE,
  PROJECTILE_TTL,
  SPACE_WAVE_QUOTA,
  towersForWave,
  SURFACE_CLEAR_BONUS,
  SURFACE_END_SEQ,
  SURFACE_SEQ_SPAN,
  type GameState,
  type Projectile,
  type Enemy,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import { fireAt } from '../support/aim'
import type { Vec3 } from '@arcade/shared/math3d'

const FIRE: Input = { aimX: 0, aimY: 0, fire: true }

const space = (seed = 1983): GameState => initialState(seed)
/** A space phase on WAVE 2 — the first wave that actually opens a surface (D-015). */
const spaceBeforeSurface = (seed = 1983): GameState => ({ ...initialState(seed), wave: 2 })
const trench = (seed = 1983): GameState => ({ ...initialState(seed), phase: 'trench' })
/** A fresh surface at a chosen ground wave, entered as progression would, padded
 *  so surface fire can't end the run before the traversal completes. */
const surfaceAtWave = (wave: number, seed = 1983): GameState => ({
  ...enterPhase({ ...initialState(seed), wave }, 'surface'),
  lives: 9999,
})

const bolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })
const tie = (pos: Vec3): Enemy => ({ pos } as Enemy)

const TIE_SITE: Vec3 = [0, 0, -100]

/** Step in small ticks until the phase leaves `from` (or give up after a few). */
function crossFrom(s: GameState, from: string, input: Input = NO_INPUT): GameState {
  for (let i = 0; i < 4 && s.phase === from; i++) s = stepGame(s, input, 0.001)
  return s
}

/** Fly the surface to its natural (traversal) end — the accelerating scroll ends
 *  it in ~18 s; budget generously. lives are padded by surfaceAtWave. */
function flyToTrench(s: GameState, input: Input = NO_INPUT, maxSteps = 4000): GameState {
  for (let i = 0; i < maxSteps && s.phase === 'surface' && !s.gameOver; i++) s = stepGame(s, input, 0.02)
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
    // The surface tower quota is wave-scaled (mazeForWave().towerCount). Wave 3
    // (SQUARE) is the first ground wave WITH towers — wave 1 has no ground phase
    // (D-015) and wave 2 (BUNK) is bunkers-only, both 0.
    expect(towersForWave(3)).toBeGreaterThan(0)
  })

  it('counts kills toward the current phase quota', () => {
    const s0: GameState = {
      ...space(),
      enemies: [tie(TIE_SITE)],
      fireCooldown: 0,
      firePrev: false, // a pull only lands off a released trigger (sw7-17)
    }
    const s1 = stepGame(s0, fireAt(s0, TIE_SITE), 0.001)
    expect(s1.phaseKills).toBe(1)
  })
})

// --- AC1: space -> surface (WAVE 2 — wave 1 has no ground phase, D-015) ------

describe('Wave progression — space clears to surface (wave 2)', () => {
  it('stays in space while kills are short of the quota', () => {
    const s0: GameState = { ...spaceBeforeSurface(), phaseKills: SPACE_WAVE_QUOTA - 1, enemies: [], enemyShots: [] }
    const s1 = stepGame(s0, NO_INPUT, 0.05)
    expect(s1.phase).toBe('space')
  })

  it('advances to surface once the space quota is met', () => {
    const s0: GameState = { ...spaceBeforeSurface(), phaseKills: SPACE_WAVE_QUOTA, enemies: [], enemyShots: [] }
    const s1 = crossFrom(s0, 'space')
    expect(s1.phase).toBe('surface')
  })

  it('the clearing kill scores and carries score/lives forward into surface', () => {
    const s0: GameState = {
      ...spaceBeforeSurface(),
      phaseKills: SPACE_WAVE_QUOTA - 1,
      score: 555,
      lives: 4,
      enemies: [tie(TIE_SITE)],
      enemyShots: [],
      fireCooldown: 0,
      firePrev: false,
    }
    const s1 = crossFrom(s0, 'space', fireAt(s0, TIE_SITE))
    expect(s1.phase).toBe('surface')
    expect(s1.score).toBe(555 + TIE_SCORE) // the kill scored; nothing was reset
    expect(s1.lives).toBe(4) // no damage that frame — shields carry untouched
  })

  it('resets the kill counter for the new phase', () => {
    const s0: GameState = { ...spaceBeforeSurface(), phaseKills: SPACE_WAVE_QUOTA, enemies: [], enemyShots: [] }
    const s1 = crossFrom(s0, 'space')
    expect(s1.phase).toBe('surface')
    expect(s1.phaseKills).toBe(0)
  })

  it('opens the surface clean and skimmable (no TIEs, no leftover ordnance, safe altitude)', () => {
    const s0: GameState = {
      ...spaceBeforeSurface(),
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

// --- AC1: surface -> trench (BY TRAVERSAL — gdSeq >= 5, D-019) ---------------

describe('Wave progression — surface clears to trench by traversal', () => {
  it('advances to trench once the traversal completes (gdSeq >= SURFACE_END_SEQ)', () => {
    const s1 = flyToTrench(surfaceAtWave(3))
    expect(s1.phase).toBe('trench')
    expect(s1.gdSeq).toBeGreaterThanOrEqual(SURFACE_END_SEQ)
  })

  it('killing every tower does NOT advance early — the traversal still governs (D-019)', () => {
    const wave = 3
    let s: GameState = { ...surfaceAtWave(wave), phaseKills: towersForWave(wave) }
    for (let i = 0; i < 20; i++) s = stepGame(s, NO_INPUT, 0.02) // still inside pass 0
    expect(s.phase).toBe('surface') // all towers dead, yet NOT cleared
  })

  it('carries score (incl. the banked 50k) and lives forward across the trench edge', () => {
    // All towers accounted for AND the traversal already at its end (gdSeq >= 5,
    // D-019): the 50k banks the first frame, then the phase clears — a short hop
    // that isolates the CARRY across the edge from the ~18 s of bunker fire a full
    // traversal would draw (which would legitimately cost the un-padded lives).
    const wave = 3
    const start: GameState = {
      ...surfaceAtWave(wave),
      phaseKills: towersForWave(wave),
      gdSeq: SURFACE_END_SEQ,
      surfaceScrollZ: SURFACE_END_SEQ * SURFACE_SEQ_SPAN + 1,
      score: 800,
      lives: 5,
      towerBonusAwardedAt: null,
    }
    const s1 = flyToTrench(start)
    expect(s1.phase).toBe('trench')
    expect(s1.score).toBe(800 + SURFACE_CLEAR_BONUS) // the banked bonus survives the warp
    expect(s1.lives).toBe(5) // padded — no fatal hit
    expect(s1.phaseKills).toBe(0) // reset for the new phase
  })

  it('leaves no turrets standing when the trench opens', () => {
    const s1 = flyToTrench(surfaceAtWave(3))
    expect(s1.phase).toBe('trench')
    expect(s1.turrets ?? []).toHaveLength(0)
  })
})

// --- AC1: ordering, determinism & trench safety ------------------------------

describe('Wave progression — ordering, determinism & trench safety', () => {
  it('reaches surface in one transition on wave 2 — never skips straight to trench', () => {
    const s0: GameState = { ...spaceBeforeSurface(), phaseKills: SPACE_WAVE_QUOTA, enemies: [], enemyShots: [] }
    const s1 = crossFrom(s0, 'space')
    expect(s1.phase).toBe('surface') // wave 2+ still runs space→surface→trench, one phase at a time
  })

  it('a finished run (game over) never advances phases', () => {
    const s0: GameState = { ...space(), phaseKills: SPACE_WAVE_QUOTA, lives: 0, gameOver: true }
    const s1 = stepGame(s0, NO_INPUT, 0.1)
    expect(s1.phase).toBe('space')
  })

  it('crosses identically for a fixed seed (deterministic transition)', () => {
    const mk = (): GameState => ({
      ...spaceBeforeSurface(7),
      phaseKills: SPACE_WAVE_QUOTA - 1,
      enemies: [tie(TIE_SITE)],
      fireCooldown: 0,
      firePrev: false,
    })
    const shot = fireAt(mk(), TIE_SITE)
    let a = mk()
    let b = mk()
    for (let i = 0; i < 6; i++) {
      a = stepGame(a, shot, 0.1)
      b = stepGame(b, shot, 0.1)
    }
    expect(a.phase).toBe('surface')
    expect(a).toEqual(b)
  })

  it('holds in the trench without leaking space combat', () => {
    let s: GameState = { ...trench(), phaseKills: 999, score: 1000, lives: 4 }
    for (let i = 0; i < 50; i++) s = stepGame(s, FIRE, 0.1)
    expect(s.phase).toBe('trench')
    expect(s.enemies).toHaveLength(0)
    expect(s.score).toBe(1000)
    expect(s.lives).toBe(4)
  })
})
