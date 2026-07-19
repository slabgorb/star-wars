// tests/core/tie-fire-cadence.test.ts
//
// Task 5 of the TIE-VM-wiring plan (sw7, docs 4c93855): the AUTHENTIC fire cadence.
//
// The cabinet has NO per-TIE reload timer — fire is governed entirely by a global
// frame-mask + PRNG threshold + slot cap (docs/tie-flight-ai-model.md §6;
// WSCPU.MAC:646-651 + the `TGPROB` table :736). This suite pins the §6 gate that
// replaces the invented per-TIE `fireCooldown` (story 9-4): on a decision tick a
// TIE fires iff it has the player in its sights (C_AS), is not aiming ahead, is not
// too close ($800), is not being hit, the cadence window is open `(frame & mask)==0`,
// the PRNG roll clears the threshold `rng() > threshold`, and a fireball slot is free.
//
// It fails until the GREEN phase wires that gate into `stepSpace`'s decision tick;
// today fire still runs on the retired cooldown, so it fires on the WRONG frames.
//
// The sacred boundary holds: no DOM, no time except `dt`, no randomness except the
// seeded RNG carried in state.

import { describe, it, expect } from 'vitest'
import { stepGame } from '../../src/core/sim'
import { waveParams } from '../../src/core/gameRules'
import { initialState, TICK_HZ, FIRE_MASK, type GameState, type Enemy } from '../../src/core/state'
import { NO_INPUT } from '../../src/core/input'
import { lookRotation, normalize, sub, type Vec3, type Mat4 } from '@arcade/shared/math3d'

const COCKPIT: Vec3 = [0, 0, 0]
/** One whole game frame of dt — exactly one decision tick per `stepGame`, so
 *  `state.frame` after a step is the frame the §6 gate just evaluated. */
const TICK_DT = 1 / TICK_HZ

/** Orientation whose nose (model +Z) points from `pos` straight back at the cockpit
 *  — the player dead in the TIE's sights, so `computeStatus` sets C_AS. */
function lookAtOrigin(pos: Vec3): Mat4 {
  return lookRotation(normalize(sub(COCKPIT, pos)))
}

/** A TIE held DEAD IN-SIGHTS: facing the cockpit, at a fixed range past the §6
 *  "not too close" floor ($800 = 2048), with NO VM — so `applyManeuver` never moves
 *  it and it stays in-sights every tick. That leaves the frame-mask + PRNG gate as
 *  the ONLY thing deciding whether it fires (twist 0 ⇒ the AIM_AHEAD lockout passes). */
function inSightsTie(pos: Vec3): Enemy {
  return { pos, vel: [0, 0, 0], kind: 'tie', orient: lookAtOrigin(pos) }
}

/** A playing state with a single dead-in-sights TIE. `wave` selects the TGPROB row;
 *  `maskOverride` instead selects the wave whose `FIRE_MASK` equals it — the seam the
 *  MUTATION test perturbs the cadence mask through (its threshold/slot columns ride
 *  along, as they must: they are one table row). Spawner parked and lives banked high
 *  so homing fireballs draining shields never end the run mid-measurement. */
function oneInSightsTie(opts: { wave?: number; seed?: number; maskOverride?: number } = {}): GameState {
  const wave = opts.maskOverride !== undefined ? FIRE_MASK.indexOf(opts.maskOverride) + 1 : opts.wave ?? 1
  return {
    ...initialState(opts.seed ?? 1983),
    wave,
    enemies: [inSightsTie([0, 0, -4000])],
    spawnTimer: 1e9,
    lives: 999,
  }
}

/** Several dead-in-sights TIEs at distinct offsets, all past the fire floor. */
function manyInSightsTies(opts: { wave?: number; seed?: number } = {}): GameState {
  return {
    ...initialState(opts.seed ?? 1983),
    wave: opts.wave ?? 1,
    enemies: [inSightsTie([0, 0, -4000]), inSightsTie([600, 0, -3600]), inSightsTie([-600, 0, -3700])],
    spawnTimer: 1e9,
    lives: 999,
  }
}

/** Step `n` whole game frames and return the `state.frame` values on which an
 *  `enemy-fire` event fired — the fire-frame set. */
function collectFireFrames(state: GameState, n: number): number[] {
  const frames: number[] = []
  let s = state
  for (let i = 0; i < n; i++) {
    s = stepGame(s, NO_INPUT, TICK_DT)
    if (s.events.some((e) => e.type === 'enemy-fire')) frames.push(s.frame)
  }
  return frames
}

