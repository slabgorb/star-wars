// tests/core/homing-fireball.test.ts
//
// Story sw4-2 — Homing fireball threat (RED phase).
//
// The 1983 cabinet's enemy fireball does NOT fly a straight line. `sub_A875`
// shrinks the shot's coordinates ~7/8 per cabinet tick, so it HOMES toward the
// ship along its launch line and self-despawns after a 64-tick life
// (docs/tie-flight-ai-model.md §6, `5,u = $40`). Because the coordinates only
// ever decay toward the cockpit, a fireball ALWAYS arrives (~1–2 s) from any
// launch range — the sole damage source in space (design spec §B, the
// world-metric / threat-restoration design, 2026-07-11). Today `sim.ts` gives
// the shot a constant `vel = toCockpit(pos) × ENEMY_SHOT_SPEED` (300 u/s), whose
// reach is 300 × ENEMY_SHOT_TTL = 1,800 — so from any realistic spawn it dies
// short and never threatens the player. This suite is EXPECTED TO FAIL until the
// GREEN phase ports the homing law.
//
// These tests drive the PUBLIC surface — `stepGame(state, input, dt)` and the
// `GameState` it returns — so they assert observable gameplay, not internal
// shape, and obey the sacred boundary: no DOM, no time except `dt`, no
// randomness except the seeded RNG carried in state.
//
// SPEC-FAITHFUL TEST STRATEGY (design spec §D). The cabinet tick rate is
// unpinned, so `TICK_HZ` and the exact per-tick decay rate are PROVISIONAL feel
// items verified by PLAYTEST, not unit tests. These tests therefore reference no
// `TICK_HZ` value; they pin only the invariants §D lists for the fireball:
//   * it DECELERATES as it homes — geometric decay, never a constant-speed line;
//   * it CONVERGES to the cockpit radius from ANY launch range, so an un-shot
//     fireball is a shield hit;
//   * it is FRAME-RATE INDEPENDENT — 30/60/144 Hz stepping ⇒ the same trajectory;
//   * it stays on its launch line — homes toward the cockpit, not away.
// The exact 7/8 factor and 64-tick life are left to the Reviewer's diff trace
// and playtest, per the spec's PROVISIONAL policy.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  STARTING_LIVES,
  ENEMY_SHOT_TTL,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { length, normalize, scale, sub, type Vec3 } from '@arcade/shared/math3d'

const COCKPIT: Vec3 = [0, 0, 0]

// A lone enemy fireball at `depth` units down the −Z sightline (optionally offset
// laterally), aimed at the cockpit exactly as `sim.ts` spawns it today: a
// constant velocity toward the origin at the current 300 u/s. The homing law
// IGNORES this velocity and decays the POSITION instead — the fixture carries it
// so the very same test also exercises today's straight-line code (and fails).
const fireball = (depth: number, x = 0, y = 0): Projectile => {
  const pos: Vec3 = [x, y, -depth]
  return { pos, vel: scale(normalize(sub(COCKPIT, pos)), 300), ttl: ENEMY_SHOT_TTL }
}

// An isolated space wave holding exactly one fireball: no fighters, the spawner
// parked (1e9) so no TIE ever appears, and lives left at the start count so only
// the fireball under test can move `lives`. `initialState` already starts in the
// 'space' phase with mode 'playing'.
const soloShot = (shot: Projectile): GameState => ({
  ...initialState(1983),
  enemies: [],
  enemyShots: [shot],
  projectiles: [],
  spawnTimer: 1e9,
})

