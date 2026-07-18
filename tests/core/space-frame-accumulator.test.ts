// tests/core/space-frame-accumulator.test.ts
//
// Task 2 of the TIE-VM-wiring plan (sw7, docs 4c93855): the space-phase
// frame accumulator. Pure scaffolding — a discrete-tick timebase (TICK_HZ)
// riding alongside the continuous-time sim — that later tasks hang the TIE
// choreography VM and fire cadence on. This task wires no decision logic;
// it only proves the counters themselves are dt-independent.

import { describe, it, expect } from 'vitest'
import { stepGame, MAX_CATCHUP_FRAMES } from '../../src/core/sim'
import { TICK_HZ } from '../../src/core/state'
import { makeSpaceState, NO_INPUT } from './helpers/space'

const runFor = (seconds: number, dt: number) => {
  let s = makeSpaceState()
  for (let acc = 0; acc + 1e-9 < seconds; acc += dt) s = stepGame(s, NO_INPUT, dt)
  return s
}

describe('space frame accumulator', () => {
  it('advances state.frame at TICK_HZ, independent of dt chunking', () => {
    const coarse = runFor(1.0, 1 / 15)
    const fine = runFor(1.0, 1 / 120)
    // ~TICK_HZ frames in one second, and the SAME count regardless of render fps
    expect(coarse.frame).toBe(fine.frame)
    expect(Math.abs(coarse.frame - Math.round(TICK_HZ))).toBeLessThanOrEqual(1)
  })

  it('carries the remainder (no frames dropped or doubled across calls)', () => {
    // sw7 task-4 re-baseline: the "oneBig" leg was a SINGLE dt = 0.5 s step, which
    // now trips the catch-up clamp (0.5 s ≈ 10 game-frames > MAX_CATCHUP_FRAMES),
    // deliberately dropping the excess — that divergence is the clamp working, and
    // it gets its own test below. Here we still prove remainder-carrying, but with
    // a coarse dt kept UNDER the clamp threshold (0.05 s ≈ 1 frame < the 4-frame
    // cap), so no step drops frames and the two chunkings must agree exactly.
    const coarse = runFor(0.5, 0.05)
    const fine = runFor(0.5, 1 / 240)
    expect(coarse.frame).toBe(fine.frame)
  })

  it('clamps a single huge dt to MAX_CATCHUP_FRAMES (a tab-away cannot burst frames)', () => {
    // A 10 s stall would otherwise advance ~205 game-frames of VM + fire work in one
    // step. The catch-up clamp runs at most MAX_CATCHUP_FRAMES decision ticks and
    // drops the rest, so `frame` advances by exactly the cap — no burst.
    let s = makeSpaceState()
    const before = s.frame
    s = stepGame(s, NO_INPUT, 10)
    expect(s.frame - before).toBe(MAX_CATCHUP_FRAMES)
    // And the dropped remainder is clamped below one tick period, not banked for
    // the next step to replay.
    expect(s.frameAcc).toBeLessThan(1 / TICK_HZ)
    expect(s.frameAcc).toBeGreaterThanOrEqual(0)
  })
})
