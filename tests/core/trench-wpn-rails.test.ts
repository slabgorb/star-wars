// tests/core/trench-wpn-rails.test.ts
//
// Story sw7-6 (R6a) — M-013: the TRENCH model is `.WP WPN` plus 4 fabricated rails.  RED phase.
//
// THE DEFECT (finding M-013): TRENCH's 8 vertices are byte-identical to the ROM
// wall panel `.WP WPN` (WSOBJ.MAC:560-571, `.S=8`: outer rect ±256/±192, inner
// rect ±128/±64). But `.WGD WPN` (WSOBJ.MAC:1803-1813) strokes ONLY the two
// rectangles —
//     PLOT 0 / DRAWTO 1,2,3,0        ← outer square, edges 0-1,1-2,2-3,3-0
//     BDRAWTO 4,5,6,7,4              ← inner square, edges 4-5,5-6,6-7,7-4
// — in VGCGRN. Story 8-5 ADDED four "catwalk rail" edges [0,4],[1,5],[2,6],[3,7]
// the ROM never draws, bridging the two rings into one component. M-013 drops
// them. Separately, TRENCH_SQUARE is a hand-authored flat 80×80 square — a second,
// geometrically-wrong stand-in for the SAME WPN wall panel — reconciled here onto
// WPN's concentric-rectangle geometry.
//
// This INVERTS story 8-5's "the trench reads as one connected channel" guard
// (tests/core/models.test.ts): those rails were the fabrication, so the two rings
// are now correctly DISJOINT. That guard is re-seated in models.test.ts to match.

import { describe, it, expect } from 'vitest'
import { TRENCH, TRENCH_SQUARE, type Model3D } from '../../src/core/models'

/** Undirected edge key so [a,b] and [b,a] compare equal. */
const key = (e: readonly [number, number]) => (e[0] < e[1] ? `${e[0]}-${e[1]}` : `${e[1]}-${e[0]}`)
const edgeSet = (m: Model3D) => new Set(m.edges.map(key))

// `.WGD WPN` strokes: outer DRAWTO 1,2,3,0 and inner BDRAWTO 4,5,6,7,4.
const WPN_OUTER = [[0, 1], [1, 2], [2, 3], [3, 0]] as const
const WPN_INNER = [[4, 5], [5, 6], [6, 7], [7, 4]] as const
// The four rails story 8-5 fabricated and M-013 removes.
const FABRICATED_RAILS = [[0, 4], [1, 5], [2, 6], [3, 7]] as const

describe('sw7-6 M-013 — TRENCH matches `.WGD WPN`: two rectangles, no catwalk rails', () => {
  it('keeps WPN’s 8 vertices (outer ±256/±192, inner ±128/±64) — the geometry was always right', () => {
    expect(TRENCH.vertices).toEqual([
      [-256, 0, -192], [-256, 0, 192], [256, 0, 192], [256, 0, -192], // 0-3 outer
      [-128, 0, -64], [-128, 0, 64], [128, 0, 64], [128, 0, -64], // 4-7 inner
    ])
  })

  it('strokes EXACTLY the two WPN rectangles — 8 edges, no more', () => {
    const edges = edgeSet(TRENCH)
    for (const e of [...WPN_OUTER, ...WPN_INNER]) expect(edges.has(key(e))).toBe(true)
    expect(TRENCH.edges).toHaveLength(8)
    expect(edges.size).toBe(8)
  })

  it('does NOT stroke any of the 4 fabricated catwalk rails [0,4],[1,5],[2,6],[3,7]', () => {
    const edges = edgeSet(TRENCH)
    for (const rail of FABRICATED_RAILS) {
      expect(edges.has(key(rail)), `rail ${key(rail)} must be gone (ROM never draws it)`).toBe(false)
    }
  })

  it('the two rings are DISJOINT — no edge bridges an outer vertex (0-3) to an inner one (4-7)', () => {
    // The inversion of story 8-5's "single connected component" guard: `.WGD WPN`
    // draws the rings separately, so a cross-ring edge is by definition fabrication.
    for (const e of TRENCH.edges) {
      const crosses = (e[0] <= 3) !== (e[1] <= 3)
      expect(crosses, `edge ${key(e)} bridges the rings — that is the removed rail`).toBe(false)
    }
  })
})

describe('sw7-6 M-013 — TRENCH_SQUARE reconciled onto WPN (not a flat 80×80 square)', () => {
  it('is no longer the geometrically-wrong flat 80×80 single square', () => {
    // The old shape was [[-40,-40,0],[40,-40,0],[40,40,0],[-40,40,0]] — four verts,
    // a single rectangle in the x/y plane. M-013 calls it a wrong stand-in for WPN.
    expect(TRENCH_SQUARE.vertices).not.toEqual([
      [-40, -40, 0], [40, -40, 0], [40, 40, 0], [-40, 40, 0],
    ])
    expect(TRENCH_SQUARE.vertices.length).not.toBe(4)
  })

  it('carries WPN’s concentric-rectangle geometry (the same wall panel TRENCH is)', () => {
    // Reconciled onto `.WP WPN`: two concentric rectangles, ±256/±192 and ±128/±64.
    expect(TRENCH_SQUARE.vertices).toEqual(TRENCH.vertices)
    // And strokes them WPN's way — the two rectangles, no fabricated rails.
    const edges = edgeSet(TRENCH_SQUARE)
    for (const e of [...WPN_OUTER, ...WPN_INNER]) expect(edges.has(key(e))).toBe(true)
    for (const rail of FABRICATED_RAILS) expect(edges.has(key(rail))).toBe(false)
  })
})
