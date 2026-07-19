// tests/core/helpers/space.ts
//
// Shared space-phase test fixtures (Task 1 of the TIE-VM-wiring plan, sw7,
// docs 4c93855). Extracted from the enemy/state fixture patterns already
// repeated across tests/core/*.test.ts — tie-orientation.test.ts's `waveWith`,
// tie-flight.test.ts's `tieAt`/`toCockpit` — so this task's tests (and the
// later tasks in this plan) share one factory instead of re-deriving
// `GameState`/`Enemy` boilerplate per file. Keep this minimal; extend it here
// rather than growing a second copy elsewhere.
//
// Pure test support: no DOM, no wall clock. Randomness only via the seeded
// `Rng` these factories hand back (`rngSeed`) — the same discipline the
// src/core it exercises is held to.

import { createRng, type Rng } from '@arcade/shared/rng'
import { lookRotation, normalize, scale, sub, dot, length, IDENTITY, type Vec3, type Mat4 } from '@arcade/shared/math3d'
import { initialState, TIE_SPAWN_DISTANCE, TICK_HZ, type GameState, type Enemy } from '../../../src/core/state'
import { spawnTie, applyManeuver, stepGame } from '../../../src/core/sim'
import { Twist, Move, type ChoreoVm } from '../../../src/core/tie-vm'
import { NO_INPUT } from '../../../src/core/input'

const COCKPIT: Vec3 = [0, 0, 0]

/** An all-neutral `Input`: no aim, no trigger, no start — the frame-accumulator
 *  suite (and any later test that just wants time to pass) drives `stepGame`
 *  with this so nothing else in the step is exercised. Re-exported from
 *  `src/core/input.ts` rather than duplicated (Task 2 review note). */
export { NO_INPUT }

/** Unit direction from a world point back to the cockpit (the origin). */
function toCockpit(pos: Vec3): Vec3 {
  return normalize(sub(COCKPIT, pos))
}

/** A fresh space-phase GameState — `initialState` already starts there. */
export function makeSpaceState(seed = 1983): GameState {
  return initialState(seed)
}

/** A complete TIE fixture with sane defaults, overridden per test. */
export function makeTie(overrides: Partial<Enemy> = {}): Enemy {
  return {
    pos: [0, 0, -TIE_SPAWN_DISTANCE],
    kind: 'tie',
    orient: IDENTITY,
    ...overrides,
  }
}

/** Orientation whose nose (model +Z, the codebase's forward convention) faces
 *  the cockpit from `pos` — the fighter has the player dead ahead. */
export function lookAtOrigin(pos: Vec3): Mat4 {
  return lookRotation(toCockpit(pos))
}

/** Orientation whose nose faces directly AWAY from the cockpit — the fighter
 *  is aimed off, so the player is outside its fire-cone regardless of range. */
export function lookAway(pos: Vec3): Mat4 {
  return lookRotation(scale(toCockpit(pos), -1))
}

/** A freshly seeded Rng — a one-word name for `createRng(seed)` at call sites
 *  that only care about determinism, not the RNG's own mechanics. */
export function rngSeed(seed: number): Rng {
  return createRng(seed)
}

/** Thin wrapper over the real `spawnTie` (sim.ts) — exercises the actual spawn
 *  path (VM seating, shape/kind, lateral slot) instead of reconstructing it here.
 *  `wave` is the spaceWave arg spawnTie reads the TSPWAV plan with; `slot` is the
 *  spawnIndex into that plan (Task 3, sw7 TIE-VM-wiring plan, docs 4c93855). */
export function spawnTieForTest(opts: { wave: number; slot: number; seed?: number }): Enemy {
  const rng = rngSeed(opts.seed ?? 1983)
  return spawnTie(rng, opts.slot, opts.wave)
}

// --- Task 4: VM-driven flight helpers ---------------------------------------
//
// The invariant these prove is the design §3 split: the VM chooses WHICH
// twist/move bits are active (a discrete decision), and `applyManeuver` integrates
// them as continuous §5.3 rates by `dt`. A maneuver held for N game frames must
// turn `N × per-frame delta` at ANY render dt — dt-independence.

