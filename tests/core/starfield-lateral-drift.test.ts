// tests/core/starfield-lateral-drift.test.ts
//
// sw8-1 RED — AC4: the starfield drifts LATERALLY (the whole field slides past a
// moving eye), not purely forward-streaming toward the vanishing point.
//
// GROUND TRUTH (1983 "Warp Speed" source, quoted verbatim in src/core/starfield.ts:6-13):
//   * `VWSTAR` loads the viewer-translation vector ST.UX/UY/UZ into the Math Box every
//     frame (WSSTAR.MAC:96-103) — the whole field slides past the eye.
//   * in flight ST.UX is driven STRAIGHT off the frame counter
//     (`LDD FRAME / JSR LSLD7 / STD ST.UX`, WSMAIN.MAC:2525-2528).
// Today `stepStarfield` (starfield.ts:84) only DECREMENTS z and preserves x/y verbatim
// — pure forward-stream, zero lateral component. This is the design's observation #3
// ("Starfield 'faked' / moves differently … cabinet drifts laterally").
//
// SEAM-AGNOSTIC ON PURPOSE. The port may change `stepStarfield`'s signature (it takes
// no frame today) or move the drift into a core eye vector — an open question Dev rules
// in GREEN. So this suite drives the REAL sim (`stepGame` from `initialState()`, which
// starts mid-space with a live 50-star field) and asserts only the OBSERVABLE: over a
// run, the field acquires lateral (x) motion and its lateral centroid slides. The rate
// (the ST.UX slope) is Dev's tuning to rule, not this suite's to pin.
import { describe, it, expect } from 'vitest'
import { initialState, type GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { STAR_COUNT } from '../../src/core/starfield'

const DT = 1 / 60

/** Step the real sim `steps` render frames on neutral input — the field slides every
 *  frame regardless of phase (sim.ts:589, finalizeFrame). `stepStarfield` maps in place
 *  by index, so star i in the result is the same star i that started. */
function advance(s0: GameState, steps: number): GameState {
  let s = s0
  for (let i = 0; i < steps; i++) s = stepGame(s, NO_INPUT, DT)
  return s
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

describe('sw8-1 — the starfield slides laterally past a moving eye', () => {
  it('AC4: individual stars pick up lateral (x) motion, not just closing z', () => {
    const start = initialState(1983)
    const later = advance(start, 720) // ~12 s ≈ 246 game frames

    expect(start.starfield.length).toBe(STAR_COUNT)
    expect(later.starfield.length).toBe(STAR_COUNT)

    // Today every star keeps its x verbatim (only z streams + wraps), so NO star's x
    // ever changes → count 0 → red. A lateral viewer translation moves them in x.
    const lateralMovers = later.starfield.filter(
      (s, i) => Math.abs(s.x - start.starfield[i].x) > 1e-6,
    ).length
    expect(lateralMovers).toBeGreaterThan(0)
  })

  it('AC4: the whole field slides one way — its lateral centroid drifts', () => {
    // A viewer translation slides the ENTIRE field in the same direction, so the mean
    // x-coordinate moves off its starting value. Today the centroid is frozen (x is
    // preserved through both the step and the wrap) → drift 0 → red. The 1-unit floor
    // is a "the field actually slid" tripwire, not the ST.UX magnitude.
    const start = initialState(1983)
    const later = advance(start, 720)

    const drift = Math.abs(mean(later.starfield.map((s) => s.x)) - mean(start.starfield.map((s) => s.x)))
    expect(drift).toBeGreaterThan(1)
  })

  it('AC5: the field is deterministic — same seed reproduces the same slid field', () => {
    // The lateral drift must stay seeded-pure (CLAUDE.md core rule): two runs from the
    // same seed land on an identical field. Holds today and must survive the port.
    const a = advance(initialState(1983), 300).starfield
    const b = advance(initialState(1983), 300).starfield
    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].x).toBeCloseTo(b[i].x, 9)
      expect(a[i].y).toBeCloseTo(b[i].y, 9)
      expect(a[i].z).toBeCloseTo(b[i].z, 9)
    }
  })
})
