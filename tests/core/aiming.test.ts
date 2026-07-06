// tests/core/aiming.test.ts
//
// Wave 1 — crosshair, aim, and the 3D hit-test (story 8-3), RED phase.
//
// Pure helpers that the cockpit and the collision system rest on. They belong in
// a new pure module `src/core/gameRules.ts` (no DOM, no time, no randomness):
//
//   aimDirection(aimX, aimY): Vec3
//     Unit firing direction. At rest (0,0) it points forward, down -Z.
//
//   crosshairNdc(aimX, aimY): readonly [number, number]
//     The reticle's normalised-device position, centred ([0,0]) at rest and
//     tracking the yoke. ("Crosshair at screen centre when phase is space.")
//
//   collides(a: Vec3, b: Vec3, radius): boolean
//     3D sphere overlap, computed via the Math Box (length/sub) — never in
//     screen pixels. The single hit-test the combat rules call.
//
// This whole suite is RED until gameRules.ts exists.

import { describe, it, expect } from 'vitest'
import { aimDirection, crosshairNdc, collides } from '../../src/core/gameRules'
import { length, sub, type Vec3 } from '@arcade/shared/math3d'

describe('Wave 1 — crosshair', () => {
  it('sits dead centre at rest', () => {
    const c = crosshairNdc(0, 0)
    expect(c[0]).toBeCloseTo(0)
    expect(c[1]).toBeCloseTo(0)
  })

  it('tracks the yoke horizontally', () => {
    expect(crosshairNdc(0.5, 0)[0]).toBeGreaterThan(0)
    expect(crosshairNdc(-0.5, 0)[0]).toBeLessThan(0)
  })

  it('tracks the yoke vertically', () => {
    const up = crosshairNdc(0, 0.5)[1]
    const down = crosshairNdc(0, -0.5)[1]
    expect(up).not.toBeCloseTo(0)
    expect(Math.sign(up)).toBe(-Math.sign(down)) // opposite yokes => opposite offsets
  })
})

describe('Wave 1 — aim direction', () => {
  it('is a forward unit vector at rest', () => {
    const d = aimDirection(0, 0)
    expect(length(d)).toBeCloseTo(1)
    expect(d[2]).toBeLessThan(0) // forward is -Z
    expect(d[0]).toBeCloseTo(0)
    expect(d[1]).toBeCloseTo(0)
  })

  it('deflects with the yoke yet stays unit-length and forward', () => {
    const d = aimDirection(0.5, 0)
    expect(length(d)).toBeCloseTo(1)
    expect(d[0]).toBeGreaterThan(0) // aim right => +X
    expect(d[2]).toBeLessThan(0) // still flying forward
  })
})

describe('Wave 1 — 3D hit-test', () => {
  it('reports a hit inside the radius', () => {
    expect(collides([0, 0, 0], [0, 0, 0], 1)).toBe(true)
    expect(collides([0, 0, 0], [0.5, 0, 0], 1)).toBe(true)
  })

  it('reports a miss outside the radius', () => {
    expect(collides([0, 0, 0], [2, 0, 0], 1)).toBe(false)
  })

  it('agrees with the Math Box distance at the boundary', () => {
    const a: Vec3 = [1, 2, -3]
    const b: Vec3 = [-4, 0, 5]
    const r = length(sub(a, b))
    expect(collides(a, b, r + 0.001)).toBe(true)
    expect(collides(a, b, r - 0.001)).toBe(false)
  })
})
