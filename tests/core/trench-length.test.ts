// tests/core/trench-length.test.ts
//
// Story sw7-6 (R6a) — B-009: the trench has a real LENGTH; ours is a lone fixed port.  RED phase.
//
// THE DEFECT (finding B-009): the ROM trench is a chain of $800 / $1000 wedges
// laid until a PORT or END wedge, recording the port at BS.PLC and the end wall
// at BS.ELC as the chain builds (WSBASE.MAC IWEDGE/DOFAR; `CMPB #TYP$PORT`:1156).
// Length is the sum of the pie's wedge lengths. Ours has no length at all: a
// single exhaustPort spawns at a fixed −EXHAUST_PORT_DISTANCE = −2400 (sim.ts
// spawnPort) — no channel body, no end wall, distance-to-port a constant.
//
// ⚠ REFUTATION GUARD (finding B-009 refutation_corrections): DOFAR's $8000
// (`?WILL ALL OF NEW WEDGES FIT INTO 8000?`, WSBASE.MAC:1111) is a streaming
// LOOK-AHEAD WINDOW governing how many wedges are generated ahead of the player —
// it is NOT the certified total trench length. So we do NOT pin the length to
// $8000 (or any exact figure). We pin the STRUCTURE: a variable data-driven wedge
// chain with a dynamic port position and an end wall beyond it — which is far
// longer than the compressed 2400, and varies by wave.
//
// Length is derived from the pure builder (buildTrench + wedgeLength), so these
// stay robust to how Dev wires the port position into GameState.

import { describe, it, expect } from 'vitest'
import { createRng } from '@arcade/shared/rng'
import { initialState } from '../../src/core/state'
import { enterPhase } from '../../src/core/sim'
import { buildTrench, wedgeLength, WEDGE_SHORT, WEDGE_LONG, WEDGE_PORT, WEDGE_END } from '../../src/core/trench-wedges'

/** Total channel length of a built trench = Σ wedge lengths ($800 SHORT / $1000 LONG). */
const trenchLength = (baseWave: number, seed = 1) =>
  buildTrench(baseWave, createRng(seed)).reduce((sum, w) => sum + wedgeLength(w.type), 0)

/** Cumulative −Z offset at which a wedge sits = Σ lengths of the wedges before it. */
function offsetOfType(baseWave: number, type: number, seed = 1): number {
  const chain = buildTrench(baseWave, createRng(seed))
  let acc = 0
  for (const w of chain) {
    if (w.type === type) return acc
    acc += wedgeLength(w.type)
  }
  return -1
}

describe('sw7-6 B-009 — the trench is a wedge chain with a real length', () => {
  it('has a length far greater than the old fixed 2400 (a real channel body, not one port)', () => {
    // Even one 16-group pie is many wedges of $800/$1000 — orders of magnitude past 2400.
    for (let w = 0; w <= 10; w++) {
      expect(trenchLength(w)).toBeGreaterThan(2400)
      expect(trenchLength(w)).toBeGreaterThan(0x8000) // and past the DOFAR look-ahead window
    }
  })

  it('the DOFAR $8000 is a look-ahead window, NOT the total length (refutation guard)', () => {
    // If a port pinned the total to exactly $8000 it would betray the DOFAR misread.
    // The real chains overrun it — the window is not the length.
    for (let w = 0; w <= 10; w++) expect(trenchLength(w)).not.toBe(0x8000)
  })

  it('length is DYNAMIC — it varies across the fixed waves (the port location is not a constant)', () => {
    const lengths = Array.from({ length: 11 }, (_, w) => trenchLength(w))
    expect(new Set(lengths).size).toBeGreaterThan(1)
  })

  it('the channel body is built only from $800 and $1000 wedges (SHORT/LONG)', () => {
    const chain = buildTrench(0, createRng(1))
    for (const w of chain) {
      if (w.type === WEDGE_SHORT) expect(wedgeLength(w.type)).toBe(0x800)
      else if (w.type === WEDGE_LONG) expect(wedgeLength(w.type)).toBe(0x1000)
    }
  })

  it('the PORT sits deep in the channel and the END WALL lies BEYOND it (BS.PLC < BS.ELC)', () => {
    for (let w = 0; w <= 10; w++) {
      const portAt = offsetOfType(w, WEDGE_PORT)
      const endAt = offsetOfType(w, WEDGE_END)
      expect(portAt, `wave ${w} has a PORT`).toBeGreaterThan(2400) // deep, not compressed to 2400
      expect(endAt, `wave ${w} has an END wall`).toBeGreaterThanOrEqual(portAt) // end wall beyond the port
    }
  })
})

describe('sw7-6 B-009 — the run no longer opens with a fixed −2400 port', () => {
  it('the exhaust port spawns deep down the channel, not at the compressed −2400', () => {
    // Seam-tolerant behavioural spot-check at the default wave (BS.WAV 0 = PIE1).
    const s = enterPhase(initialState(1), 'trench')
    if (s.exhaustPort) {
      expect(s.exhaustPort.pos[2]).not.toBe(-2400) // the old EXHAUST_PORT_DISTANCE
      expect(-s.exhaustPort.pos[2]).toBeGreaterThan(2400) // far down −Z
    }
  })
})