/** Over `n` game frames, the fraction of PRNG-ELIGIBLE windows that fired: an open
 *  cadence window (`frame & mask === 0`) reached with a FREE fireball slot, so the
 *  PRNG roll is the only remaining gate. Excluding slot-blocked windows isolates
 *  P(fire | window) from the concurrency cap (at wave 1 the single slot would
 *  otherwise depress the raw per-window rate below the true probability). */
function windowFireRate(state: GameState, n: number): number {
  const { fireMask: mask, maxConcurrentShots: cap } = waveParams(state.wave)
  let eligible = 0
  let fired = 0
  let s = state
  for (let i = 0; i < n; i++) {
    const slotFree = s.enemyShots.length < cap // slot state entering this tick
    s = stepGame(s, NO_INPUT, TICK_DT)
    if ((s.frame & mask) === 0 && slotFree) {
      eligible++
      if (s.events.some((e) => e.type === 'enemy-fire')) fired++
    }
  }
  return fired / eligible
}

/** The peak number of enemy fireballs simultaneously aloft across `n` game frames. */
function maxSimultaneousFireballs(state: GameState, n: number): number {
  let peak = 0
  let s = state
  for (let i = 0; i < n; i++) {
    s = stepGame(s, NO_INPUT, TICK_DT)
    peak = Math.max(peak, s.enemyShots.length)
  }
  return peak
}

describe('TIE fire cadence — §6 frame-mask + PRNG gate', () => {
  it('never fires on a frame where (frame & mask) != 0', () => {
    // Hold one TIE dead in-sights, wave 1 (mask 0x0F). Every fire lands on a frame
    // the cadence window is open — a multiple of 16 game frames.
    const fireFrames = collectFireFrames(oneInSightsTie({ wave: 1 }), 400)
    expect(fireFrames.length).toBeGreaterThan(0) // non-vacuous: it DID fire
    for (const f of fireFrames) expect(f & 0x0f).toBe(0)
  })

  it('fire probability tracks (255 - threshold)/256 over many windows (fixed seed)', () => {
    // wave 1 threshold 0x80 → ~50% of open windows fire.
    const rate = windowFireRate(oneInSightsTie({ wave: 1, seed: 7 }), 2000)
    expect(rate).toBeGreaterThan(0.35)
    expect(rate).toBeLessThan(0.65)
  })

  it('respects the concurrency cap (maxConcurrentShots)', () => {
    const cap = waveParams(1).maxConcurrentShots // 1 at wave 1
    expect(maxSimultaneousFireballs(manyInSightsTies({ wave: 1 }), 500)).toBeLessThanOrEqual(cap)
  })

  it('MUTATION: perturbing the mask changes fire timing', () => {
    // Guards vacuous tests — swapping mask 0x0F→0x03 must move the fire-frame set.
    //
    // NOTE (sw7 Task 5 review, Minor cleanup): the two arms also differ in
    // maxConcurrentShots (wave 1's TGPROB row is guns=1; the mask-0x03 row it maps
    // to via FIRE_MASK.indexOf is guns=6) — an *additional* channel through which a
    // mask-ignoring bug could still make the frame sets diverge and pass this test
    // for the wrong reason. It is NOT fixable by picking different wave arms: every
    // TGPROB row that shares a `maxConcurrentShots` value also shares its `mask`
    // *unless* its `fireThreshold` also changes (mask and guns climb together in
    // the ported 16-row table — see gameRules.ts FIRE_CONCURRENCY vs state.ts
    // FIRE_MASK/FIRE_THRESHOLD), so no pair of rows holds both cap AND threshold
    // constant while varying only mask. True isolation would need `waveParams` to
    // accept a cap/threshold override or a test-only mock of gameRules — out of
    // scope for this cleanup. The mask semantics ARE pinned directly and
    // unconfounded by 'never fires on a frame where (frame & mask) != 0' above
    // (every observed fire, across however many frames, satisfies the mask with no
    // comparison against a second arm), so this mutation test stays a non-vacuity
    // guard, not the sole guarantee.
    expect(collectFireFrames(oneInSightsTie({ wave: 1 }), 200)).not.toEqual(
      collectFireFrames(oneInSightsTie({ wave: 1, maskOverride: 0x03 }), 200),
    )
  })
})
