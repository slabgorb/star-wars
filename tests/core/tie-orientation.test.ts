// tests/core/tie-orientation.test.ts
//
// Story 8-13 — a TIE carries a PER-ENEMY facing orientation in the pure core
// (Wave 1). render only consumes it (guarded in tests/shell/render.tie-orient).
//
// HISTORY / SCOPE: 8-13 originally pinned `orient` to a STATIC "look toward the
// cockpit" rotation, recomputed each step. Story 9-2 (epic-9, the RE'd TIE flight
// model) SUPERSEDES that meaning: the orientation now banks (rolls) and steers
// along the curved flight path, not a frozen cockpit look-at. The cockpit-facing
// assertions that encoded the old static contract have moved to — and been
// replaced by the banking contract in — tests/core/tie-flight.test.ts.
//
// What REMAINS true and is guarded here are the durable invariants 9-2 must keep:
//   * every live TIE carries a well-formed PURE-ROTATION orientation (no scale,
//     shear, or translation that would distort the model), and
//   * the orientation is DETERMINISTIC — identical input yields identical
//     orientations (no hidden time or randomness; the sacred core boundary).
//
// FORWARD-AXIS CONVENTION (still in force): the codebase looks down -Z, so a
// TIE's nose is model-space +Z. interface Enemy { pos; vel; kind:'tie'; orient }.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  SPAWN_INTERVAL,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { IDENTITY, type Vec3, type Mat4 } from '@arcade/shared/math3d'

/** A complete TIE fixture at a chosen position. `orient` is a placeholder the
 *  sim must overwrite each step; it is seeded to IDENTITY so an unimplemented
 *  sim leaves the forward axis at [0,0,1] — which fails every off-axis look-at
 *  assertion below, keeping this suite honestly RED until GREEN computes it. */
const tieAt = (pos: Vec3, vel: Vec3 = [0, 0, 0]): Enemy => ({
  pos,
  vel,
  kind: 'tie',
  orient: IDENTITY,
})

/** A fresh space wave carrying hand-placed enemies (deterministic positions). */
const waveWith = (enemies: Enemy[], seed = 1983): GameState => ({
  ...initialState(seed),
  enemies,
})

const isMat4 = (m: unknown): m is Mat4 =>
  Array.isArray(m) && m.length === 16 && m.every((n) => Number.isFinite(n))

/** True when the upper-3x3 of a row-major Mat4 is an orthonormal, det≈+1
 *  rotation (rows unit-length and mutually perpendicular), with no translation
 *  column and a standard bottom row — i.e. a pure rotation that neither scales
 *  nor shears nor moves the model. */
const isPureRotation = (m: Mat4): boolean => {
  const row = (r: number): Vec3 => [m[r * 4], m[r * 4 + 1], m[r * 4 + 2]]
  const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
  const dotv = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const r0 = row(0)
  const r1 = row(1)
  const r2 = row(2)
  const unit = (v: Vec3) => Math.abs(len(v) - 1) < 1e-6
  const ortho = (a: Vec3, b: Vec3) => Math.abs(dotv(a, b)) < 1e-6
  const det =
    r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
    r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
    r0[2] * (r1[0] * r2[1] - r1[1] * r2[0])
  const noTranslation =
    Math.abs(m[3]) < 1e-6 && Math.abs(m[7]) < 1e-6 && Math.abs(m[11]) < 1e-6
  const bottomRow =
    Math.abs(m[12]) < 1e-6 &&
    Math.abs(m[13]) < 1e-6 &&
    Math.abs(m[14]) < 1e-6 &&
    Math.abs(m[15] - 1) < 1e-6
  return (
    unit(r0) &&
    unit(r1) &&
    unit(r2) &&
    ortho(r0, r1) &&
    ortho(r0, r2) &&
    ortho(r1, r2) &&
    Math.abs(det - 1) < 1e-6 &&
    noTranslation &&
    bottomRow
  )
}

/** Step until a TIE spawns from the seeded RNG, then return it. */
const spawnOne = (seed = 1983): Enemy => {
  let s = initialState(seed)
  for (let i = 0; i < 32 && s.enemies.length === 0; i++) {
    s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 4)
  }
  expect(s.enemies.length).toBeGreaterThan(0)
  return s.enemies[0]
}

describe('Story 8-13 — a TIE carries a facing orientation in core', () => {
  it('a freshly spawned TIE carries a well-formed rotation matrix', () => {
    const e = spawnOne()
    expect(isMat4(e.orient)).toBe(true)
    // A pure rotation — no scale, shear, or translation that would distort the
    // model. (Honestly RED: a spawned enemy has no `orient` until GREEN sets it.)
    expect(isPureRotation(e.orient)).toBe(true)
  })

  it('every live TIE carries a rotation orientation across a normal run', () => {
    let s = initialState(7)
    for (let i = 0; i < 24; i++) s = stepGame(s, NO_INPUT, SPAWN_INTERVAL / 3)
    expect(s.enemies.length).toBeGreaterThan(0)
    for (const e of s.enemies) {
      expect(isMat4(e.orient)).toBe(true)
      expect(isPureRotation(e.orient)).toBe(true)
    }
  })
})

// NOTE: the cockpit-facing assertions that 8-13 placed here asserted a STATIC
// look-at. Story 9-2 replaced that contract with a banking, path-following
// orientation — see tests/core/tie-flight.test.ts for the live AC3 contract.

describe('Story 8-13 — facing is deterministic (boundary guardrail)', () => {
  it('identical input produces identical orientations (no hidden randomness/time)', () => {
    const base = waveWith([tieAt([200, 100, -900]), tieAt([-250, -50, -1100])])
    const a = stepGame(base, NO_INPUT, 0.016)
    const b = stepGame(base, NO_INPUT, 0.016)
    expect(a.enemies.map((e) => e.orient)).toEqual(b.enemies.map((e) => e.orient))
  })
})