describe('Story sw4-2 — homing fireball law (§B / §6 sub_A875)', () => {
  it('decelerates as it homes — geometric decay, not a constant-speed line', () => {
    // Sample the per-step distance covered over equal ticks. A homing shot bites
    // off 1/8 of the REMAINING distance each tick, a step that SHRINKS every tick
    // (strictly decreasing); the current straight-line shot covers the SAME
    // 300·dt every tick, so this strictly-decreasing assertion fails on it (RED).
    let s = soloShot(fireball(6000))
    const step: number[] = []
    let prev = length(s.enemyShots[0].pos)
    for (let i = 0; i < 6; i++) {
      s = stepGame(s, NO_INPUT, 0.05)
      const now = length(s.enemyShots[0].pos)
      step.push(prev - now)
      prev = now
    }
    for (let i = 1; i < step.length; i++) {
      expect(step[i]).toBeLessThan(step[i - 1])
    }
  })

  it('homes along its launch line — every step is a shrink toward the cockpit', () => {
    // The shot only ever decays toward the origin, so its position stays a
    // positive scalar multiple of the launch position with a smaller magnitude:
    // it heads straight at the cockpit, never drifting off the launch line. Green
    // on both laws — a homing-direction guard that keeps the "aimed at the
    // cockpit" contract intact under the motion change.
    const launch: Vec3 = [1500, -900, -6000]
    let s = soloShot(fireball(6000, 1500, -900))
    let prevLen = length(s.enemyShots[0].pos)
    for (let i = 0; i < 6; i++) {
      s = stepGame(s, NO_INPUT, 0.05)
      const p = s.enemyShots[0].pos
      // Still on the ray from the cockpit through the launch point: read the
      // scale factor off z, then confirm x and y rode the same factor.
      const k = p[2] / launch[2]
      expect(k).toBeGreaterThan(0)
      expect(p[0]).toBeCloseTo(k * launch[0], 3)
      expect(p[1]).toBeCloseTo(k * launch[1], 3)
      // …and closer to the cockpit than it was last tick.
      const len = length(p)
      expect(len).toBeLessThan(prevLen)
      prevLen = len
    }
  })

  it('converges to the cockpit and costs exactly one shield — from any launch range', () => {
    // The point of the restoration: an un-shot fireball ALWAYS arrives and takes
    // a shield, whether it launched from the fire floor (~2,048), today's spawn
    // (8,000), or the ROM spawn depth (31,744). The straight-line shot (reach
    // 1,800) dies short from every one of these → no shield → RED.
    for (const depth of [2048, 8000, 31744]) {
      let s = soloShot(fireball(depth))
      // Step until the shot is gone — it arrived, or (only if it never could)
      // expired. The cap dwarfs a 64-tick life at any plausible cabinet rate.
      for (let i = 0; i < 4000 && s.enemyShots.length > 0; i++) {
        s = stepGame(s, NO_INPUT, 0.02)
      }
      expect(s.enemyShots).toHaveLength(0)
      expect(s.lives).toBe(STARTING_LIVES - 1) // it landed: one shield gone
    }
  })

  it('is frame-rate independent — 30/60/144 Hz stepping yields the same trajectory', () => {
    // dt-split determinism (spec §D). The decay must be pow(7/8, dt × TICK_HZ),
    // NOT a per-STEP constant: stepping the SAME elapsed time at three rates must
    // land the shot in the same place. A naive per-frame ×7/8 would decay 24× as
    // hard at 144 Hz as at 30 Hz and blow this apart.
    const T = 1 / 6 // 5 ticks @30 Hz, 10 @60 Hz, 24 @144 Hz — all whole steps
    const run = (hz: number): Vec3 => {
      const dt = 1 / hz
      const steps = Math.round(T * hz)
      let s = soloShot(fireball(9000, 1500, 0))
      for (let i = 0; i < steps; i++) s = stepGame(s, NO_INPUT, dt)
      return s.enemyShots[0].pos
    }
    const a = run(30)
    const b = run(60)
    const c = run(144)
    for (let axis = 0; axis < 3; axis++) {
      expect(b[axis]).toBeCloseTo(a[axis], 2)
      expect(c[axis]).toBeCloseTo(a[axis], 2)
    }
  })
})
