// tests/core/tie-vm-flight.test.ts
//
// Task 3 of the TIE-VM-wiring plan (sw7, docs 4c93855): SEAT a choreography VM
// on each spawned TIE. This does not yet drive flight from the VM (Task 4) —
// only that `spawnTie` initialises `Enemy.vm` from the wave's spawn-plan entry.
//
// Task 4 (this plan): DRIVE flight from the VM. The decision tick advances the VM
// (which twist/move bits are active); `applyManeuver` integrates those bits as the
// §5.3 continuous rates. The invariant: a maneuver held for N game frames turns
// exactly N × per-frame delta at ANY render dt (design §3 dt-independence).

import { describe, it, expect } from 'vitest'
import {
  spawnTieForTest,
  runScript,
  accumulatedBank,
  tieRunning,
  noseErrorToCockpit,
  stepManyFrames,
} from './helpers/space'
import { choreoPc, waveSpawnPlan } from '../../src/core/tie-waves'
import { TIE_ROLL_RATE, TICK_HZ } from '../../src/core/state'

describe('spawnTie seats a choreography VM', () => {
  it('initialises vm.pc from the plan entry choreography ref', () => {
    const wave = 1, slot = 0
    const e = spawnTieForTest({ wave, slot })
    const expectedPc = choreoPc(waveSpawnPlan(wave)[slot].choreography)
    expect(e.vm?.pc).toBe(expectedPc)
  })
})

describe('VM-driven TIE flight', () => {
  it('total roll over a fixed-frame ROLL_L maneuver = frames × per-frame rate, at any dt', () => {
    // Drive a TIE whose current script segment is a known ROLL_L for 8 frames.
    // Integrate at two dt values; the accumulated bank angle must match to within
    // FP tolerance (roll about a fixed nose axis composes additively → exact).
    const bankCoarse = accumulatedBank(runScript('ROLL_L', 8, 1 / 15))
    const bankFine = accumulatedBank(runScript('ROLL_L', 8, 1 / 120))
    expect(Math.abs(bankCoarse - bankFine)).toBeLessThan(1e-3)
    // TIE_ROLL_RATE / TICK_HZ is the per-frame delta (deg2rad(20.3)); 8 frames of it.
    expect(Math.abs(bankCoarse - 8 * (TIE_ROLL_RATE / TICK_HZ))).toBeLessThan(1e-2)
  })

  it('AIM_PLAYER steers the nose toward the cockpit (homing), not a fixed rate', () => {
    const before = noseErrorToCockpit(tieRunning('AIM_PLAYER', [3000, 0, -8000]))
    const after = noseErrorToCockpit(stepManyFrames(before.state, 5))
    expect(after.err).toBeLessThan(before.err) // error shrinks toward zero
  })
})
