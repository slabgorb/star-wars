// tests/core/tie-perspective-scale.test.ts
//
// Story 9-7 — TIE fighters scale with distance, RED phase.
//
// The defect (side-by-side with the cabinet, captured by the user 2026-06-29):
// our TIEs render WAY too large from the moment they appear and barely change
// size across the whole approach, while the cabinet shows a fighter spawn as a
// tiny distant speck that swoops in and grows dramatically. The 11-2 camera/MVP
// pipeline's perspective divide IS working ("it changes a bit") — the bug is that
// SPAWN_DISTANCE (1200) is far too close for the authentic TIE model (bounding
// radius ~334), so the entire approach happens in the "huge" part of the
// perspective curve:
//
//   distance      apparent size (bounding sphere, as % of viewport height)
//   spawn  z=1200   ~48%   <- a freshly-spawned TIE already fills half the screen
//   near   z=350    ~165%  <- balloons past full-frame before peel-away (9-3's domain)
//   growth spawn->near  only ~3.4x   <- the cabinet's speck-to-ship is far larger
//
// The cabinet reference (user screenshot, "that's a spawn pretty much") shows a
// spawned TIE subtending only ~6-7% of the frame. These tests pin the corrected
// behaviour and are EXPECTED TO FAIL until GREEN pushes the TIEs out.
//
// SCOPE / TEA DESIGN DECISIONS (logged as session deviations):
//   * The fix is a TUNING change, NOT a model change. The TIE geometry is the
//     authentic Obj_Tie_Fighter from the disassembly — it must NOT be shrunk to
//     fake distance. The lever is a new TIE-specific TIE_SPAWN_DISTANCE (the old
//     SPAWN_DISTANCE stays put for turrets/surface), plus companions ENEMY_SPEED so
//     the longer approach stays playable and the FAR clip plane so a far-spawned
//     TIE sits inside the frustum. The GROWTH test below is keyed to the spawn/near
//     depth RANGE precisely so "shrink the model" cannot satisfy it.
//   * Apparent size is measured via the model's BOUNDING SPHERE (modelBounds),
//     projected through the real 11-2 `perspective`/`transform` pipeline. A sphere
//     reads the same from every angle, so the measure is orientation-independent —
//     it survives the per-TIE banking + TIE_ORIENT display roll that the renderer
//     applies, which structural tests otherwise can't see.
//   * The near-bound balloon (~165% at z=350) is intentionally OUT OF SCOPE here —
//     that closest-approach size is bounded by story 9-3's peel-away lifecycle.
//     9-7 fixes the START size and the APPROACH range (the user's two complaints).
//
// Everything obeys the sacred boundary: pure core, no DOM/time/randomness.

import { describe, it, expect } from 'vitest'
import { perspective, transform } from '@arcade/shared/math3d'
import { modelBounds } from '../../src/core/modelView'
import { TIE_FIGHTER } from '../../src/core/models'
import { FOV_Y } from '../../src/core/gameRules'
import { TIE_SPAWN_DISTANCE, TIE_NEAR_BOUND, ENEMY_SPEED } from '../../src/core/state'

const { center, radius } = modelBounds(TIE_FIGHTER)

// A spawned TIE should read as a distant ship — the cabinet's freshly-spawned
// fighter subtends ~6-7% of the frame; ≤12% of viewport height under the
// (conservative) bounding-sphere measure matches that feel and is comfortably
// below today's ~48%. Picking this threshold forces TIE_SPAWN_DISTANCE out to ~5000.
const SPAWN_APPARENT_SIZE_MAX = 0.12

// The fighter must grow dramatically as it bears down — the cabinet's speck-to-ship
// swoop. At least a 6× span from first-seen to closest (today: only ~3.4×).
const MIN_APPROACH_GROWTH = 6

// After pushing the spawn out, the approach must still resolve in a playable
// time at the base (wave-1, slowest) enemy speed — otherwise "too close" is
// merely traded for "glacial crawl", which reads as even MORE constrained motion.
const MAX_APPROACH_SECONDS = 12

/**
 * Fraction of the viewport HEIGHT the TIE subtends when its bounding sphere sits
 * straight ahead at depth `distance`. Projects the sphere's top and bottom
 * through the real perspective pipeline; the NDC span (full NDC height = 2) is the
 * fraction. Orientation-independent — a sphere looks the same from any angle.
 */
function apparentHeightFraction(distance: number): number {
  const proj = perspective(FOV_Y, 16 / 9, 1, 5000) // aspect/near/far don't affect the Y span
  const top = transform(proj, [center[0], center[1] + radius, -distance])
  const bottom = transform(proj, [center[0], center[1] - radius, -distance])
  return Math.abs(top[1] - bottom[1]) / 2
}

describe('Story 9-7 — TIE fighters scale with distance', () => {
  it('a freshly spawned TIE reads as a distant ship, not a screen-filling wall', () => {
    // Today this is ~0.48 (half the screen at spawn) — the core "too close to
    // start with" defect. GREEN pushes TIE_SPAWN_DISTANCE out so it drops under 12%.
    expect(apparentHeightFraction(TIE_SPAWN_DISTANCE)).toBeLessThanOrEqual(SPAWN_APPARENT_SIZE_MAX)
  })

  it('grows dramatically over its approach — the cabinet swoop-in, not a fixed size', () => {
    // Keyed to the spawn→near depth RANGE, so shrinking the model cannot satisfy
    // it: only widening the approach (spawn farther) does. Today: ~3.4×.
    const growth =
      apparentHeightFraction(TIE_NEAR_BOUND) / apparentHeightFraction(TIE_SPAWN_DISTANCE)
    expect(growth).toBeGreaterThanOrEqual(MIN_APPROACH_GROWTH)
  })

  it('apparent size increases monotonically as the TIE closes (perspective divide intact)', () => {
    // Regression guard for the 11-2 pipeline: closer must always be bigger. Sample
    // the live spawn→near range so it stays meaningful after the constants move.
    const STEPS = 6
    const sizes: number[] = []
    for (let i = 0; i < STEPS; i++) {
      const d = TIE_SPAWN_DISTANCE + ((TIE_NEAR_BOUND - TIE_SPAWN_DISTANCE) * i) / (STEPS - 1)
      sizes.push(apparentHeightFraction(d))
    }
    for (let i = 1; i < STEPS; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1])
    }
  })

  it('the approach stays playable after pushing spawn out (no slow crawl)', () => {
    // Guards the ENEMY_SPEED companion: a far spawn at the old speed makes TIEs
    // crawl in for ~39s. Base (wave-1) speed is the slowest, so it's the worst case.
    const approachSeconds = (TIE_SPAWN_DISTANCE - TIE_NEAR_BOUND) / ENEMY_SPEED
    expect(approachSeconds).toBeLessThanOrEqual(MAX_APPROACH_SECONDS)
  })
})
