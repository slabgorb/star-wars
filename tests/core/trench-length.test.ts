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

  it('length is a real chain budget — one balanced value across the fixed pies, not the compressed 2400', () => {
    // ROM FACT discovered building buildTrench (sw7-6 GREEN): Atari authored EVERY
    // pie to the SAME channel budget. buildTrench(0..10) each sum to 0x50000 (327,680)
    // of $800/$1000 wedges before the PORT (then the port's own $1000 and the END),
    // even though the pies have different wedge counts (114 vs 131) — the short and
    // long wedges are balanced per pie, and the random pool groups are length-equal
    // too. So the trench length does NOT vary by wave; it is a fixed, data-driven
    // budget, orders of magnitude past the fabricated 2400.
    //
    // The original RED here asserted the length VARIES by wave. That was an inference,
    // and the ROM refutes it: finding B-009 explicitly declines to pin the figure and
    // rests on the STRUCTURE — "a variable data-driven wedge chain with a dynamic
    // BS.PLC port + BS.ELC end wall vs a lone fixed 2400 port … stands independent of
    // the exact length figure" (pair-trench.json B-009 refutation_corrections). A
    // data-driven port that lands on one balanced budget is still exactly that
    // structure; making it vary would mean fabricating numbers the cabinet doesn't have.
    const lengths = Array.from({ length: 11 }, (_, w) => trenchLength(w))
    expect(new Set(lengths).size).toBe(1) // one balanced budget across every fixed pie
    expect(lengths[0]).toBeGreaterThan(0x8000) // …and it is the real chain, not the 2400 stub
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
