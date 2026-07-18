// tests/core/tie-vm-flight.test.ts
//
// Task 3 of the TIE-VM-wiring plan (sw7, docs 4c93855): SEAT a choreography VM
// on each spawned TIE. This does not yet drive flight from the VM (Task 4) —
// only that `spawnTie` initialises `Enemy.vm` from the wave's spawn-plan entry.

import { describe, it, expect } from 'vitest'
import { spawnTieForTest } from './helpers/space'
import { choreoPc, waveSpawnPlan } from '../../src/core/tie-waves'

describe('spawnTie seats a choreography VM', () => {
  it('initialises vm.pc from the plan entry choreography ref', () => {
    const wave = 1, slot = 0
    const e = spawnTieForTest({ wave, slot })
    const expectedPc = choreoPc(waveSpawnPlan(wave)[slot].choreography)
    expect(e.vm?.pc).toBe(expectedPc)
  })
})
