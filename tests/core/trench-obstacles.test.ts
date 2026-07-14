// tests/core/trench-obstacles.test.ts
//
// Fidelity epic, task 3 — the trench's wall content as ENTITIES: shootable
// turrets and wall squares, and catwalk hazards spanning the channel. RED phase.
//
// Semantics (docs/star-wars-1983-source-findings.md ## Trench catwalks, turrets
// & wall squares, ## Scoring tables): turrets and squares are wall-mounted and
// shootable — a player bolt within OBSTACLE_HIT_RADIUS destroys them and scores;
// catwalks are pure hazards — cockpit contact costs a shield (reuses the
// terrain-crash event) and removes the catwalk. All obstacles scroll toward the
// cockpit with the channel (TRENCH_SCROLL_SPEED) and despawn once they pass it.

import { describe, it, expect } from 'vitest'
import {
  spawnTrenchObstacles,
  TRENCH_OBSTACLE_STATIONS,
  TRENCH_TURRET_SCORE,
  TRENCH_SQUARE_SCORE,
  OBSTACLE_HIT_RADIUS,
} from '../../src/core/trench-obstacles'
import { initialState, TRENCH_SCROLL_SPEED, PROJECTILE_TTL, type GameState } from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { createRng } from '@arcade/shared/rng'
import { TRENCH_EYE_SEAT } from '../../src/core/trench-channel'

describe('trench obstacles — spawn & scroll', () => {
  it('enterPhase(trench) seeds the run chain from the run RNG; other phases carry none', () => {
    const t = enterPhase(initialState(), 'trench')
    // sw3-7: the trench chain is now SEEDED from the run RNG (fixed-head +
    // picked-tail, ROM sub_83A4), so it equals the generator seeded with the
    // run's own seed — no longer the static no-arg default. enterPhase must seed
    // from a LOCAL cursor (createRng(state.rng.seed)) so the run RNG is unmutated.
    expect(t.trenchObstacles).toEqual(spawnTrenchObstacles(createRng(initialState().rng.seed)))
    expect(t.trenchObstacles.length).toBe(TRENCH_OBSTACLE_STATIONS.length)
    expect(enterPhase(initialState(), 'space').trenchObstacles).toEqual([])
    expect(enterPhase(initialState(), 'surface').trenchObstacles).toEqual([])
  })

  it('spawnTrenchObstacles returns fresh arrays (no shared mutable state)', () => {
    const a = spawnTrenchObstacles()
    const b = spawnTrenchObstacles()
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it('obstacles scroll toward the cockpit at TRENCH_SCROLL_SPEED, like the port', () => {
    const s0 = enterPhase(initialState(), 'trench')
    const z0 = s0.trenchObstacles[0].pos[2]
    const s1 = stepGame(s0, NO_INPUT, 0.1)
    expect(s1.trenchObstacles[0].pos[2]).toBeCloseTo(z0 + TRENCH_SCROLL_SPEED * 0.1)
  })

  it('despawns obstacles that pass the cockpit (pos z > 0)', () => {
    let s = enterPhase(initialState(), 'trench')
    const nearest: GameState = {
      ...s,
      trenchObstacles: [{ ...s.trenchObstacles[0], pos: [s.trenchObstacles[0].pos[0], s.trenchObstacles[0].pos[1], -0.1] }],
    }
    const stepped = stepGame(nearest, NO_INPUT, 1)
    expect(stepped.trenchObstacles.length).toBe(0)
  })
})

describe('trench obstacles — shooting & scoring', () => {
  /** A trench state with one obstacle of `kind` dead ahead and a live bolt on it. */
  function boltOn(kind: 'turret' | 'square'): GameState {
    const s = enterPhase(initialState(), 'trench')
    const pos: [number, number, number] = [0, 60, -400]
    return {
      ...s,
      mode: 'playing',
      trenchObstacles: [{ kind, pos }],
      projectiles: [{ pos: [...pos], vel: [0, 0, -1], ttl: PROJECTILE_TTL }],
    }
  }

  it('a bolt on a TURRET destroys it, scores TRENCH_TURRET_SCORE, emits the event', () => {
    const s1 = stepGame(boltOn('turret'), NO_INPUT, 1 / 60)
    expect(s1.trenchObstacles.length).toBe(0)
    expect(s1.score).toBe(TRENCH_TURRET_SCORE)
    expect(s1.events).toContainEqual({ type: 'trench-obstacle-destroyed', kind: 'turret' })
  })

  it('a bolt on a SQUARE destroys it and scores TRENCH_SQUARE_SCORE', () => {
    const s1 = stepGame(boltOn('square'), NO_INPUT, 1 / 60)
    expect(s1.trenchObstacles.length).toBe(0)
    expect(s1.score).toBe(TRENCH_SQUARE_SCORE)
  })

  it('the destroying bolt is consumed (no double-kill on the port behind)', () => {
    const s1 = stepGame(boltOn('turret'), NO_INPUT, 1 / 60)
    expect(s1.projectiles.length).toBe(0)
  })

  it('CATWALKS are not shootable — a bolt passes through', () => {
    const s = enterPhase(initialState(), 'trench')
    const pos: [number, number, number] = [0, 60, -400]
    const s1 = stepGame(
      {
        ...s,
        mode: 'playing',
        trenchObstacles: [{ kind: 'catwalk', pos }],
        projectiles: [{ pos: [...pos], vel: [0, 0, -1], ttl: PROJECTILE_TTL }],
      },
      NO_INPUT,
      1 / 60,
    )
    expect(s1.trenchObstacles.length).toBe(1)
    expect(s1.score).toBe(0)
  })

  it('cockpit contact with a CATWALK costs a shield and emits terrain-crash', () => {
    const s = enterPhase(initialState(), 'trench')
    const lives0 = s.lives
    // Parked ON the cockpit. sw5-6 re-framed the eye: `trenchView` is now a height ABOVE
    // the y=0 trench floor, seated at TRENCH_EYE_SEAT — so "at the cockpit" is the seat,
    // not the origin. (Staged at y=0 this catwalk would sit on the FLOOR, 768 below the
    // pilot, and correctly miss him.) The intent — contact crashes — is unchanged.
    const s1 = stepGame(
      { ...s, mode: 'playing', trenchObstacles: [{ kind: 'catwalk', pos: [0, TRENCH_EYE_SEAT, -1] }] },
      NO_INPUT,
      1 / 60,
    )
    expect(s1.lives).toBe(lives0 - 1)
    expect(s1.events).toContainEqual({ type: 'terrain-crash' })
    expect(s1.trenchObstacles.length).toBe(0) // crashed through it
  })

  it('OBSTACLE_HIT_RADIUS and both scores are positive (table sanity)', () => {
    expect(OBSTACLE_HIT_RADIUS).toBeGreaterThan(0)
    expect(TRENCH_TURRET_SCORE).toBeGreaterThan(0)
    expect(TRENCH_SQUARE_SCORE).toBeGreaterThan(0)
    expect(TRENCH_OBSTACLE_STATIONS.length).toBeGreaterThanOrEqual(8) // ≥ the off_7CC0 record count
    for (const o of TRENCH_OBSTACLE_STATIONS) expect(o.pos[2]).toBeLessThan(0) // all downrange
  })

  it('is deterministic for a fixed seed across 20 trench steps', () => {
    let a = enterPhase(initialState(7), 'trench')
    let b = enterPhase(initialState(7), 'trench')
    for (let i = 0; i < 20; i++) {
      a = stepGame(a, NO_INPUT, 0.1)
      b = stepGame(b, NO_INPUT, 0.1)
    }
    expect(a).toEqual(b)
  })
})
