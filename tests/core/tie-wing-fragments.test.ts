// tests/core/tie-wing-fragments.test.ts
//
// Story sw3-8 — RED phase (O'Brien / TEA).
//
// Port the authentic EXPLODED-TIE wing-fragment models and register them, so a
// destroyed TIE can break into its real 1983 death pieces instead of vanishing.
//
// ROM quarry (object-table source WSOBJ.MAC, "OBJECT TABLES AND VECTOR DRAW
// ROUTINES"; cross-named in the local disassembly's Object_3D_Data.asm):
//
//   * Obj_Tie_Wing_Frag_1  (ROM label TI1) — "EXPLODED TIE FIGHTER, LEFT WING AND
//     STRUT" — 18 render vertices (the leading 0,0,0 object anchor is dropped, as
//     every ported model does — see TIE_FIGHTER = 52, not 53).
//   * Obj_Tie_Wing_Frag_2  (ROM label TI2) — "EXPLODED TIE, RIGHT WING AND STRUT,
//     ROTATED" — 18 render vertices. The ROM comments it "SAME SHAPE, DIFFERENT
//     POINTS" and draws it with the SAME routine as TI1 (.WL TI1 / .WL2 TI2): the
//     right wing is the left wing rigidly ROTATED onto a new plane. (The exact map
//     recovered from the point tables is (x,y,z) -> (x, z, -y), a 90 deg turn about
//     the fin axis — hence congruent, same edge lengths, different coordinates.)
//   * Obj_Tie_Wing_Frag_3  (ROM label TI3) — "EXPLODED TIE, CENTER CABIN" — 28
//     render vertices, which are BYTE-IDENTICAL to Obj_Tie_Fighter's aft half
//     (its vertices 25..52: the two inner strut circles + the two body circles).
//
// What we pin (STRUCTURE recovered from the ROM, per repo convention — edges are
// AUTHORED by the DEV to match each silhouette, not ported, so we assert edge
// WELL-FORMEDNESS + congruence, never a specific edge list; and orientation/scale
// stay a render-time eyeball concern, not a core pin):
//   1. Exactly three TIE-fragment models exist AND are in the MODELS registry (so
//      they render on the /models.html contact sheet for the mandatory eyeball).
//   2. Each is a well-formed Model3D (Vec3 tuples, in-range edges, no self-loops,
//      no duplicate edges, no orphan vertices).
//   3. Authentic vertex counts: {18, 18, 28} (TI1/TI2/TI3, anchor dropped).
//   4. The 28-vertex cabin fragment IS the TIE fighter's aft half (verts 25..52) —
//      byte-identical, the one deterministic transcription anchor the ROM gives us.
//   5. The two 18-vertex wings are CONGRUENT (same shape, rotated) but built from
//      DIFFERENT points — the "same shape, different points" the ROM calls out.
//
// Provenance: this file names ROM labels and recovered COUNTS/relationships as our
// own prose only — no verbatim ROM source. The vertex coordinates themselves are
// transcribed by the DEV into models.ts (the established, reviewed practice that
// already ported TIE_FIGHTER's 52 vertices).

import { describe, it, expect } from 'vitest'
import * as ModelsModule from '../../src/core/models'
import type { Model3D } from '../../src/core/models'
import type { Vec3 } from '@arcade/shared/math3d'

/** Properly-typed Model3D fixture for the helper self-checks (no casts). */
const mkModel = (vertices: Vec3[], edges: Array<[number, number]>): Model3D => ({
  name: 'fixture',
  vertices,
  edges,
})

// --- soft registry read (RED-safe): report clean assertion failures while the
//     fragment models do not yet exist, instead of crashing on a missing export.
function allModels(): Model3D[] {
  const reg = (ModelsModule as unknown as {
    MODELS?: readonly Model3D[] | Readonly<Record<string, Model3D>>
  }).MODELS
  if (!reg) return []
  return Array.isArray(reg) ? [...reg] : Object.values(reg)
}
const findByName = (re: RegExp): Model3D | undefined =>
  allModels().find((m) => typeof m.name === 'string' && re.test(m.name))
const findTie = () => findByName(/tie[\s_-]?fighter/i)

/** The TIE-fragment models, discovered by name (a fragment model's name must say
 *  both "TIE" and "Frag"/"Fragment" — clear on the contact sheet and unambiguous
 *  against any future non-TIE fragments). */
const fragments = (): Model3D[] =>
  allModels().filter((m) => typeof m.name === 'string' && /tie/i.test(m.name) && /frag/i.test(m.name))

