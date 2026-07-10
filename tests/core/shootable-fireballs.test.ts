// tests/core/shootable-fireballs.test.ts
//
// Wave 1 — shootable enemy fireballs (story 8-18), RED phase.
//
// Today a player bolt sails straight THROUGH an enemy fireball: sim.ts kills
// TIEs with bolts and lets fireballs damage the cockpit, but there is no
// bolt-vs-fireball hit-test. This story closes that gap — a player laser that
// strikes an incoming fireball destroys it BEFORE it reaches the cockpit,
// turning Wave 1 from "dodge the fire" into "intercept the fire."
//
// These tests are EXPECTED TO FAIL until the GREEN phase implements it. They
// drive behaviour through the existing pure surface — `stepGame(state, input,
// dt)` and the `GameState` it returns — so they assert observable gameplay, not
// internal shape, and obey the sacred boundary: no DOM, no time except `dt`, no
// randomness except the seeded RNG carried in state.
//
// Contract this suite asks DEV to implement (in the space phase of sim.ts,
// mirroring the existing bolt-vs-TIE loop and the named-constant convention):
//
//   * A player bolt overlapping an enemy fireball destroys that fireball
//     (removed from state.enemyShots) and is itself consumed (one bolt, one
//     kill — exactly like a TIE kill).
//   * Interception costs NO shield: a fireball shot down away from the cockpit
//     never decrements `lives`.
//   * Destroying a fireball scores `FIREBALL_SCORE` (a NEW named constant in
//     state.ts; its exact value is GREEN's tuning call — the test references it
//     by name, so it stays correct whatever value the disassembly/feel yields,
//     including 0).
//   * A new `ENEMY_SHOT_HIT_RADIUS` named constant (state.ts) sizes the hit
//     sphere, joining TIE_HIT_RADIUS / TURRET_HIT_RADIUS / PORT_HIT_RADIUS.
//   * Destroying a fireball emits a positioned `fireball-destroyed` event
//     (a fresh GameEvent variant) so Wave-5 SFX/particles have a cue — every
//     other destruction in the game already emits a positioned cue.
//
// Constants are referenced by name, never hard-coded, so the suite survives
// whatever authentic-feel numbers GREEN settles on.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  PROJECTILE_TTL,
  ENEMY_SHOT_TTL,
  ENEMY_SHOT_HIT_RADIUS,
  FIREBALL_SCORE,
  TIE_SCORE,
  type GameState,
  type Projectile,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { FireballDestroyedEvent } from '../../src/core/events'
import { IDENTITY, type Vec3 } from '@arcade/shared/math3d'

// A point well downrange of the cockpit: far outside COCKPIT_HIT_RADIUS (80),
// so anything destroyed here is destroyed "before it reaches the cockpit" and
// cannot be confused with a cockpit collision.
const DOWNRANGE: Vec3 = [0, 0, -400]

// Minimal literals; stepGame reads `.pos` for the hit-test (and vel/ttl to age
// the bolt). A player bolt flies into the screen (−Z); a fireball flies back
// toward the cockpit (+Z). At the tiny dt these tests use, neither moves enough
// to leave the hit sphere it starts in.
const playerBolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })
const fireball = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, 1], ttl: ENEMY_SHOT_TTL })
// A fully-typed TIE fixture (stepGame reads `.pos` for the hit-test; vel/orient
// keep it a real Enemy, no type-escape cast).
const tie = (pos: Vec3): Enemy => ({ pos, vel: [0, 0, 0], kind: 'tie', orient: IDENTITY })

// The cockpit origin — where a fireball lands (and costs a shield) if it is not
// intercepted first.
const COCKPIT: Vec3 = [0, 0, 0]

/** A fresh wave: initialState already starts in the 'space' phase. */
const wave = (seed = 1983): GameState => initialState(seed)

/** A single step short enough that bolts/fireballs stay put for the hit-test. */
const TICK = 0.001

describe('Wave 1 — intercepting a fireball (story 8-18)', () => {
  it('a player bolt striking a fireball destroys it', () => {
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE)], projectiles: [playerBolt(DOWNRANGE)] }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.enemyShots).toHaveLength(0)
  })

  it('the bolt is consumed when it destroys a fireball', () => {
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE)], projectiles: [playerBolt(DOWNRANGE)] }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.projectiles).toHaveLength(0)
  })

  it('intercepting a fireball downrange costs no shield', () => {
    // The whole point of the story: kill it before it lands, take no damage.
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE)], projectiles: [playerBolt(DOWNRANGE)] }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.lives).toBe(STARTING_LIVES)
  })

  it('destroying a fireball scores FIREBALL_SCORE points', () => {
    // Value is GREEN's tuning call; the test pins the wiring via the constant.
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE)], projectiles: [playerBolt(DOWNRANGE)] }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.score).toBe(base.score + FIREBALL_SCORE)
  })

  it('emits a positioned fireball-destroyed cue for the kill', () => {
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE)], projectiles: [playerBolt(DOWNRANGE)] }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    const cue = s1.events.find((e): e is FireballDestroyedEvent => e.type === 'fireball-destroyed')
    expect(cue).toBeDefined()
    // Carries the fireball's OWN world-space position (≈ DOWNRANGE, not the
    // cockpit origin) for Wave-5 particle/SFX placement.
    expect(cue?.pos[2]).toBeCloseTo(-400, 0)
  })

  it('exposes a positive named hit radius for fireballs', () => {
    // Joins TIE_HIT_RADIUS / TURRET_HIT_RADIUS / PORT_HIT_RADIUS — one named
    // place for the magic number, not a literal buried in the step.
    expect(ENEMY_SHOT_HIT_RADIUS).toBeGreaterThan(0)
  })

  it('awards a positive score for a fireball kill', () => {
    // Pairs with the named-radius guard above: keeps the scoring tests
    // meaningful rather than passing vacuously if FIREBALL_SCORE were 0.
    expect(FIREBALL_SCORE).toBeGreaterThan(0)
  })

  it('intercepts a fireball at the cockpit without losing a shield', () => {
    // The standingShots-before-cockpit ordering: a bolt and a fireball BOTH at
    // the cockpit on the same step — the bolt wins, no shield is lost. A
    // regression that fed the raw enemyShots to the cockpit-damage pass would
    // fail here (the fireball would be both shot down AND cost a shield).
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(COCKPIT)], projectiles: [playerBolt(COCKPIT)] }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.enemyShots).toHaveLength(0)
    expect(s1.lives).toBe(STARTING_LIVES)
    expect(s1.score).toBe(base.score + FIREBALL_SCORE)
  })

  it('does not advance the space-phase kill quota when a fireball is shot', () => {
    // Only TIE kills feed phaseKills; intercepting a fireball must not advance
    // the wave toward its clear quota.
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE)], projectiles: [playerBolt(DOWNRANGE)] }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.phaseKills).toBe(s0.phaseKills)
  })
})

