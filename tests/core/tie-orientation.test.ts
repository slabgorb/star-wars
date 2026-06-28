// tests/core/tie-orientation.test.ts
//
// Story 8-13 — TIE fighters bank/rotate toward the player like the cabinet
// (Wave 1), RED phase.
//
// THE BUG: every TIE renders at one fixed orientation regardless of where it
// flies (render.ts draws TIE_FIGHTER with the default IDENTITY orient — the raw
// model vertices, unrotated, for every enemy). The cabinet banks each TIE to
// face the cockpit. These tests are EXPECTED TO FAIL until the GREEN phase
// implements per-enemy facing.
//
// CONTRACT this suite asks DEV to implement, honouring the epic guardrail
// ("per-enemy facing is sim state and stays in core" — context-epic-8.md, the
// "Display orientation" note): the orientation is computed in the PURE CORE and
// carried on the enemy; render only consumes it (guarded separately in
// tests/shell/render.tie-orient.test.ts).
//
//   interface Enemy { pos: Vec3; vel: Vec3; kind: 'tie'; orient: Mat4 }
//
//   `orient` is a "look toward the cockpit" rotation, recomputed each step from
//   the TIE's CURRENT position.
//
// FORWARD-AXIS CONVENTION (TEA design decision — see session deviations): the
// story leaves the model's facing axis undefined. This suite adopts the
// codebase's own "looking down -Z" convention (the camera looks down -Z, bolts
// fire down -Z, TIEs approach from -Z), so a TIE's NOSE — pointing back at the
// cockpit — is model-space +Z. `orient` therefore maps the forward axis [0,0,1]
// onto the unit direction from the TIE to the cockpit at the origin. A TIE dead
// ahead on the view axis needs no turn; off-axis TIEs bank toward the player.
// The fixed display correction that stands the solar panels up (the model stacks
// them on Y) is a SEPARATE render concern, eyeballed in the dev server — this
// suite does not assert it. Like the Wave 1/2 RED suites, this file references a
// state field the GREEN phase will add, so `tsc` is red until then while vitest
// runs and reports the contract as failing.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  SPAWN_INTERVAL,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { IDENTITY, normalize, sub, type Vec3, type Mat4 } from '../../src/core/math3d'

const COCKPIT: Vec3 = [0, 0, 0]
/** Model-space forward — the TIE's nose (see FORWARD-AXIS CONVENTION above). */
const FORWARD: Vec3 = [0, 0, 1]

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

/** Unit direction from a world position toward the cockpit at the origin. */
const toCockpit = (pos: Vec3): Vec3 => normalize(sub(COCKPIT, pos))

/** Apply only the rotation (linear) part of a row-major Mat4 to a direction,
 *  isolating it from any translation so the assertion tests facing alone. */
const applyDir = (m: Mat4, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[4] * v[0] + m[5] * v[1] + m[6] * v[2],
  m[8] * v[0] + m[9] * v[1] + m[10] * v[2],
]

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

describe('Story 8-13 — the orientation faces the player (cockpit)', () => {
  it('points the model forward axis at the cockpit from an off-axis position', () => {
    const pos: Vec3 = [300, -150, -1000]
    const s = stepGame(waveWith([tieAt(pos)]), NO_INPUT, 0.016)
    const e = s.enemies[0]
    const facing = applyDir(e.orient, FORWARD)
    const want = toCockpit(pos)
    expect(facing[0]).toBeCloseTo(want[0], 4)
    expect(facing[1]).toBeCloseTo(want[1], 4)
    expect(facing[2]).toBeCloseTo(want[2], 4)
  })

  it('banks mirror TIEs in opposite directions — orientation is per-enemy, not one fixed transform', () => {
    // The headline regression for this story: two TIEs at mirrored lateral
    // positions must NOT share an orientation (the bug drew both identically).
    const right: Vec3 = [300, 0, -1000]
    const left: Vec3 = [-300, 0, -1000]
    const s = stepGame(waveWith([tieAt(right), tieAt(left)]), NO_INPUT, 0.016)
    const [er, el] = s.enemies
    expect(er.orient).not.toEqual(el.orient)

    const fr = applyDir(er.orient, FORWARD)
    const fl = applyDir(el.orient, FORWARD)
    // The right-side TIE faces back toward -X; the left-side TIE toward +X.
    expect(fr[0]).toBeLessThan(0)
    expect(fl[0]).toBeGreaterThan(0)
    expect(fr[0]).toBeCloseTo(-fl[0], 4)
  })

  it('recomputes orientation from the TIE current position each frame (not frozen)', () => {
    // A TIE drifting sideways (velocity NOT aimed at the cockpit) must re-face
    // the player as it moves — proving the facing tracks live position, not a
    // value baked once at spawn.
    const start: Vec3 = [0, 0, -1000]
    const s = stepGame(waveWith([tieAt(start, [600, 0, 0])]), NO_INPUT, 0.5)
    const e = s.enemies[0]
    expect(e.pos[0]).toBeCloseTo(300, 4) // moved +X by vel*dt
    const facing = applyDir(e.orient, FORWARD)
    const want = toCockpit(e.pos)
    expect(facing[0]).toBeCloseTo(want[0], 4)
    expect(facing[1]).toBeCloseTo(want[1], 4)
    expect(facing[2]).toBeCloseTo(want[2], 4)
    // And it is no longer the straight-ahead facing it had at spawn.
    expect(facing[0]).toBeLessThan(-0.01)
  })
})

describe('Story 8-13 — facing is deterministic (boundary guardrail)', () => {
  it('identical input produces identical orientations (no hidden randomness/time)', () => {
    const base = waveWith([tieAt([200, 100, -900]), tieAt([-250, -50, -1100])])
    const a = stepGame(base, NO_INPUT, 0.016)
    const b = stepGame(base, NO_INPUT, 0.016)
    expect(a.enemies.map((e) => e.orient)).toEqual(b.enemies.map((e) => e.orient))
  })
})