// --- geometry helpers (self-contained, per house style) --------------------
const sq = (a: readonly number[], b: readonly number[]): number =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
/** Normalised edge keys: pair sorted, list sorted — order-insensitive identity. */
const normEdges = (m: Model3D): string[] =>
  m.edges.map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`)).sort()
/** Sorted multiset of squared edge lengths — invariant under any rigid rotation. */
const edgeSqLens = (m: Model3D): number[] =>
  m.edges.map(([a, b]) => sq(m.vertices[a], m.vertices[b])).sort((x, y) => x - y)
const vertKeys = (m: Model3D): string[] => m.vertices.map((v) => v.join(',')).sort()
const isVec3 = (v: unknown): boolean =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))

// --- guard the guards ------------------------------------------------------
describe('sw3-8 helpers self-check', () => {
  it('normEdges is insensitive to pair order and list order', () => {
    const a = mkModel([], [[2, 0], [1, 0]])
    const b = mkModel([], [[0, 1], [0, 2]])
    expect(normEdges(a)).toEqual(normEdges(b))
  })
  it('sq measures squared distance (3-4-5 => 25)', () => {
    expect(sq([0, 0, 0], [3, 4, 0])).toBe(25)
  })
  it('edgeSqLens is invariant under a 90 deg rotation (x,y,z)->(x,z,-y)', () => {
    const m = mkModel([[1, 2, 3], [4, 5, 6]], [[0, 1]])
    const rot = mkModel([[1, 3, -2], [4, 6, -5]], [[0, 1]]) // each point turned about X
    expect(edgeSqLens(rot)).toEqual(edgeSqLens(m))
  })
})

describe('sw3-8 — the three exploded-TIE wing fragments are ported and registered', () => {
  it('registers exactly three TIE-fragment models (Obj_Tie_Wing_Frag_1/2/3)', () => {
    expect(fragments()).toHaveLength(3)
  })

  it('each fragment is a well-formed Model3D (Vec3 tuples, in-range edges)', () => {
    const frags = fragments()
    expect(frags.length).toBeGreaterThan(0)
    for (const m of frags) {
      expect(typeof m.name).toBe('string')
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.vertices.length).toBeGreaterThan(0)
      for (const v of m.vertices) expect(isVec3(v)).toBe(true)
      expect(m.edges.length).toBeGreaterThan(0)
      for (const [a, b] of m.edges) {
        expect(Number.isInteger(a)).toBe(true)
        expect(Number.isInteger(b)).toBe(true)
        expect(a).toBeGreaterThanOrEqual(0)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(a).toBeLessThan(m.vertices.length)
        expect(b).toBeLessThan(m.vertices.length)
      }
    }
  })

  it('each fragment has no self-loops, no duplicate edges, and no orphan vertices', () => {
    const frags = fragments()
    expect(frags.length).toBeGreaterThan(0)
    for (const m of frags) {
      // no self-loops
      for (const [a, b] of m.edges) expect(a).not.toBe(b)
      // no duplicate edges
      const keys = normEdges(m)
      expect(new Set(keys).size).toBe(keys.length)
      // no orphan vertices (every vertex referenced by an edge — anchor already dropped)
      const used = new Set<number>()
      for (const [a, b] of m.edges) {
        used.add(a)
        used.add(b)
      }
      for (let i = 0; i < m.vertices.length; i++) expect(used.has(i)).toBe(true)
    }
  })

  it('the fragments carry the authentic vertex counts 18 / 18 / 28 (TI1 / TI2 / TI3)', () => {
    const counts = fragments()
      .map((m) => m.vertices.length)
      .sort((a, b) => a - b)
    expect(counts).toEqual([18, 18, 28])
  })
})

describe('sw3-8 — authentic geometry recovered from the ROM point tables', () => {
  it('the 28-vertex cabin fragment (Frag_3) is byte-identical to the TIE fighter aft half (verts 25..52)', () => {
    const tie = findTie()
    expect(tie).toBeDefined()
    if (!tie) return
    expect(tie.vertices.length).toBeGreaterThanOrEqual(52)

    const cabin = fragments().find((m) => m.vertices.length === 28)
    expect(cabin).toBeDefined()
    if (!cabin) return

    // Obj_Tie_Wing_Frag_3 verts 1..28 == Obj_Tie_Fighter verts 25..52 (its aft half).
    const aftHalf = tie.vertices.slice(-28).map((v) => [...v])
    expect(cabin.vertices.map((v) => [...v])).toEqual(aftHalf)
  })

  it('the two wing fragments (Frag_1/Frag_2) are congruent — same shape, rotated', () => {
    const wings = fragments().filter((m) => m.vertices.length === 18)
    expect(wings).toHaveLength(2)
    if (wings.length !== 2) return
    // "SAME SHAPE": a rigid rotation preserves every edge length, so the sorted
    // squared-length multisets match exactly (integer coords => exact equality).
    expect(edgeSqLens(wings[0])).toEqual(edgeSqLens(wings[1]))
    // ...and the same number of edges (congruent wireframes, not one dense/one sparse).
    expect(wings[0].edges.length).toBe(wings[1].edges.length)
  })

  it('the two wing fragments are built from DIFFERENT points (right wing = left wing rotated)', () => {
    const wings = fragments().filter((m) => m.vertices.length === 18)
    expect(wings).toHaveLength(2)
    if (wings.length !== 2) return
    // "DIFFERENT POINTS": TI2 sits on a rotated plane, so the coordinate sets differ
    // even though the shape is identical — guards against duplicating one wing twice.
    expect(vertKeys(wings[0])).not.toEqual(vertKeys(wings[1]))
  })

  it('every fragment is a proper PIECE — strictly smaller than the whole TIE fighter', () => {
    const tie = findTie()
    expect(tie).toBeDefined()
    if (!tie) return
    const frags = fragments()
    expect(frags.length).toBeGreaterThan(0) // non-vacuous: there must be pieces to check
    for (const f of frags) expect(f.vertices.length).toBeLessThan(tie.vertices.length)
  })
})
