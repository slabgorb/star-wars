// tests/core/tie-aim-law.test.ts
//
// sw8-2 RED (AC4) — the Math Box aim law is a RATE-LIMITED steer, not a snap.
//
// The 1983 cabinet's homing/steering (docs/tie-flight-ai-model.md §5.2c, ROM:8C44-8D66)
// transforms the player into the TIE's local frame with Math Box program `$67`, then YAWS on the
// lateral error and PITCHES on the vertical error to null them — turning at the recovered
// STEERING rate word_89A8[#$14] ≈ 4.48°/frame (§5.3, live as TIE_YAW_RATE / TIE_PITCH_RATE). The
// TIE steers toward the player a little each frame; combined with roll it visibly SPINS as it
// tracks across the field.
//
// Today `applyManeuver` (src/core/sim.ts:1806) applies AIM_PLAYER/AIM_AHEAD as
// `aimOrient(e) = lookRotation(toCockpit(e.pos))` — a FULL RE-POINT that ignores the TIE's
// current orientation and snaps the nose straight onto the cockpit in a single tick (the code's
// own comment calls the exact `$67` law "a deferred refinement"). A snap cannot spin and reads
// wrong. This suite pins the OBSERVABLE difference between a rate-limited steer and a snap,
// without pinning the exact turn rate (Dev tunes that from the ROM constant).
//
// Sacred boundary: pure orientation math — no DOM, no time beyond `dt`, no randomness.

import { describe, it, expect } from 'vitest'
import { applyManeuver } from '../../src/core/sim'
import { Twist } from '../../src/core/tie-vm'
import { toCockpit } from '../../src/core/gameRules'
import { TICK_HZ, type Enemy } from '../../src/core/state'
import { rotationX, rotationY, transform, dot, IDENTITY, type Vec3, type Mat4 } from '@arcade/shared/math3d'

const TICK_DT = 1 / TICK_HZ
const NOSE: Vec3 = [0, 0, 1] // the TIE model's nose (local +Z)

/** The TIE's world-space nose direction under orientation `m` (a pure rotation, so `transform`
 *  of the unit nose stays unit-length). */
function noseDir(m: Mat4): Vec3 {
  return transform(m, NOSE)
}

/** Angle (radians) between the TIE's nose and the direction to the cockpit. */
function aimError(e: Enemy): number {
  const nose = noseDir(e.orient ?? IDENTITY)
  const want = toCockpit(e.pos)
  return Math.acos(Math.max(-1, Math.min(1, dot(nose, want))))
}

describe('sw8-2 AC4 — TIE aim is an incremental steer, not a one-tick snap', () => {
  it('does not fully align the nose in a single AIM tick (a snap does; the ROM ~4.5°/frame rate cannot)', () => {
    // A TIE dead ahead but facing AWAY (nose −Z), so it starts a full π off the cockpit.
    const before: Enemy = { pos: [0, 0, -8000], orient: rotationY(Math.PI), kind: 'tie' }
    const startErr = aimError(before)
    expect(startErr).toBeGreaterThan(3) // ~π: genuinely reversed to begin with

    const after = applyManeuver(before, Twist.AIM_PLAYER, 0, TICK_DT)
    const endErr = aimError(after)

    // Liveness (per the seeded-RNG corollary: a frozen aim also "doesn't snap") — it DID steer
    // toward the cockpit.
    expect(endErr).toBeLessThan(startErr)
    // …but it did NOT teleport onto the target in one tick. Today aimOrient re-points fully ⇒
    // endErr ≈ 0 ⇒ RED. A ~4.5°/frame steer leaves almost all of π ⇒ green.
    expect(endErr).toBeGreaterThan(1)
  })

  it('carries the prior orientation forward — two different starts steer to two different results', () => {
    // The property a snap cannot fake: an incremental steer DEPENDS on where the TIE was already
    // pointing. `aimOrient` ignores the current orientation, so today both TIEs collapse to the
    // identical re-point ⇒ their noses match ⇒ RED. A rate-limited steer turns each a little from
    // its OWN start ⇒ the noses differ.
    const pos: Vec3 = [0, 0, -8000]
    const a = applyManeuver({ pos, orient: rotationY(Math.PI), kind: 'tie' }, Twist.AIM_PLAYER, 0, TICK_DT)
    const b = applyManeuver({ pos, orient: rotationX(Math.PI / 2), kind: 'tie' }, Twist.AIM_PLAYER, 0, TICK_DT)
    const na = noseDir(a.orient ?? IDENTITY)
    const nb = noseDir(b.orient ?? IDENTITY)
    // Distinct nose directions: dot < ~1 means they are not the same vector.
    expect(dot(na, nb)).toBeLessThan(0.999)
  })
})
