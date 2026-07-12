// tests/core/trench-variation.test.ts
//
// Story sw3-7 — Trench per-run variation. RED phase.
//
// THE DEFECT: today `spawnTrenchObstacles()` ignores the run seed and returns
// one static hand-authored table, so EVERY trench run is byte-identical.
//
// THE AUTHENTIC CONTRACT (ROM `sub_83A4`, disasm "Called when starting trench";
// WSBASE.MAC `GNBASE` "GEN A NEW BASE PIE"): each run's trench "pie" is built as
// a PRNG **fixed-head + picked-tail** chain —
//   1. a FIXED HEAD is copied verbatim from a ROM skeleton (`off_7C7E` /
//      `PIEXX` divider-panel format) — the same every run, so the trench
//      entrance is stable; then
//   2. a run of slots is OVERWRITTEN with random PICKS from a ROM pool
//      (`off_7C9E` / `TWDGXX` "list of wedges to use"), indexed by a scaled PRNG
//      byte: disasm `lda #$11; ldb PRNG; mul; asla` = `(#entries * rnd) >> 8`,
//      i.e. the classic `nextInt(rng, #entries)` scaled pick. The tail varies by
//      seed, so runs DIFFER instead of being byte-identical.
//
// PURITY (star-wars CLAUDE.md hard boundary; sim.ts:142 "Clone the RNG so the
// step never mutates its input"): the only randomness is the seeded `Rng`
// carried in `GameState`. No `Math.random`. Same seed -> same run; different
// seed -> different run. These tests pin the OBSERVABLE contract (the chain that
// `enterPhase(_, 'trench')` opens with), seam-agnostic about how the tail is
// picked — they must accept any faithful port of the fixed-head + picked-tail
// shape.

import { describe, it, expect } from 'vitest'
import { createRng } from '@arcade/shared/rng'
import { initialState, type TrenchObstacle } from '../../src/core/state'
import { enterPhase } from '../../src/core/sim'
import { spawnTrenchObstacles } from '../../src/core/trench-obstacles'

/** The obstacle chain a fresh trench run opens with, for a given RNG seed. */
function chainForSeed(seed: number): TrenchObstacle[] {
  return enterPhase(initialState(seed), 'trench').trenchObstacles
}

/** A stable, comparable signature of one obstacle chain (kind + position). */
function sig(chain: readonly TrenchObstacle[]): string {
  return JSON.stringify(chain.map((o) => [o.kind, o.pos]))
}

/** Leading count of stations deep-equal across EVERY chain in the set — the
 *  "fixed head" length (0 if even the first station varies). */
function commonPrefixLen(chains: readonly TrenchObstacle[][]): number {
  const min = Math.min(...chains.map((c) => c.length))
  let n = 0
  for (; n < min; n++) {
    const here = sig([chains[0][n]])
    if (!chains.every((c) => sig([c[n]]) === here)) break
  }
  return n
}

// A spread wide enough that the astronomically-unlikely event of every seed
// picking an identical tail can be ruled out, while staying cheap.
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1)

describe('sw3-7 trench per-run variation — PRNG fixed-head + picked-tail (sub_83A4)', () => {
  it('different seeds produce DIFFERENT obstacle chains (regression: runs are byte-identical today)', () => {
    const signatures = SEEDS.map((s) => sig(chainForSeed(s)))
    // RED today: the static table ignores the seed, so this set has size 1.
    expect(new Set(signatures).size).toBeGreaterThan(1)
  })

  it('has a FIXED HEAD and a PICKED TAIL: the seed-invariant prefix is non-empty but shorter than the chain', () => {
    const chains = SEEDS.map(chainForSeed)
    const cp = commonPrefixLen(chains)
    const len = chains[0].length
    expect(cp).toBeGreaterThan(0) // fixed head — a stable trench entrance every run
    expect(cp).toBeLessThan(len) // picked tail — later slots vary by seed (RED today: cp === len)
  })

  it('is DETERMINISTIC: the same seed always yields the same chain (seeded, never Math.random)', () => {
    for (const s of [0, 1, 7, 1983, 0x7fffffff]) {
      expect(sig(chainForSeed(s))).toBe(sig(chainForSeed(s)))
    }
  })

  it('chain LENGTH is seed-invariant (ROM fixed-size RPIE — only the contents vary)', () => {
    const lengths = new Set(SEEDS.map((s) => chainForSeed(s).length))
    expect(lengths.size).toBe(1)
    expect([...lengths][0]).toBeGreaterThan(0)
  })

  it('entering the trench does NOT mutate the caller RNG (purity — enterPhase seeds from a local cursor)', () => {
    const s = initialState(9)
    const before = s.rng.seed
    enterPhase(s, 'trench')
    expect(s.rng.seed).toBe(before)
  })

  it('seed 0 is a valid, non-degenerate seed (guards `|| default` on a falsy-but-valid seed) and still varies', () => {
    const chain0 = chainForSeed(0)
    expect(chain0.length).toBeGreaterThan(0)
    // Seed 0 must not collapse onto the same run as every nonzero seed. RED
    // today: the seed is ignored, so seed 0 equals seeds 1..5.
    expect([1, 2, 3, 4, 5].some((s) => sig(chainForSeed(s)) !== sig(chain0))).toBe(true)
  })

  it('every picked obstacle is a known kind and stays downrange (picked-tail pool sanity)', () => {
    for (const s of [0, 3, 11, 99]) {
      for (const o of chainForSeed(s)) {
        expect(['turret', 'square', 'catwalk']).toContain(o.kind)
        expect(o.pos[2]).toBeLessThan(0)
      }
    }
  })

  it('every run keeps at least one CATWALK hazard (the divider skeleton is part of the fixed head)', () => {
    // The authentic pie's divider panels ("DIVIDER W/ CATWALK", PIEXX format)
    // are the fixed head, not a picked wedge — so the catwalk hazard survives in
    // every run AND in the no-arg default that the scene-preset and
    // catwalk-hazard/viewpoint suites depend on (they call spawnTrenchObstacles()
    // and .find the catwalk). Guarding it here keeps those siblings honest.
    expect(spawnTrenchObstacles().some((o) => o.kind === 'catwalk')).toBe(true)
    for (const s of [0, 5, 17, 40]) {
      expect(chainForSeed(s).some((o) => o.kind === 'catwalk')).toBe(true)
    }
  })

  it('spawnTrenchObstacles(rng) is a pure function of the seed and returns fresh, unshared arrays', () => {
    const a = spawnTrenchObstacles(createRng(42))
    const b = spawnTrenchObstacles(createRng(42))
    expect(sig(a)).toBe(sig(b)) // same seed -> same chain
    expect(a).not.toBe(b) // a fresh array each call (positions mutate as they scroll)
    a[0].pos[2] = 999 // mutating one result must never corrupt a later spawn
    expect(sig(spawnTrenchObstacles(createRng(42)))).toBe(sig(b))
  })
})
