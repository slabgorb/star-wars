// tests/core/space-combat.test.ts
//
// Wave 1 — space combat (story 8-3), RED phase.
//
// These tests define the gameplay contract for the first playable wave and are
// EXPECTED TO FAIL until the GREEN phase implements it. They drive behaviour
// through the existing pure surface — `stepGame(state, input, dt)` and the
// `GameState` it returns — so they assert observable gameplay, not internal
// shape. Everything here obeys the sacred boundary: no DOM, no time except `dt`,
// no randomness except the seeded RNG carried in state.
//
// Contract this suite asks DEV to implement (per context-story-8-3.md, which
// says to express constants/mechanics as typed TS in src/core/state.ts):
//
//   GameState gains:
//     projectiles: Projectile[]   // player bolts in flight
//     enemies:     Enemy[]         // live TIE fighters
//     enemyShots:  Projectile[]    // enemy fireballs in flight
//     gameOver:    boolean         // wave over (last life lost)
//   interface Projectile { pos: Vec3; vel: Vec3; ttl: number }
//   interface Enemy      { pos: Vec3; ... }   // pos is what collision reads
//
//   Constants (real values recovered from StarWars.asm in GREEN):
//     STARTING_LIVES, TIE_SCORE, PROJECTILE_TTL, FIRE_INTERVAL,
//     SPAWN_INTERVAL, WAVE_SIZE
//
// Tests reference those constants by name rather than hard-coding numbers, so
// they remain correct whatever authentic values the disassembly yields.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  TIE_SCORE,
  PROJECTILE_TTL,
  FIRE_INTERVAL,
  SPAWN_INTERVAL,
  WAVE_SIZE,
  type GameState,
  type Projectile,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import { dot, sub, type Vec3 } from '@arcade/shared/math3d'

/** Trigger held, yoke centred. */
const FIRE: Input = { aimX: 0, aimY: 0, fire: true }

/** A fresh wave: initialState already starts in the 'space' phase. */
const wave = (seed = 1983): GameState => initialState(seed)

describe('Wave 1 — firing system', () => {
  it('pulling the trigger spawns exactly one projectile', () => {
    const s = stepGame(wave(), FIRE, 0.016)
    expect(s.projectiles).toHaveLength(1)
  })

  it('a fired bolt has a 3D position, a velocity, and a bounded lifetime', () => {
    const p = stepGame(wave(), FIRE, 0.016).projectiles[0]
    expect(p.pos).toHaveLength(3)
    expect(p.vel).toHaveLength(3)
    // Camera looks down -Z, so a centred shot flies into the screen.
    expect(p.vel[2]).toBeLessThan(0)
    expect(p.ttl).toBeCloseTo(PROJECTILE_TTL)
  })

  it('holding nothing fires nothing', () => {
    const s = stepGame(wave(), NO_INPUT, 0.016)
    expect(s.projectiles).toHaveLength(0)
  })

  it('rate-limits firing within one fire interval', () => {
    // Two sub-interval steps => the cooldown blocks the second shot.
    let s = stepGame(wave(), FIRE, FIRE_INTERVAL * 0.25)
    s = stepGame(s, FIRE, FIRE_INTERVAL * 0.25)
    expect(s.projectiles).toHaveLength(1)
  })

  it('fires again once the fire interval elapses', () => {
    let s = stepGame(wave(), FIRE, FIRE_INTERVAL * 1.1)
    s = stepGame(s, FIRE, FIRE_INTERVAL * 1.1)
    expect(s.projectiles).toHaveLength(2)
  })

  it('a bolt advances forward (down -Z) each step', () => {
    const s1 = stepGame(wave(), FIRE, 0.016)
    const z1 = s1.projectiles[0].pos[2]
    const s2 = stepGame(s1, NO_INPUT, 0.05)
    expect(s2.projectiles[0].pos[2]).toBeLessThan(z1)
  })

  it('a bolt expires after its lifetime', () => {
    const s1 = stepGame(wave(), FIRE, 0.016)
    expect(s1.projectiles).toHaveLength(1)
    const s2 = stepGame(s1, NO_INPUT, PROJECTILE_TTL + 1)
    expect(s2.projectiles).toHaveLength(0)
  })
})

