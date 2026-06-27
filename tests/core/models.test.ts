import { describe, it, expect } from 'vitest'
import * as ModelsModule from '../../src/core/models'
import type { Model3D } from '../../src/core/models'

// ---------------------------------------------------------------------------
// Story 8-2 — RED phase (Han Solo / TEA)
//
// These tests are the contract the GREEN phase (Yoda / DEV) must satisfy when
// porting the authentic vector models from the cabinet disassembly
// (reference/disasm/Object_3D_Data.asm — GITIGNORED, read-only).
//
// Two things the DEV must know, both surfaced during test design:
//
//  1. EDGE DATA IS NOT IN Object_3D_Data.asm. That file holds ONLY the vertex
//     tables (`fdb x, y, z` triples). The line-segment / edge connectivity is
//     encoded elsewhere (the AVG vector-draw routines in StarWars.asm). So the
//     DEV must author well-formed wireframe edges to match each silhouette.
//     These tests therefore assert edge *well-formedness*, never specific edges.
//
//  2. CONTRACT: "render vertices only." Each object table in the disassembly
//     begins with a `0,0,0` object anchor that is metadata, not a drawn point.
//     Ported models contain drawn vertices only — hence "no orphan vertices"
//     (every vertex must be referenced by at least one edge) is enforceable.
//
// The DEV must export a `MODELS` registry (array OR record of Model3D) that is
// the single canonical source consumed by Wave 1+ (8-3 … 8-5). Individual
// models are identified by their human-readable `Model3D.name`, not by a fixed
// export name — so the DEV is free to name the exports naturally.
// ---------------------------------------------------------------------------

/**
 * Read the forward-declared `MODELS` registry without a hard import, so the
 * suite reports clean assertion failures during RED (when MODELS does not yet
 * exist) instead of crashing on a missing-named-export error. Normalises an
 * array or a record into a flat Model3D[].
 */
function allModels(): Model3D[] {
  const reg = (ModelsModule as unknown as {
    MODELS?: readonly Model3D[] | Readonly<Record<string, Model3D>>
  }).MODELS
  if (!reg) return []
  return Array.isArray(reg) ? [...reg] : Object.values(reg)
}

function findByName(re: RegExp): Model3D | undefined {
  return allModels().find((m) => typeof m.name === 'string' && re.test(m.name))
}

const findTie = () => findByName(/tie[\s_-]?fighter/i)
const findTrench = () => findByName(/trench/i)

describe('models — registry', () => {
  it('exposes a MODELS registry covering the four authentic model groups', () => {
    // Story 8-2 scope: TIE fighters, Death Star surface tiles, towers, trench.
    const all = allModels()
    expect(all.length).toBeGreaterThanOrEqual(4)
  })

  it('every registry entry conforms to the Model3D shape', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      expect(typeof m.name).toBe('string')
      expect(m.name.length).toBeGreaterThan(0)
      expect(Array.isArray(m.vertices)).toBe(true)
      expect(Array.isArray(m.edges)).toBe(true)
    }
  })

  it('includes the TIE fighter (hero model for Wave 1 space combat)', () => {
    expect(findTie()).toBeDefined()
  })

  it('includes the trench (Wave 3)', () => {
    expect(findTrench()).toBeDefined()
  })
})

describe('models — well-formedness (every model)', () => {
  it('every vertex is a finite Vec3 (length-3 number tuple)', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      expect(m.vertices.length).toBeGreaterThan(0)
      for (const v of m.vertices) {
        expect(Array.isArray(v)).toBe(true)
        expect(v.length).toBe(3)
        for (const c of v) expect(Number.isFinite(c)).toBe(true)
      }
    }
  })

  it('every edge is a pair of integer vertex indices', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      expect(m.edges.length).toBeGreaterThan(0)
      for (const e of m.edges) {
        expect(e.length).toBe(2)
        expect(Number.isInteger(e[0])).toBe(true)
        expect(Number.isInteger(e[1])).toBe(true)
      }
    }
  })

  it('every edge index is in range [0, vertexCount)', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      const n = m.vertices.length
      for (const [a, b] of m.edges) {
        expect(a).toBeGreaterThanOrEqual(0)
        expect(a).toBeLessThan(n)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThan(n)
      }
    }
  })

  it('has no degenerate edges (an edge never joins a vertex to itself)', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      for (const [a, b] of m.edges) expect(a).not.toBe(b)
    }
  })

  it('has no duplicate edges (undirected)', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      const seen = new Set<string>()
      for (const [a, b] of m.edges) {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
  })

  it('has no orphan vertices (every vertex is referenced by an edge)', () => {
    const all = allModels()
    expect(all.length).toBeGreaterThan(0)
    for (const m of all) {
      const used = new Set<number>()
      for (const [a, b] of m.edges) {
        used.add(a)
        used.add(b)
      }
      for (let i = 0; i < m.vertices.length; i++) {
        expect(used.has(i)).toBe(true)
      }
    }
  })
})

describe('models — TIE fighter authentic invariants', () => {
  it('ports the full vertex set (>= 52 render vertices from Obj_Tie_Fighter)', () => {
    const tie = findTie()
    expect(tie).toBeDefined()
    if (!tie) return
    expect(tie.vertices.length).toBeGreaterThanOrEqual(52)
  })

  it('is bilaterally symmetric under Y reflection (top wing mirrors bottom)', () => {
    // Verified against Object_3D_Data.asm: the Obj_Tie_Fighter vertex set is
    // invariant under y -> -y. This holds regardless of uniform scaling, so it
    // survives the DEV normalising the raw 16-bit coords to a sane unit size.
    const tie = findTie()
    expect(tie).toBeDefined()
    if (!tie) return

    const verts = tie.vertices
    const maxAbs = Math.max(
      1,
      ...verts.flatMap((v) => [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])]),
    )
    const eps = 1e-6 * maxAbs + 1e-9
    const hasYMirror = (v: readonly number[]) =>
      verts.some(
        (w) =>
          Math.abs(w[0] - v[0]) <= eps &&
          Math.abs(w[1] + v[1]) <= eps &&
          Math.abs(w[2] - v[2]) <= eps,
      )

    for (const v of verts) expect(hasYMirror(v)).toBe(true)
  })

  it('has no coincident (duplicate) vertices', () => {
    const tie = findTie()
    expect(tie).toBeDefined()
    if (!tie) return
    const keys = new Set(tie.vertices.map((v) => v.join(',')))
    expect(keys.size).toBe(tie.vertices.length)
  })
})

describe('models — trench authentic invariants', () => {
  it('ports the floor squares (>= 8 vertices)', () => {
    const trench = findTrench()
    expect(trench).toBeDefined()
    if (!trench) return
    expect(trench.vertices.length).toBeGreaterThanOrEqual(8)
  })

  it('lies flat in a single horizontal (Y) plane', () => {
    // Verified against Object_3D_Data.asm: every Obj_Trench_Squares vertex has
    // y == 0 — the trench floor is a ground plane.
    const trench = findTrench()
    expect(trench).toBeDefined()
    if (!trench) return
    const ys = trench.vertices.map((v) => v[1])
    const spread = Math.max(...ys) - Math.min(...ys)
    expect(spread).toBeCloseTo(0)
  })
})
