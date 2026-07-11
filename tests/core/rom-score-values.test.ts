// tests/core/rom-score-values.test.ts
//
// Story sw3-1 — bake the resolved 1983 ROM score VALUES into the deterministic
// core. The sw2-6 disassembly fidelity audit
// (docs/sw2-6-disassembly-fidelity-audit.md, ## Scoring values) resolved the
// authentic point values against the cabinet ROM's packed-BCD score table:
//
//   TIE fighter    1,000   byte_984A   (was TIE_SCORE = 100     — 10× low)
//   Darth Vader    2,000   byte_984D   (was MISSING — every TIE scored as a mook)
//   Exhaust port  25,000   byte_985F   (was TRENCH_BONUS = 1000 — 25× low)
//   Fireball          33   byte_985C   (was FIREBALL_SCORE = 50)
//
// The audit's load-bearing cross-note settles TIE = 1,000 / exhaust = 25,000 and
// warns "do NOT ×10". The pre-existing scoring suites (space-combat,
// shootable-fireballs, force-bonus, exhaust-port-outcome) reference these
// constants *symbolically* — by design ("value is GREEN's tuning call") — so a
// wrong VALUE sails straight past them. This suite is the transcription
// contract: it pins the EXACT literals AND drives them end-to-end through the
// real sim, so neither a bad constant nor a broken wiring survives.
//
// VADER_SCORE is a NEW constant (byte_984D); the ROM has no Darth-Vader enemy in
// this clone's sim yet (Enemy.kind is only 'tie'), so it is pinned as a
// single-sourced value awaiting a future Vader-enemy story to award it. See the
// TEA Delivery Finding in the session file.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TIE_SCORE,
  VADER_SCORE,
  TRENCH_BONUS,
  FIREBALL_SCORE,
  FORCE_BONUS,
  PROJECTILE_TTL,
  ENEMY_SHOT_TTL,
  type GameState,
  type Projectile,
  type Enemy,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { IDENTITY, type Vec3 } from '@arcade/shared/math3d'

// --- Minimal fixtures (adapted from space-combat / shootable-fireballs /
//     force-bonus). stepGame reads `.pos` for hit-tests; vel/ttl/kind/orient
//     keep each entity a real typed value (no type-escape casts — lang-review
//     TS #8). ---------------------------------------------------------------
const wave = (seed = 1983): GameState => initialState(seed)
const TICK = 0.001
const DOWNRANGE: Vec3 = [0, 0, -400] // well outside the cockpit hit sphere
const playerBolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })
const fireball = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, 1], ttl: ENEMY_SHOT_TTL })
const tie = (pos: Vec3): Enemy => ({ pos, vel: [0, 0, 0], kind: 'tie', orient: IDENTITY })

/** A playing trench state with the exhaust port under a live player bolt.
 *  Adapted from force-bonus.test.ts; `trenchShotsFired` selects the payoff
 *  branch (0 = clean "Use the Force"; ≥2 = base bonus only). */
function portKill(state: GameState): GameState {
  const port = state.exhaustPort!.pos
  return {
    ...state,
    mode: 'playing',
    projectiles: [{ pos: [port[0], port[1], port[2]], vel: [0, 0, -1], ttl: PROJECTILE_TTL }],
  }
}

describe('sw3-1 — resolved ROM score values (transcription contract)', () => {
  // --- Exact literal pins: the four values the sw2-6 audit resolved ----------
  it('TIE fighter is worth 1,000 (ROM byte_984A) — was 100, "do NOT ×10"', () => {
    expect(TIE_SCORE).toBe(1000)
  })

  it("Darth Vader's ship is worth 2,000 (ROM byte_984D)", () => {
    expect(VADER_SCORE).toBe(2000)
  })

  it('exhaust port hit is worth 25,000 (ROM byte_985F) — was 1,000, "do NOT ×10"', () => {
    expect(TRENCH_BONUS).toBe(25000)
  })

  it('fireball is worth 33 (ROM byte_985C) — was 50', () => {
    expect(FIREBALL_SCORE).toBe(33)
  })

  // --- ROM ordering: a single guard that catches any value transposed between
  //     constants (fireball ← cheapest, port ← the run's big payoff). ---------
  it('scores keep the ROM hierarchy: fireball < TIE < Vader < exhaust port', () => {
    expect(FIREBALL_SCORE).toBeLessThan(TIE_SCORE)
    expect(TIE_SCORE).toBeLessThan(VADER_SCORE)
    expect(VADER_SCORE).toBeLessThan(TRENCH_BONUS)
  })

  it('the Use-the-Force bonus is UNCHANGED by this story (ROM byte_983B[0] = 5,000)', () => {
    // sw3-1 touches TIE/Vader/port/fireball only; FORCE_BONUS stays faithful —
    // guards against the exhaust-port change bleeding into the Force bonus.
    expect(FORCE_BONUS).toBe(5000)
  })

  // --- End-to-end: the literal value must actually reach the score readout ----
  it('killing a TIE adds exactly 1,000 to the score', () => {
    const base = wave()
    const s0: GameState = {
      ...base,
      enemies: [tie([0, 0, -100])],
      projectiles: [playerBolt([0, 0, -100])],
    }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.enemies).toHaveLength(0) // the TIE actually died (not a vacuous pin)
    expect(s1.score - base.score).toBe(1000)
  })

  it('shooting a fireball adds exactly 33 to the score', () => {
    const base = wave()
    const s0: GameState = {
      ...base,
      enemyShots: [fireball(DOWNRANGE)],
      projectiles: [playerBolt(DOWNRANGE)],
    }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.enemyShots).toHaveLength(0) // the fireball actually died
    expect(s1.score - base.score).toBe(33)
  })

  it('a non-clean exhaust-port kill scores exactly 25,000 (base bonus, no Force)', () => {
    const s0 = { ...portKill(enterPhase(initialState(), 'trench')), trenchShotsFired: 3 }
    const s1 = stepGame(s0, NO_INPUT, 1 / 60)
    expect(s1.score).toBe(25000)
  })

  it('a clean exhaust-port kill scores 25,000 + 5,000 Force = 30,000', () => {
    // Confirms the new 25k port value composes correctly with the untouched
    // Force bonus — it must not fold into or replace the Force branch.
    const s0 = { ...portKill(enterPhase(initialState(), 'trench')), trenchShotsFired: 0 }
    const s1 = stepGame(s0, NO_INPUT, 1 / 60)
    expect(s1.score).toBe(30000)
  })
})
