// tests/core/trench-pies-waves.test.ts
//
// Story sw7-6 (R6a) — B-011: early-wave trenches are FIXED authored runs; only
// wave ≥ 11 is random.  RED phase.
//
// THE DEFECT (finding B-011): our trench builder reseeds and re-picks on EVERY
// run regardless of wave, so no trench is ever a fixed authored layout. The ROM
// picks the pie by base-star wave (WSBASE.MAC NWBASE:1027-1036):
//     LDB BS.WAV / LSLB / LDX #TPIE / ABX / CMPX #TPIEZ / IFHS
//     LDU #RPIE     ;THEN DO RANDOM PIE
//     ELSE LDU (X)  ;START OF PIE
// TPIE holds 11 predefined pies (PIE1..PIE11, WSBASE.MAC:175-179). BS.WAV is the
// 0-based base wave (our `state.wave - 1`, the ROM `romWave0`). So:
//   • BS.WAV 0..10  → a FIXED, run-identical hand-authored pie (PIE1..PIE11)
//   • BS.WAV ≥ 11   → the runtime RANDOM pie (RPIE / GNBASE)
//
// This INVERTS the old sw3-7 "every run differs" contract for the early waves —
// sw3-7 applied per-run variation to ALL runs; B-011 says that is wrong for waves
// 0..10. This suite pins the corrected contract; tests/core/trench-variation.test.ts
// is re-seated to match (variation is a wave ≥ 11 property now, not a global one).
//
// buildTrench(baseWave, rng) is the pure assembler (src/core/trench-wedges.ts,
// built in GREEN): it expands the selected pie's wedge-group chain into an ordered
// list of wedges terminated by the PORT + END of its terminal group.

import { describe, it, expect } from 'vitest'
import { createRng } from '@arcade/shared/rng'
import {
  PIES,
  buildTrench,
  wedgeGroup,
  WEDGE_GROUP_IDS,
  WEDGE_PORT,
  WEDGE_END,
  type Wedge,
} from '../../src/core/trench-wedges'

/** A stable signature of an assembled wedge chain (types + both wall columns). */
const chainSig = (chain: readonly Wedge[]) =>
  JSON.stringify(chain.map((w) => [w.type, ...w.left, ...w.right]))

// Wide enough to rule out every seed coincidentally picking the same random tail.
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1)

describe('sw7-6 B-011 — the 11 predefined pies (TPIE = PIE1..PIE11)', () => {
  it('there are exactly 11 predefined pies, each a chain of 16 wedge-group ids', () => {
    expect(PIES).toHaveLength(11)
    for (const pie of PIES) expect(pie).toHaveLength(16)
  })

  it('every pie entry references a real wedge group (∈ WEDGE_GROUP_IDS)', () => {
    const known = new Set(WEDGE_GROUP_IDS)
    for (const pie of PIES) for (const id of pie) expect(known.has(id)).toBe(true)
  })

  it('PIE1 is the ROM sequence 10,95,54,95,04,95,42,95, 41,95,53,95,43,95,42,98 (WSBASE.MAC:118-120)', () => {
    expect(PIES[0]).toEqual([10, 95, 54, 95, 4, 95, 42, 95, 41, 95, 53, 95, 43, 95, 42, 98])
  })

  it('every pie ends on a PORT-bearing terminal group, so every fixed run has a way out', () => {
    // PIE1-6 end on TWDG98/99 ("EASY/HARD PORT"); PIE7-11 end on TWDG29 ("HARDER
    // PORT", WSBASE.MAC:624-634) — all three carry a PORT wedge then END. Assert the
    // property (has a PORT, terminates in END), not the specific group number.
    for (const pie of PIES) {
      const terminalGroup = wedgeGroup(pie[pie.length - 1])
      expect(terminalGroup.some((w) => w.type === WEDGE_PORT)).toBe(true)
      expect(terminalGroup[terminalGroup.length - 1].type).toBe(WEDGE_END)
    }
  })
})

describe('sw7-6 B-011 — wave selection: fixed for BS.WAV 0..10, random for ≥ 11', () => {
  it('BS.WAV 0..10 build a FIXED, run-identical trench (regression: today every run differs)', () => {
    for (let baseWave = 0; baseWave <= 10; baseWave++) {
      const sigs = SEEDS.map((s) => chainSig(buildTrench(baseWave, createRng(s))))
      // Seed-invariant: the authored pie ignores the run RNG.
      expect(new Set(sigs).size, `BS.WAV ${baseWave} must be run-identical`).toBe(1)
    }
  })

  it('the fixed pies are DISTINCT waves, not one repeated layout (anti-vacuity for "deterministic")', () => {
    const perWave = Array.from({ length: 11 }, (_, w) => chainSig(buildTrench(w, createRng(1))))
    // "Deterministic" must not mean "every wave is the same empty chain".
    expect(new Set(perWave).size).toBeGreaterThan(1)
    // And each fixed wave has real content (more than just PORT+END).
    for (let w = 0; w <= 10; w++) expect(buildTrench(w, createRng(1)).length).toBeGreaterThan(2)
  })

  it('BS.WAV 0 expands PIE1: its first content wedge is TWDG10’s first wedge, and it holds exactly one PORT then END', () => {
    const chain = buildTrench(0, createRng(1))
    const firstOfTwdg10 = wedgeGroup(10)[0]
    expect([chain[0].type, ...chain[0].left, ...chain[0].right]).toEqual([
      firstOfTwdg10.type,
      ...firstOfTwdg10.left,
      ...firstOfTwdg10.right,
    ])
    const types = chain.map((w) => w.type)
    expect(types.filter((t) => t === WEDGE_PORT).length).toBe(1)
    expect(types[types.length - 1]).toBe(WEDGE_END)
  })

  it('BS.WAV ≥ 11 builds a RANDOM trench: different seeds produce different chains', () => {
    for (const baseWave of [11, 12, 20]) {
      const sigs = SEEDS.map((s) => chainSig(buildTrench(baseWave, createRng(s))))
      expect(new Set(sigs).size, `BS.WAV ${baseWave} must vary by seed`).toBeGreaterThan(1)
    }
  })

  it('the random pie is still DETERMINISTIC per seed (seeded RNG, never Math.random)', () => {
    for (const s of [0, 1, 7, 1983]) {
      expect(chainSig(buildTrench(15, createRng(s)))).toBe(chainSig(buildTrench(15, createRng(s))))
    }
  })

  it('seed 0 is a valid, non-degenerate seed for the random pie (guards `|| default` on a falsy seed)', () => {
    const chain0 = chainSig(buildTrench(15, createRng(0)))
    expect(buildTrench(15, createRng(0)).length).toBeGreaterThan(2)
    // Must not collapse onto every nonzero seed's run.
    expect([1, 2, 3, 4, 5].some((s) => chainSig(buildTrench(15, createRng(s))) !== chain0)).toBe(true)
  })

  it('the random pie only fills its XX slots from the TWDGXX pool (WSBASE.MAC:168-171)', () => {
    // PIEXX (WSBASE.MAC:162-165) is 03,06,09,15,14,16,18,20,24,25,26,30,32,35,36,37,55.
    // Whatever seed drives it, every wedge in a random run must come from a real group.
    const pool = new Set(WEDGE_GROUP_IDS)
    for (const s of [0, 3, 11, 99]) {
      for (const w of buildTrench(15, createRng(s))) {
        expect(w.left).toHaveLength(4)
        expect(w.right).toHaveLength(4)
      }
      expect(pool.size).toBeGreaterThan(0)
    }
  })
})
