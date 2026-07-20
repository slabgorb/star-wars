// tests/core/difficulty.test.ts
//
// RED-phase suite for Story 8-6 (Wave 4 — framing), Part C: the difficulty ramp.
// A run escalates across WAVES — each completed run loops back harder. The ramp
// is a PURE function of the wave number, `waveParams(wave)`, living in the core's
// pure rule helpers (src/core/gameRules.ts) right beside aimDirection/collides.
// It MIRRORS tempest's `levelParams(level)` (the explicit reuse mandate),
// adapted: star-wars ramps the space-combat cadence/speed rather than tube enemy
// tables.
//
// IMPORTANT (consume 8-8, do not duplicate): this is the DIFFICULTY ramp only.
// The phase-transition machinery (space -> surface -> trench, the kill quotas)
// belongs to story 8-8 and is untouched here — waveParams scales how hard a wave
// plays, not how phases advance.
//
// `waveParams` is absent pre-GREEN. gameRules.ts ALREADY exists, so the namespace
// import below resolves cleanly and the missing member reads as `undefined`;
// every test that calls it fails LOCALLY with "is not a function" — a clean
// per-test missing-feature RED, never a module-load crash.
//
// TEA decisions pinned here (logged as deviations in .session/8-6-session.md):
//  - Wave 1 is the BASELINE: waveParams(1) reproduces today's space constants
//    exactly (SPAWN_INTERVAL, ENEMY_SPEED, ENEMY_FIRE_INTERVAL), so wiring the
//    ramp into the sim does not change wave-1 balance (the 8-3 suite stays green).
//  - Higher waves TIGHTEN cadence (shorter spawn/fire intervals) and SPEED UP
//    enemies (faster approach) — monotonically, before the floors bind.
//  - Timing intervals are CLAMPED to positive playable floors so an arbitrarily
//    deep wave never drives a cadence to zero (the game stays finite/playable).
//  - waveParams is PURE: same wave -> deep-equal params; no time, no randomness.
import { describe, it, expect } from 'vitest'
import { SPAWN_INTERVAL, ENEMY_FIRE_INTERVAL } from '../../src/core/state'
import * as gameRules from '../../src/core/gameRules'

interface WaveParams {
  spawnInterval: number
  enemyFireInterval: number
}

// Absent pre-GREEN -> `undefined`. Calling it throws "is not a function" inside
// the test that uses it: a clean missing-feature RED.
const waveParams = (gameRules as unknown as { waveParams: (wave: number) => WaveParams }).waveParams

describe('waveParams — wave 1 is the unchanged baseline (parity with 8-3)', () => {
  it('reproduces today\'s space-combat constants exactly at wave 1', () => {
    const p = waveParams(1)
    expect(p.spawnInterval).toBe(SPAWN_INTERVAL)
    expect(p.enemyFireInterval).toBe(ENEMY_FIRE_INTERVAL)
  })
})

describe('waveParams — escalates with the wave number (AC: difficulty ramp)', () => {
  it('tightens spawn cadence on later waves (TIEs arrive sooner)', () => {
    expect(waveParams(2).spawnInterval).toBeLessThan(waveParams(1).spawnInterval)
    expect(waveParams(3).spawnInterval).toBeLessThan(waveParams(2).spawnInterval)
  })

  it('tightens the enemy fire cadence on later waves (fireballs come faster)', () => {
    expect(waveParams(2).enemyFireInterval).toBeLessThan(waveParams(1).enemyFireInterval)
    expect(waveParams(3).enemyFireInterval).toBeLessThan(waveParams(2).enemyFireInterval)
  })

  // NOTE: the "speeds up the enemy approach on later waves" case was removed in sw7-23.
  // The `enemySpeed` ramp only ever seeded the unread `Enemy.vel`, so later-wave TIEs
  // never actually approached faster; difficulty escalates through spawn + fire cadence
  // (above) and the TGPROB concurrency cap. See tie-flight-cleanup.test.ts.
})

describe('waveParams — clamps timing to positive playable floors (AC: stays finite)', () => {
  it('keeps cadences positive and below the wave-1 value at a very deep wave', () => {
    const deep = waveParams(50)
    const base = waveParams(1)
    // Positive: a deep wave must never drive a cadence to zero.
    expect(deep.spawnInterval).toBeGreaterThan(0)
    expect(deep.enemyFireInterval).toBeGreaterThan(0)
    // Tighter than wave 1: the ramp actually bit before the floor caught it.
    expect(deep.spawnInterval).toBeLessThanOrEqual(base.spawnInterval)
    expect(deep.enemyFireInterval).toBeLessThanOrEqual(base.enemyFireInterval)
  })

  it('floors actually BIND — two very deep waves clamp to the same cadence', () => {
    // Without a floor, wave 400 would be strictly tighter than wave 200; equality
    // here proves both hit the same positive clamp (a real floor, not zero).
    expect(waveParams(400).spawnInterval).toBe(waveParams(200).spawnInterval)
    expect(waveParams(400).enemyFireInterval).toBe(waveParams(200).enemyFireInterval)
    expect(waveParams(200).spawnInterval).toBeGreaterThan(0)
    expect(waveParams(200).enemyFireInterval).toBeGreaterThan(0)
  })
})

describe('waveParams — pure and deterministic (sacred core boundary)', () => {
  it('returns deep-equal params for the same wave on repeated calls', () => {
    expect(waveParams(7)).toEqual(waveParams(7))
    expect(waveParams(23)).toEqual(waveParams(23))
  })

  it('returns distinct params for distinct waves (the ramp is not flat)', () => {
    expect(waveParams(1)).not.toEqual(waveParams(5))
  })
})
