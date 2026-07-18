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
import { lookRotation, normalize, scale, sub, IDENTITY, type Vec3, type Mat4 } from '@arcade/shared/math3d'
import { initialState, TIE_SPAWN_DISTANCE, type GameState, type Enemy } from '../../../src/core/state'

const COCKPIT: Vec3 = [0, 0, 0]

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
    vel: [0, 0, 0],
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