describe('Wave 1 — enemy spawning & movement', () => {
  it('the wave opens with an empty sky', () => {
    expect(wave().enemies).toHaveLength(0)
  })

  it('TIE fighters spawn on a timed schedule', () => {
    let s = wave()
    for (let i = 0; i < 16; i++) s = stepGame(s, NO_INPUT, (SPAWN_INTERVAL * 2) / 16)
    expect(s.enemies.length).toBeGreaterThan(0)
  })

  it('TIEs spawn ahead of the cockpit (down -Z)', () => {
    let s = wave()
    for (let i = 0; i < 16 && s.enemies.length === 0; i++) {
      s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 4)
    }
    expect(s.enemies.length).toBeGreaterThan(0)
    for (const e of s.enemies) expect(e.pos[2]).toBeLessThan(0)
  })

  it('never puts more than a wave of TIEs on screen at once', () => {
    let s = wave()
    for (let i = 0; i < 80; i++) {
      s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 2)
      expect(s.enemies.length).toBeLessThanOrEqual(WAVE_SIZE)
    }
  })

  it('spawns identically for a fixed seed (determinism)', () => {
    let a = wave(7)
    let b = wave(7)
    for (let i = 0; i < 20; i++) {
      a = stepGame(a, NO_INPUT, SPAWN_INTERVAL / 2)
      b = stepGame(b, NO_INPUT, SPAWN_INTERVAL / 2)
    }
    expect(a.enemies).toEqual(b.enemies)
  })

  it('TIEs close on the cockpit over time', () => {
    let s = wave()
    for (let i = 0; i < 16 && s.enemies.length === 0; i++) {
      s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 4)
    }
    expect(s.enemies.length).toBeGreaterThan(0)
    const frontBefore = Math.max(...s.enemies.map((e) => e.pos[2]))
    // Net approach over a short window. Story 9-2 gives TIEs curved/weaving paths,
    // so a single sub-step can arc laterally; the cabinet invariant is that they
    // CLOSE IN over time — asserted here across ~1s rather than a single tick.
    for (let i = 0; i < 8; i++) s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 8)
    const frontAfter = Math.max(...s.enemies.map((e) => e.pos[2]))
    expect(frontAfter).toBeGreaterThan(frontBefore)
  })

  it('enemies fire fireballs aimed at the cockpit', () => {
    let s = wave()
    let armed = false
    for (let i = 0; i < 400 && !armed; i++) {
      s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 4)
      if (s.enemyShots && s.enemyShots.length > 0) armed = true
    }
    expect(armed).toBe(true)
    // Each enemy bolt's velocity points back toward the cockpit at the origin.
    for (const shot of s.enemyShots) {
      expect(dot(shot.vel, sub([0, 0, 0], shot.pos))).toBeGreaterThan(0)
    }
  })
})

describe('Wave 1 — collisions, scoring & lives', () => {
  // Minimal literals; stepGame reads `.pos` for hit-tests (and a bolt's vel/ttl).
  const bolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })
  const tie = (pos: Vec3): Enemy => ({ pos } as Enemy)

  it('a bolt striking a TIE destroys it, is consumed, and scores', () => {
    const base = wave()
    const s0: GameState = { ...base, enemies: [tie([0, 0, -100])], projectiles: [bolt([0, 0, -100])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.enemies).toHaveLength(0)
    expect(s1.projectiles).toHaveLength(0)
    expect(s1.score).toBe(base.score + TIE_SCORE)
  })

  it('a bolt that misses leaves the TIE alive and the score untouched', () => {
    const base = wave()
    const s0: GameState = { ...base, enemies: [tie([0, 0, -100])], projectiles: [bolt([9999, 0, -100])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.enemies).toHaveLength(1)
    expect(s1.score).toBe(base.score)
  })

  it('an enemy fireball reaching the cockpit costs a life and is consumed', () => {
    const base = wave()
    const s0: GameState = { ...base, enemyShots: [bolt([0, 0, 0])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBe(base.lives - 1)
    expect(s1.enemyShots).toHaveLength(0)
    expect(s1.score).toBe(base.score) // taking a hit never scores
  })

  it('a TIE reaching the cockpit costs a life and is removed', () => {
    const base = wave()
    const s0: GameState = { ...base, enemies: [tie([0, 0, 0])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBe(base.lives - 1)
    expect(s1.enemies).toHaveLength(0)
  })

  it('starts with the disassembly-defined number of lives', () => {
    expect(wave().lives).toBe(STARTING_LIVES)
  })

  it('ends the wave (game over) when the last life is lost', () => {
    const base = wave()
    const s0: GameState = { ...base, lives: 1, enemyShots: [bolt([0, 0, 0])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBe(0)
    expect(s1.gameOver).toBe(true)
  })

  it('never lets lives fall below zero', () => {
    const base = wave()
    const s0: GameState = { ...base, lives: 1, enemyShots: [bolt([0, 0, 0]), bolt([0, 0, 0])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBeGreaterThanOrEqual(0)
  })
})

describe('Wave 1 — determinism & purity', () => {
  it('the crosshair tracks the yoke (aim is copied into state)', () => {
    const s = stepGame(wave(), { aimX: 0.4, aimY: -0.7, fire: false }, 0.016)
    expect(s.aimX).toBeCloseTo(0.4)
    expect(s.aimY).toBeCloseTo(-0.7)
  })

  it('identical inputs from identical seeds yield identical states', () => {
    let a = wave(42)
    let b = wave(42)
    const script: Input[] = [FIRE, NO_INPUT, FIRE, FIRE, NO_INPUT]
    for (let i = 0; i < 25; i++) {
      const inp = script[i % script.length]
      a = stepGame(a, inp, 0.02)
      b = stepGame(b, inp, 0.02)
    }
    expect(a).toEqual(b)
  })

  it('does not mutate the input state in place', () => {
    const s = wave()
    const projectilesBefore = s.projectiles
    const scoreBefore = s.score
    stepGame(s, FIRE, 0.016)
    expect(s.projectiles).toBe(projectilesBefore) // same array reference, untouched
    expect(s.projectiles).toHaveLength(0)
    expect(s.score).toBe(scoreBefore)
  })
})