describe('Wave 1 — fireballs that are not hit (story 8-18)', () => {
  it('a bolt that misses leaves the fireball in flight', () => {
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE)], projectiles: [playerBolt([9999, 0, -400])] }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.enemyShots).toHaveLength(1)
  })

  it('a missing bolt is NOT consumed and scores nothing', () => {
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE)], projectiles: [playerBolt([9999, 0, -400])] }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.projectiles).toHaveLength(1)
    expect(s1.score).toBe(base.score)
    expect(s1.events.some((e) => e.type === 'fireball-destroyed')).toBe(false)
  })

  it('a fireball with no bolt near it is left untouched', () => {
    // Guards against the new hit-test firing on its own — a fireball alone in
    // flight survives and costs nothing while it is still downrange.
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [fireball(DOWNRANGE)] }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.enemyShots).toHaveLength(1)
    expect(s1.lives).toBe(STARTING_LIVES)
  })
})

describe('Wave 1 — multiple bolts and fireballs (story 8-18)', () => {
  it('one bolt destroys at most one fireball', () => {
    // Two fireballs share a spot; a single bolt spends itself on one and the
    // other survives — one bolt, one kill, exactly like the TIE loop.
    const base = wave()
    const s0: GameState = {
      ...base,
      enemyShots: [fireball(DOWNRANGE), fireball(DOWNRANGE)],
      projectiles: [playerBolt(DOWNRANGE)],
    }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.enemyShots).toHaveLength(1)
    expect(s1.projectiles).toHaveLength(0)
  })

  it('separate bolts destroy separate fireballs', () => {
    const base = wave()
    const a: Vec3 = [-300, 0, -400]
    const b: Vec3 = [300, 0, -400]
    const s0: GameState = {
      ...base,
      enemyShots: [fireball(a), fireball(b)],
      projectiles: [playerBolt(a), playerBolt(b)],
    }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.enemyShots).toHaveLength(0)
    expect(s1.projectiles).toHaveLength(0)
    expect(s1.score).toBe(base.score + 2 * FIREBALL_SCORE)
  })

  it('a single bolt overlapping a TIE and a fireball spends on only one', () => {
    // Shared spentBolt across the two kill loops: one bolt cannot down both.
    // The TIE loop runs first, so the bolt is spent on the TIE and the fireball
    // survives — only the TIE scores.
    const base = wave()
    const at: Vec3 = [0, 0, -100]
    const s0: GameState = {
      ...base,
      enemies: [tie(at)],
      enemyShots: [fireball(at)],
      projectiles: [playerBolt(at)],
    }
    const s1 = stepGame(s0, NO_INPUT, TICK)
    expect(s1.enemies).toHaveLength(0) // TIE killed
    expect(s1.enemyShots).toHaveLength(1) // fireball survives — the bolt was already spent
    expect(s1.score).toBe(base.score + TIE_SCORE) // only the TIE scored, not the fireball
  })
})

describe('Wave 1 — purity & determinism (story 8-18)', () => {
  it('does not mutate the input state when destroying a fireball', () => {
    const base = wave()
    const shots = [fireball(DOWNRANGE)]
    const bolts = [playerBolt(DOWNRANGE)]
    const s0: GameState = { ...base, enemyShots: shots, projectiles: bolts }
    stepGame(s0, NO_INPUT, TICK)
    // The input arrays are untouched: same references, same contents.
    expect(s0.enemyShots).toBe(shots)
    expect(s0.enemyShots).toHaveLength(1)
    expect(s0.projectiles).toBe(bolts)
    expect(s0.projectiles).toHaveLength(1)
  })

  it('identical seeds and inputs yield identical states through a fireball kill', () => {
    const setup = (seed: number): GameState => ({
      ...wave(seed),
      enemyShots: [fireball(DOWNRANGE)],
      projectiles: [playerBolt(DOWNRANGE)],
    })
    let a = setup(42)
    let b = setup(42)
    for (let i = 0; i < 10; i++) {
      a = stepGame(a, NO_INPUT, 0.02)
      b = stepGame(b, NO_INPUT, 0.02)
    }
    expect(a).toEqual(b)
  })
})
