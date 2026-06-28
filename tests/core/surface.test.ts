// tests/core/surface.test.ts
//
// Wave 2 — Death Star surface (story 8-4), RED phase.
//
// These tests define the gameplay contract for the surface phase and are
// EXPECTED TO FAIL until the GREEN phase implements it. They drive behaviour
// through the existing pure surface — `stepGame(state, input, dt)` and the
// `GameState` it returns — exactly as the Wave 1 suite does, so they assert
// observable gameplay, not internal shape. Everything obeys the sacred boundary:
// no DOM, no time except `dt`, no randomness except the seeded RNG in state.
//
// Contract this suite asks DEV to implement (per context-story-8-4.md). In
// surface phase the run skims the Death Star floor (the y=0 plane) while laser
// turrets rise ahead and fire at the cockpit:
//
//   GameState gains:
//     altitude: number          // player height above the y=0 surface
//     turrets:  Turret[]         // laser turrets standing on the surface
//   interface Turret { pos: Vec3 }   // pos is what the hit-test reads
//   (turret fire reuses the existing enemyShots: Projectile[])
//
//   Constants (real-feel values recovered/derived from StarWars.asm in GREEN,
//   single-sourced in src/core/state.ts as the Wave 1 constants were):
//     SKIM_ALTITUDE, MIN_SKIM_ALTITUDE, TURRET_SPAWN_INTERVAL,
//     MAX_TURRETS, TURRET_SCORE, TURRET_HIT_RADIUS
//
// Tests reference those by name rather than hard-coding numbers, so they remain
// correct whatever authentic values GREEN settles on. Like the Wave 1 RED suite,
// this file references state fields and render exports the GREEN phase will add;
// `tsc` is red until then (the new symbols don't exist yet), while vitest runs
// and reports the contract as failing. Once GREEN lands, the file typechecks
// with no casts.
//
// YOKE-Y CONVENTION (TEA design decision — see session deviations): the spec
// leaves the sign of yoke-Y -> altitude undefined, and input.ts's doc comment
// ("up..down") contradicts aimDirection()/the render NDC, which both treat
// +aimY as up. This suite adopts the latter, used convention: +aimY climbs.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  SKIM_ALTITUDE,
  MIN_SKIM_ALTITUDE,
  TURRET_SPAWN_INTERVAL,
  MAX_TURRETS,
  TURRET_SCORE,
  PROJECTILE_TTL,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import { dot, sub, type Vec3 } from '../../src/core/math3d'
import * as RenderModule from '../../src/shell/render'

/** A fresh surface run: Wave 1's initial state flipped into the surface phase. */
const surface = (seed = 1983): GameState => ({ ...initialState(seed), phase: 'surface' })

const CLIMB: Input = { aimX: 0, aimY: 1, fire: false } // +aimY = nose up
const DIVE: Input = { aimX: 0, aimY: -1, fire: false } // -aimY = nose down

// --- AC2: display orientation (structural) ----------------------------------
// The authentic object-space axes do not match the in-game view, so render.ts
// must carry a fixed orientation transform per surface model (floor in y=0,
// towers on +y), mirroring the planned TIE_ORIENT pattern. Visual correctness
// (orientation/scale) is confirmed by EYEBALL in the dev server — these tests
// only assert the transforms are defined and well-formed.

const isMat4 = (m: unknown): boolean =>
  Array.isArray(m) && m.length === 16 && m.every((n) => Number.isFinite(n))

describe('Wave 2 — display orientation transforms', () => {
  it('render exports a SURFACE_ORIENT 4x4 matrix', () => {
    expect(isMat4(RenderModule.SURFACE_ORIENT)).toBe(true)
  })

  it('render exports a TOWER_ORIENT 4x4 matrix', () => {
    expect(isMat4(RenderModule.TOWER_ORIENT)).toBe(true)
  })
})

// --- AC3: terrain skim ------------------------------------------------------

describe('Wave 2 — terrain skim', () => {
  it('the player starts at the nominal skim altitude, clear of the surface', () => {
    const s = surface()
    expect(typeof s.altitude).toBe('number')
    expect(s.altitude).toBe(SKIM_ALTITUDE)
    expect(s.altitude).toBeGreaterThan(MIN_SKIM_ALTITUDE)
  })

  it('the yoke flies the ship up and down (climb raises altitude above dive)', () => {
    const base = surface()
    const up = stepGame(base, CLIMB, 0.05).altitude
    const down = stepGame(base, DIVE, 0.05).altitude
    expect(typeof up).toBe('number')
    expect(typeof down).toBe('number')
    expect(down).toBeLessThan(up)
  })

  it('never lets the ship pass through the surface (altitude stays >= 0)', () => {
    let s = surface()
    for (let i = 0; i < 200; i++) {
      s = stepGame(s, DIVE, 0.05)
      expect(typeof s.altitude).toBe('number')
      expect(s.altitude).toBeGreaterThanOrEqual(0)
    }
  })

  it('scraping below the minimum skim height costs one shield', () => {
    const base = surface()
    const s0 = { ...base, altitude: MIN_SKIM_ALTITUDE - 1 }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBe(base.lives - 1)
    // ...and the ship recovers to a safe height rather than draining shields.
    expect(s1.altitude).toBeGreaterThanOrEqual(MIN_SKIM_ALTITUDE)
  })

  it('crashing into the surface on the last shield ends the run', () => {
    const base = surface()
    const s0 = { ...base, lives: 1, altitude: MIN_SKIM_ALTITUDE - 1 }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBe(0)
    expect(s1.gameOver).toBe(true)
  })
})

