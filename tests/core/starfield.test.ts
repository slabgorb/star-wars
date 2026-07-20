// tests/core/starfield.test.ts
//
// sw7-10 RED — M-015: the WSSTAR starfield subsystem (core half).
//
// Ground truth (1983 "Warp Speed" source, WSSTAR.MAC, .RADIX 16 via WSCOMN.MAC:5):
//   * `M$STNM ==50.`  (WSSTAR.MAC:28, trailing-dot DECIMAL) — 50 stars, always.
//   * placement PRNG is a HARDWARE random byte (RND8 reads P.RND1, WSMATH.MAC:173) —
//     non-deterministic in the cabinet. The clone's core is a deterministic seeded
//     sim (CLAUDE.md hard rule: no Math.random), so the starfield is seeded off
//     `state.rng`. That is a DELIBERATE divergence (logged), not infidelity — a
//     seeded field is the only faithful option for a replayable sim.
//   * per-frame motion: stars are drawn relative to the viewer-translation vector
//     ST.UX/UY/UZ, advanced every frame (WSSTAR.MAC:98-103; in-flight ST.UX from
//     FRAME, WSMAIN.MAC:2525). So the field MOVES continuously.
//
// The field lives on GameState (`state.starfield`) — undefined until Dev lands it,
// which is the red. See tests/support/sw710-contract.ts.
import { describe, it, expect } from 'vitest'
import { initialState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { ext, type Star } from '../support/sw710-contract'

const DT = 1 / 60

/** A stable, order-independent signature of a star set (rounded, sorted). */
function signature(stars: readonly Star[]): string {
  return stars
    .map((s) => `${Math.round(s.x)},${Math.round(s.y)},${Math.round(s.z)}`)
    .sort()
    .join('|')
}

describe('sw7-10 M-015 — the starfield exists and holds the ROM count', () => {
  it('initialState seeds exactly 50 stars (M$STNM==50., WSSTAR.MAC:28)', () => {
    const sf = ext(initialState(1983)).starfield
    expect(sf, 'GameState must carry a `starfield`').toBeDefined()
    expect(sf!.length).toBe(50)
  })

  it('every star is a finite 3D point (no NaN/undefined coords)', () => {
    const sf = ext(initialState(1983)).starfield
    expect(sf, 'GameState must carry a `starfield`').toBeDefined()
    for (const s of sf!) {
      expect(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)).toBe(true)
    }
  })
})

describe('sw7-10 M-015 — seeded-deterministic (the logged divergence from the hardware RNG)', () => {
  it('same seed reproduces the same field', () => {
    const a = ext(initialState(4242)).starfield
    const b = ext(initialState(4242)).starfield
    expect(a, 'starfield must exist to compare').toBeDefined()
    expect(a!.length).toBe(50) // guard: an undefined/empty field would make this vacuous
    expect(signature(a!)).toBe(signature(b!))
  })

  it('a DIFFERENT seed gives a different field (anti-vacuity — the real bite)', () => {
    const a = ext(initialState(1)).starfield
    const b = ext(initialState(2)).starfield
    expect(a, 'starfield must exist').toBeDefined()
    expect(b, 'starfield must exist').toBeDefined()
    expect(a!.length).toBe(50)
    // Two frozen/undefined fields would be EQUAL — so this is what proves the field
    // is really seeded off the RNG, not a constant.
    expect(signature(a!)).not.toBe(signature(b!))
  })
})

describe('sw7-10 M-015 — the field moves every frame (WSSTAR ST.U* viewer translation)', () => {
  it('stepping the sim shifts the starfield (topology-over-a-sweep, not one frozen frame)', () => {
    let s = initialState(1983)
    const sigs = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const sf = ext(s).starfield
      expect(sf, 'starfield must exist to observe motion').toBeDefined()
      sigs.add(signature(sf!))
      s = stepGame(s, NO_INPUT, DT)
    }
    // A static field yields exactly ONE signature across the sweep; a moving field
    // yields many. Fails hard on "the stars never move".
    expect(sigs.size).toBeGreaterThan(1)
  })
})
