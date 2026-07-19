// tests/core/tie-flight.test.ts
//
// ⚠ SUPERSEDED IN PART (sw7 VM-flight wiring): the story-9-2 SOFT-FLIGHT MODEL
// (curved-approach swoop + banking during the approach) was RETIRED when the TIE
// choreography VM took over flight. Its curve/bow/bank assertions asserted invented
// behavior and were removed; the authentic VM-driven flight is covered by
// tests/core/tie-vm-flight.test.ts (and tie-vm.test.ts for the VM itself). Design:
// docs/superpowers/specs/2026-07-18-star-wars-tie-vm-fire-wiring-design.md. What
// remains in this file is the coverage that STILL holds under VM flight —
// determinism/purity (AC2), the unchanged collision/scoring contracts (AC4), and
// the orientation facts that survive (nose leads travel; pure rotation).
//
// Story 9-2 — port the RE'd TIE flight model into the core (swoop / weave / bank
// approach), RED phase.
//
// Source of truth: docs/tie-flight-ai-model.md (the model recovered in 9-1 from
// the 1983 cabinet ROM). The cabinet's TIE does NOT fly dead-straight at the
// cockpit: it carries its own orientation matrix, thrusts along its facing, and
// banks (rolls) + steers (yaw/pitch) to chase the player — tracing a curved,
// weaving pursuit arc (model §5). Today src/core/sim.ts does `pos += vel` dead
// straight at the origin and sets `orient` to a roll-free look-at at the cockpit
// (story 8-13). This suite defines the new contract and is EXPECTED TO FAIL until
// the GREEN phase implements it.
//
// SCOPE / RECONCILIATION (TEA design decisions — logged as session deviations):
//   * 9-2 ports the CURVED-DIRECTION homing + banking. It KEEPS each TIE's
//     approach SPEED (|vel|) constant as the direction turns. The model's full
//     accelerate-from-rest kinematics (§4 zero initial velocity, §5.3 per-frame
//     thrust) are a later-story concern: a zero-speed spawn would void the 8-6
//     difficulty observable (framing.test.ts pins spawn |vel| ≈ ENEMY_SPEED and
//     the wave-2 speed ramp) and isn't required by 9-2's ACs. Holding |vel| while
//     curving the heading satisfies AC1+AC3 AND every existing Wave-1 contract.
//   * Because motion is driven by the TIE's OWN speed, a stationary (|vel| = 0)
//     TIE stays put — preserving combat-kill-loop.test.ts (8-16), which uses
//     vel-0 TIEs as fixed targets.
//   * AC3 supersedes 8-13's STATIC cockpit look-at. The cockpit-facing assertions
//     in tie-orientation.test.ts are removed there; this file owns the new
//     orientation contract (banks along the path, not a frozen look-at).
//
// Everything here obeys the sacred boundary: no DOM, no time except `dt`, no
// randomness except the seeded RNG carried in state. TIEs are produced by the
// real seeded sim (not hand fixtures) so every enemy is fully formed.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  SPAWN_INTERVAL,
  TIE_THRUST_RATE,
  TIE_SCORE,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import { fireAt } from '../support/aim'
import {
  normalize,
  sub,
  length,
  dot,
  IDENTITY,
  type Vec3,
  type Mat4,
} from '@arcade/shared/math3d'

/** Model-space forward — the TIE's nose (the codebase "looking down -Z"
 *  convention adopted by story 8-13: a TIE's nose points back at the cockpit). */
const FORWARD: Vec3 = [0, 0, 1]

/** Apply only the rotation (linear) part of a row-major Mat4 to a direction. */
const applyDir = (m: Mat4, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[4] * v[0] + m[5] * v[1] + m[6] * v[2],
  m[8] * v[0] + m[9] * v[1] + m[10] * v[2],
]

/** Unsigned angle (radians) between two directions. */
const angleBetween = (a: Vec3, b: Vec3): number => {
  const na = normalize(a)
  const nb = normalize(b)
  const c = Math.max(-1, Math.min(1, dot(na, nb)))
  return Math.acos(c)
}