// --- AC3: laser turrets -----------------------------------------------------

describe('Wave 2 — laser turrets', () => {
  it('the surface run opens with no turrets', () => {
    const s = surface()
    expect(Array.isArray(s.turrets)).toBe(true)
    expect(s.turrets).toHaveLength(0)
  })

  it('does not scramble TIE fighters on the surface (turrets only)', () => {
    let s = surface()
    for (let i = 0; i < 40; i++) s = stepGame(s, NO_INPUT, 0.5)
    expect(s.enemies).toHaveLength(0)
  })

  it('turrets rise on a timed schedule', () => {
    let s = surface()
    for (let i = 0; i < 16; i++) s = stepGame(s, NO_INPUT, (TURRET_SPAWN_INTERVAL * 2) / 16)
    expect((s.turrets ?? []).length).toBeGreaterThan(0)
  })

  it('turrets stand on the surface ahead of the cockpit', () => {
    let s = surface()
    for (let i = 0; i < 32 && (s.turrets ?? []).length === 0; i++) {
      s = stepGame(s, NO_INPUT, TURRET_SPAWN_INTERVAL / 4)
    }
    const turrets = s.turrets ?? []
    expect(turrets.length).toBeGreaterThan(0)
    for (const t of turrets) {
      expect(t.pos[2]).toBeLessThan(0) // ahead, down -Z
      expect(t.pos[1]).toBeGreaterThanOrEqual(0) // on or above the floor, never sunk
    }
  })

  it('never puts more than MAX_TURRETS on the surface at once', () => {
    let s = surface()
    for (let i = 0; i < 120; i++) {
      s = stepGame(s, NO_INPUT, TURRET_SPAWN_INTERVAL / 2)
      expect((s.turrets ?? []).length).toBeLessThanOrEqual(MAX_TURRETS)
    }
  })

  it('turrets fire fireballs aimed at the cockpit', () => {
    let s = surface()
    let armed = false
    for (let i = 0; i < 400 && !armed; i++) {
      s = stepGame(s, NO_INPUT, TURRET_SPAWN_INTERVAL / 4)
      if (s.enemyShots && s.enemyShots.length > 0) armed = true
    }
    expect(armed).toBe(true)
    for (const shot of s.enemyShots) {
      expect(dot(shot.vel, sub([0, 0, 0], shot.pos))).toBeGreaterThan(0)
    }
  })

  it('spawns identically for a fixed seed (determinism)', () => {
    let a = surface(7)
    let b = surface(7)
    for (let i = 0; i < 20; i++) {
      a = stepGame(a, NO_INPUT, TURRET_SPAWN_INTERVAL / 2)
      b = stepGame(b, NO_INPUT, TURRET_SPAWN_INTERVAL / 2)
    }
    expect(a.turrets ?? []).toEqual(b.turrets ?? [])
    expect(a).toEqual(b)
  })
})

// --- AC3: collisions, scoring & lives ---------------------------------------

describe('Wave 2 — collisions, scoring & lives', () => {
  const bolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })
  const turretAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

  it('a player bolt striking a turret destroys it, is consumed, and scores', () => {
    const base = surface()
    const s0 = {
      ...base,
      turrets: [turretAt([0, 0, -100])],
      projectiles: [bolt([0, 0, -100])],
    }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.turrets ?? []).toHaveLength(0)
    expect(s1.projectiles).toHaveLength(0)
    expect(s1.score).toBe(base.score + TURRET_SCORE)
  })

  it('a player bolt that misses leaves the turret standing and the score untouched', () => {
    const base = surface()
    const s0 = {
      ...base,
      turrets: [turretAt([0, 0, -100])],
      projectiles: [bolt([9999, 0, -100])],
    }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.turrets ?? []).toHaveLength(1)
    expect(s1.score).toBe(base.score)
  })

  it('turret fire reaching the cockpit costs a shield and is consumed', () => {
    const base = surface()
    const s0 = { ...base, enemyShots: [bolt([0, 0, 0])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBe(base.lives - 1)
    expect(s1.enemyShots).toHaveLength(0)
    expect(s1.score).toBe(base.score) // taking a hit never scores
  })
})
