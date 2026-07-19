// tests/core/space-determinism.test.ts
//
// Task 4 review fix (sw7 TIE-VM-wiring plan, docs 4c93855). The design doc's
// §3 originally claimed the space-phase frame accumulator "preserves the
// dt-independence property" without qualification. Reviewer finding: that's
// only true of FRAME COUNT. `computeStatus` (tie-status.ts) draws two RNG
// ints per LIVE TIE per DECISION TICK from *inside* the accumulator loop
// (sim.ts's `stepGame`, ~L312-319), while spawns/removals mutate the enemy
// population once per `stepGame` CALL, *after* that loop exits. Chunking the
// same total `dt` into a different number of `stepGame` calls changes how
// spawn/removal points interleave with decision ticks, which can change how
// many TIEs draw from the shared seeded RNG stream at a given tick — a
// different draw count diverges the stream (and all downstream state) across
// dt chunkings. Frame COUNT stays dt-independent regardless (pinned by
// `space-frame-accumulator.test.ts`); full cross-dt discrete-STATE
// independence does not hold, and was never actually claimed correctly.
//
// What IS load-bearing in play: the shell (`@arcade/shared/loop`, via
// `createLoop`) is a FIXED-TIMESTEP loop that always calls `stepGame` with
// `dt = 1/60` (main.ts) — cross-dt chunking is never exercised live. Only
// SAME-dt replay determinism matters, and this test pins exactly that: two
// independent runs, identical fixed dt, long enough (8 sim-seconds) that TIEs
// actually spawn and fly, must land on bit-identical state.
//
// See docs/superpowers/specs/2026-07-18-star-wars-tie-vm-fire-wiring-design.md
// §3 for the full, corrected guarantee statement.

import { describe, it, expect } from 'vitest'
import { stepGame } from '../../src/core/sim'
import { makeSpaceState, NO_INPUT } from './helpers/space'

const FIXED_DT = 1 / 60
const SIM_SECONDS = 8
const STEPS = Math.round(SIM_SECONDS / FIXED_DT)

/** Run `STEPS` fixed-dt steps from a fresh space state seeded identically —
 *  the shell's actual drive pattern (`createLoop` default `hz = 60`). */
function run(seed: number) {
  let s = makeSpaceState(seed)
  for (let i = 0; i < STEPS; i++) s = stepGame(s, NO_INPUT, FIXED_DT)
  return s
}

describe('space-phase same-dt determinism (the guarantee stepGame actually relies on)', () => {
  it('two runs at one fixed dt produce bit-identical state, spawns and all', () => {
    const a = run(1983)
    const b = run(1983)

    // Sanity: TIEs actually spawned and flew across these 8 s — otherwise this
    // test would pass vacuously against an empty `enemies` array both times.
    expect(a.spawnCount).toBeGreaterThan(0)
    expect(a.enemies.length).toBeGreaterThan(0)

    expect(a).toEqual(b)
  })

  it('holds field-by-field too (belt-and-suspenders against a future coarser toEqual)', () => {
    const a = run(2024)
    const b = run(2024)

    expect(a.spawnCount).toBeGreaterThan(0)
    expect(a.enemies).toEqual(b.enemies)
    expect(a.rng).toEqual(b.rng)
    expect(a.spawnCount).toBe(b.spawnCount)
    expect(a.lives).toBe(b.lives)
    expect(a.frame).toBe(b.frame)
    expect(a.frameAcc).toBe(b.frameAcc)
  })
})
