// src/core/sim.ts
//
// The pure step. Deterministic: identical (state, input, dt) yields identical
// state. Time only ever enters here as `dt`; randomness only ever comes from
// `state.rng`. This boundary is what makes the game unit-testable and
// frame-rate independent — the same rule that anchors tempest.
//
// Wave 0 stub: tracks aim and advances the attract-spin clock. Real logic
// (TIE waves and fireballs → surface towers → trench run) lands wave by wave,
// test-first.

import type { GameState } from './state'
import type { Input } from './input'

export function stepGame(state: GameState, input: Input, dt: number): GameState {
  return {
    ...state,
    aimX: input.aimX,
    aimY: input.aimY,
    t: state.t + dt,
  }
}