/** True when the upper-3x3 is an orthonormal, det≈+1 rotation with no
 *  translation — a pure rotation that neither scales, shears, nor moves. */
const isPureRotation = (m: Mat4): boolean => {
  const row = (r: number): Vec3 => [m[r * 4], m[r * 4 + 1], m[r * 4 + 2]]
  const r0 = row(0)
  const r1 = row(1)
  const r2 = row(2)
  const unit = (v: Vec3) => Math.abs(length(v) - 1) < 1e-6
  const ortho = (a: Vec3, b: Vec3) => Math.abs(dot(a, b)) < 1e-6
  const det =
    r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
    r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
    r0[2] * (r1[0] * r2[1] - r1[1] * r2[0])
  const noTranslation =
    Math.abs(m[3]) < 1e-6 && Math.abs(m[7]) < 1e-6 && Math.abs(m[11]) < 1e-6
  return (
    unit(r0) && unit(r1) && unit(r2) &&
    ortho(r0, r1) && ortho(r0, r2) && ortho(r1, r2) &&
    Math.abs(det - 1) < 1e-6 &&
    noTranslation
  )
}

interface Sample {
  pos: Vec3
  orient: Mat4
}

/**
 * Step a seeded space wave and follow the FIRST TIE, sampling its kinematics each
 * frame until it despawns or `steps` elapse. Real spawns (not hand fixtures) so
 * every enemy is fully formed by the sim. A large position jump (the original was
 * removed and a later TIE took index 0) ends the track so samples stay one TIE.
 */
function followFirstTie(seed: number, steps: number, dt = 0.05): Sample[] {
  let s: GameState = initialState(seed)
  for (let i = 0; i < 40 && s.enemies.length === 0; i++) {
    s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 4)
  }
  const samples: Sample[] = []
  let last: Vec3 | null = null
  // A genuine index-0 TIE SWAP is a discontinuity far larger than one frame of
  // legitimate flight. Under VM-driven flight one frame thrusts ~TIE_THRUST_RATE·dt,
  // so the swap threshold must clear a few normal steps or it false-trips on ordinary
  // fast motion and cuts the track to a single sample.
  const swapJump = TIE_THRUST_RATE * dt * 3
  for (let i = 0; i < steps && s.enemies.length > 0; i++) {
    const e = s.enemies[0]
    if (last && length(sub(e.pos, last)) > swapJump) break // index-0 changed TIEs
    samples.push({ pos: e.pos, orient: e.orient })
    last = e.pos
    s = stepGame(s, NO_INPUT, dt)
  }
  return samples
}

// RETIRED (sw7 VM-flight wiring): the 9-2 "curved/weaving swoop" describe (bearing
// turns, cross-track bow) and two of the "orientation banks" assertions (NOT a
// static look-at; rolls into its turns) asserted the invented soft-flight model.
// Under VM flight the authentic opening maneuver is a STRAIGHT forward `.CT …,0,MF`
// thrust — no curve, no roll during the approach — so those four no longer describe
// real behavior and were removed. See the top-of-file supersession note. What
// survives below still holds under VM flight and is kept: the nose leads travel
// (thrust is along the oriented facing) and the orientation stays a pure rotation.
describe('Story 9-2 → VM flight — orientation is well-formed and leads travel', () => {
  it('points its nose along the direction of travel (thrusts along its facing)', () => {
    const samples = followFirstTie(1983, 40)
    let checked = 0
    for (let i = 1; i < samples.length; i++) {
      const motion = sub(samples[i].pos, samples[i - 1].pos)
      if (length(motion) < 1e-6) continue
      const nose = applyDir(samples[i].orient, FORWARD)
      // The nose leads where the ship actually moves, within a turn-rate margin.
      expect(angleBetween(nose, motion)).toBeLessThan(0.35) // ~20 degrees
      checked++
    }
    expect(checked).toBeGreaterThan(5)
  })

  it('keeps a well-formed pure rotation (no scale/shear/translation) as it banks', () => {
    const samples = followFirstTie(1983, 40)
    expect(samples.length).toBeGreaterThan(0)
    for (const s of samples) expect(isPureRotation(s.orient)).toBe(true)
  })
})