/** Maneuver names → the `Twist` bit they drive, for `runScript`. */
const TWIST_BY_NAME: Record<string, number> = {
  ROLL_L: Twist.ROLL_L,
  ROLL_R: Twist.ROLL_R,
  YAW_L: Twist.YAW_L,
  YAW_R: Twist.YAW_R,
  PITCH_U: Twist.PITCH_U,
  PITCH_D: Twist.PITCH_D,
  AIM_PLAYER: Twist.AIM_PLAYER,
  AIM_AHEAD: Twist.AIM_AHEAD,
}

/** Integrate a single named twist maneuver held for `frames` GAME FRAMES, in
 *  render steps of `dt` seconds, straight through `applyManeuver` (the motion
 *  half of the split, isolated from the VM). Total integrated time is exactly
 *  `frames / TICK_HZ` regardless of `dt` (a final partial step consumes the
 *  remainder), so the accumulated rotation is dt-independent by construction. */
export function runScript(maneuver: string, frames: number, dt: number, start: Partial<Enemy> = {}): Enemy {
  const bit = TWIST_BY_NAME[maneuver]
  if (bit === undefined) throw new Error(`runScript: unknown maneuver ${maneuver}`)
  let e = makeTie({ orient: IDENTITY, ...start })
  let remaining = frames / TICK_HZ
  // `1e-12` swallows FP dust so the loop doesn't take a spurious sliver step.
  while (remaining > 1e-12) {
    const step = Math.min(dt, remaining)
    e = applyManeuver(e, bit, 0, step)
    remaining -= step
  }
  return e
}

/** The accumulated bank (roll about the nose), in radians, of a TIE that started
 *  from IDENTITY and only rolled: a pure Z-rotation, so the angle reads straight
 *  off the matrix as `atan2(m[4], m[0])`. Returned unsigned — the invariant is
 *  about MAGNITUDE (ROLL_L is negative, ROLL_R positive). */
export function accumulatedBank(e: Enemy): number {
  return Math.abs(Math.atan2(e.orient[4], e.orient[0]))
}

/** A space state carrying exactly one TIE at `offset` whose VM holds `maneuver`
 *  active for a long run (no `.CUNTIL` gate, high `waitFrames`), so a few
 *  `stepManyFrames` keep the same bits active while motion integrates. Spawner and
 *  fire clocks are parked so the lone TIE is the only thing that moves. */
export function tieRunning(maneuver: string, offset: Vec3, seed = 1983): GameState {
  const bit = TWIST_BY_NAME[maneuver]
  if (bit === undefined) throw new Error(`tieRunning: unknown maneuver ${maneuver}`)
  const vm: ChoreoVm = { pc: 0, savedPc: -1, waitFrames: 1000, twist: bit, move: 0, untilMask: 0 }
  const tie = makeTie({ pos: offset, orient: IDENTITY, vm })
  return {
    ...initialState(seed),
    enemies: [tie],
    spawnTimer: 1e9,
    enemyFireCooldown: 1e9,
  }
}

/** The angle (radians) between the (single) TIE's nose and the direction from it
 *  to the cockpit — its aiming error. Returns the state too so callers can chain
 *  a `stepManyFrames` off `before.state`. */
export function noseErrorToCockpit(state: GameState): { state: GameState; err: number } {
  const e = state.enemies[0]
  const nose: Vec3 = [e.orient[2], e.orient[6], e.orient[10]]
  const toCk = normalize(sub(COCKPIT, e.pos))
  const n = normalize(nose)
  const c = Math.max(-1, Math.min(1, dot(n, toCk) / (length(n) || 1)))
  return { state, err: Math.acos(c) }
}

/** Run `stepGame` for `n` whole game frames (dt = 1/TICK_HZ each — one decision
 *  tick + one motion step per call), with no input. */
export function stepManyFrames(state: GameState, n: number): GameState {
  let s = state
  for (let i = 0; i < n; i++) s = stepGame(s, NO_INPUT, 1 / TICK_HZ)
  return s
}

export { Twist, Move }
