// tests/core/space-frame-accumulator.test.ts
//
// Task 2 of the TIE-VM-wiring plan (sw7, docs 4c93855): the space-phase
// frame accumulator. Pure scaffolding — a discrete-tick timebase (TICK_HZ)
// riding alongside the continuous-time sim — that later tasks hang the TIE
// choreography VM and fire cadence on. This task wires no decision logic;
// it only proves the counters themselves are dt-independent.

import { describe, it, expect } from 'vitest'
import { stepGame } from '../../src/core/sim'
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
    const oneBig = runFor(0.5, 0.5)
    const manySmall = runFor(0.5, 1 / 240)
    expect(oneBig.frame).toBe(manySmall.frame)
  })
})