describe('Story 9-2 — the flight model is deterministic and pure (AC2)', () => {
  it('identical seed and inputs produce identical TIE trajectories', () => {
    const a = followFirstTie(2024, 40)
    const b = followFirstTie(2024, 40)
    expect(a.length).toBeGreaterThan(10)
    expect(a.map((s) => s.pos)).toEqual(b.map((s) => s.pos))
    expect(a.map((s) => s.orient)).toEqual(b.map((s) => s.orient))
  })

  it('a full run replays identically from the same seed (no hidden time/randomness)', () => {
    const script: Input[] = [NO_INPUT, { aimX: 0.3, aimY: -0.2, fire: true }, NO_INPUT]
    let a = initialState(7)
    let b = initialState(7)
    for (let i = 0; i < 60; i++) {
      const inp = script[i % script.length]
      a = stepGame(a, inp, 0.03)
      b = stepGame(b, inp, 0.03)
    }
    expect(a).toEqual(b)
  })

  it('stepping does not mutate the input enemies in place (purity)', () => {
    let s = initialState(11)
    for (let i = 0; i < 20 && s.enemies.length === 0; i++) {
      s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 4)
    }
    expect(s.enemies.length).toBeGreaterThan(0)
    const before = s.enemies
    const beforePos = before.map((e) => e.pos)
    stepGame(s, NO_INPUT, 0.05)
    expect(s.enemies).toBe(before) // same array reference, untouched
    expect(s.enemies.map((e) => e.pos)).toEqual(beforePos) // positions unchanged
  })
})

describe('Story 9-2 — existing collision & motion contracts are unaffected (AC4)', () => {
  // Fully-typed minimal fixtures (the combat-kill-loop.test.ts `tieStill` idiom):
  // collision reads only .pos, but a complete Enemy keeps the suite type-clean.
  const tieAt = (pos: Vec3): Enemy => ({ pos, kind: 'tie', orient: IDENTITY })
  /** Dead ahead, outside COCKPIT_HIT_RADIUS — the beam's target, and the old bolt's spot. */
  const AT: Vec3 = [0, 0, -100]

  it('the laser still destroys a TIE and scores under the flight model', () => {
    // sw7-17: this used to hand-place a bolt on the TIE and step with the trigger up. The gun is
    // HITSCAN now — it spawns nothing, so that fixture is unbuildable in play. The honest
    // equivalent is the sentence the bolt was standing in for: AIM AT THE TIE AND PULL. `fireAt`
    // goes through the real eye and the real aim, so this still asserts exactly what AC4 asks —
    // that story 9-2's flight model did not break the kill loop.
    const base = initialState(1983)
    const s0: GameState = { ...base, enemies: [tieAt(AT)], spawnTimer: 999 }
    const s = stepGame(s0, fireAt(s0, AT), 0.001)
    expect(s.enemies).toHaveLength(0)
    expect(s.score).toBe(base.score + TIE_SCORE)
  })

  it('a TIE reaching the cockpit still costs a shield and is removed', () => {
    const base = initialState(1983)
    const s = stepGame({ ...base, enemies: [tieAt([0, 0, 0])] }, NO_INPUT, 0.001)
    expect(s.lives).toBe(base.lives - 1)
    expect(s.enemies).toHaveLength(0)
  })

  it('a stationary TIE (zero approach speed) is not spuriously set in motion', () => {
    // combat-kill-loop.test.ts (8-16) uses vel-0 TIEs as fixed targets, so the
    // flight model must drive motion from the TIE's OWN speed (|vel|): |vel| = 0
    // stays put. Guards the `x || default` vs `x ?? default` trap — 0 is falsy
    // but a valid speed (lang-review TS check #4, null/undefined handling).
    const base = initialState(1983)
    const still = tieAt([0, 660, -1200])
    const s = stepGame({ ...base, enemies: [still], spawnTimer: 999 }, NO_INPUT, 0.05)
    expect(s.enemies[0].pos[0]).toBeCloseTo(0, 6)
    expect(s.enemies[0].pos[1]).toBeCloseTo(660, 6)
    expect(s.enemies[0].pos[2]).toBeCloseTo(-1200, 6)
  })
})
