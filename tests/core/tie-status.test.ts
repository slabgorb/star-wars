// tests/core/tie-status.test.ts
//
// Task 1 of the TIE-VM-wiring plan (sw7, docs 4c93855) — computeStatus, the
// PURE, UNWIRED status-word computer for the 6 gated bits of a TIE's A$CHST
// (WSCPU.MAC:16-38) that the choreography VM (tie-vm.ts) tests via .CIF/
// .CUNTIL. Nothing calls computeStatus yet — that wiring is a later task in
// this plan — so this suite is the only thing exercising it.

import { describe, it, expect } from 'vitest'
import { computeStatus, FIRE_CONE_COS, PLAYER_NEAR_RANGE } from '../../src/core/tie-status'
import { Status } from '../../src/core/tie-vm'
import { makeSpaceState, makeTie, lookAtOrigin, lookAway, rngSeed } from './helpers/space'

describe('computeStatus — the 6 gated bits', () => {
  it('FIRE_CONE_COS is a plausible narrow-cone cosine threshold (TODO(playtest) 12°)', () => {
    // cos(12°) ≈ 0.978 — close to 1 (a narrow cone), never a full hemisphere or wider.
    expect(FIRE_CONE_COS).toBeGreaterThan(0.9)
    expect(FIRE_CONE_COS).toBeLessThan(1)
  })

  it('sets C_AS when the cockpit (origin) is inside the TIE fire-cone', () => {
    // TIE on -Z looking at the origin: player dead ahead → in sights.
    const e = makeTie({ pos: [0, 0, -5000], orient: lookAtOrigin([0, 0, -5000]) })
    expect(computeStatus(e, makeSpaceState(), rngSeed(1)) & Status.C_AS).toBe(Status.C_AS)
  })

  it('clears C_AS when the player is outside the cone (TIE aimed away)', () => {
    const e = makeTie({ pos: [0, 0, -5000], orient: lookAway([0, 0, -5000]) })
    expect(computeStatus(e, makeSpaceState(), rngSeed(1)) & Status.C_AS).toBe(0)
  })

  it('sets C_PN only within PLAYER_NEAR_RANGE', () => {
    const near = makeTie({ pos: [0, 0, -(PLAYER_NEAR_RANGE - 1)] })
    const far = makeTie({ pos: [0, 0, -(PLAYER_NEAR_RANGE + 1)] })
    expect(computeStatus(near, makeSpaceState(), rngSeed(1)) & Status.C_PN).toBe(Status.C_PN)
    expect(computeStatus(far, makeSpaceState(), rngSeed(1)) & Status.C_PN).toBe(0)
  })

  it('derives C_R1/C_R2 deterministically from the seeded RNG', () => {
    const e = makeTie({ pos: [0, 0, -9000] })
    const a = computeStatus(e, makeSpaceState(), rngSeed(42)) & (Status.C_R1 | Status.C_R2)
    const b = computeStatus(e, makeSpaceState(), rngSeed(42)) & (Status.C_R1 | Status.C_R2)
    expect(a).toBe(b) // same seed → same random bits
  })
})
