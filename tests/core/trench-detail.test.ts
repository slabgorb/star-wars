// tests/core/trench-detail.test.ts
import { describe, it, expect } from 'vitest'
import { trenchWallDetail, PANEL_Z, PANEL_W, PANEL_H } from '../../src/core/trench-detail'
import { TRENCH_HALF_W, TRENCH_WALL_H, TRENCH_FAR } from '../../src/core/trench-channel'

describe('trenchWallDetail — recessed wall panels (fidelity epic)', () => {
  it('returns a well-formed Model3D', () => {
    const d = trenchWallDetail(0)
    expect(d.vertices.length).toBeGreaterThan(0)
    expect(d.edges.length).toBeGreaterThan(0)
    for (const [a, b] of d.edges) {
      expect(a).not.toBe(b)
      expect(a).toBeLessThan(d.vertices.length)
      expect(b).toBeLessThan(d.vertices.length)
    }
  })

  it('puts every vertex ON a wall plane (x = ±TRENCH_HALF_W), inside the wall band', () => {
    for (const v of trenchWallDetail(0).vertices) {
      expect(Math.abs(Math.abs(v[0]) - TRENCH_HALF_W)).toBeLessThan(1e-6)
      expect(v[1]).toBeGreaterThan(0)
      expect(v[1]).toBeLessThan(TRENCH_WALL_H)
      expect(v[2]).toBeLessThanOrEqual(0 + PANEL_Z) // never behind the cockpit by more than one cell
      expect(v[2]).toBeGreaterThanOrEqual(-TRENCH_FAR - PANEL_Z)
    }
  })

  it('is mirror-symmetric across x=0', () => {
    const d = trenchWallDetail(0)
    const present = new Set(d.vertices.map((v) => `${v[0]}|${v[1]}|${v[2]}`))
    for (const v of d.vertices) expect(present.has(`${-v[0]}|${v[1]}|${v[2]}`)).toBe(true)
  })

  it('is pure & deterministic, and recycles every PANEL_Z', () => {
    expect(trenchWallDetail(137.5)).toEqual(trenchWallDetail(137.5))
    for (const s of [0, PANEL_Z / 3, PANEL_Z * 2.25]) {
      expect(trenchWallDetail(s)).toEqual(trenchWallDetail(s + PANEL_Z))
    }
  })

  it('panels have real extent (PANEL_W × PANEL_H rectangles, 4 edges each)', () => {
    const d = trenchWallDetail(0)
    expect(d.edges.length % 4).toBe(0)
    expect(PANEL_W).toBeGreaterThan(0)
    expect(PANEL_H).toBeGreaterThan(0)
  })
})
