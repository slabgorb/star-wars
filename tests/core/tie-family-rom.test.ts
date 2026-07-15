// tests/core/tie-family-rom.test.ts
//
// Story sw5-3 — RED phase (Imperator Furiosa / TEA): the TIE family's EDGES
// (TIE_FIGHTER, TIE_WING_FRAG_1/2/3) are re-ported from the ROM draw lists,
// replacing story 8-10's heuristic reconstruction. Sibling of sw5-2 (DARTH_TIE).
//
// THE DEFECT. models.ts's own TIE_FIGHTER doc comment admits its edges were
// "RE-AUTHORED by structure ... The disassembly gives only vertices, so edges
// are hand-authored." The contact-sheet audit (sw5-1) then measured what that
// authoring cost, versus what WSOBJ.MAC actually draws:
//
//     TIE : 1 ROM edge missing, 3 fabricated   (.WL TIE)
//     TI1 : 1 ROM edge missing, 0 fabricated    (.WL TI1)
//     TI2 : 1 ROM edge missing, 0 fabricated    (.WL2 TI2 — same list as TI1)
//     TI3 : 3 ROM edges missing, 0 fabricated   (.WL TI3)
//
// The vertices, by contrast, are already the ROM's byte-for-byte (verified
// below) — this story is edges only.
//
// THE HEADLINE FINDING (AC-2). The wing fragments' spider ladder joins the fin's
// small circle (idx 6-11) to the strut circle (idx 12-17) with rungs i<->i+6.
// The port authored FIVE of the six: 7-13, 8-14, 9-15, 10-16, 11-17 — and
// dropped 6-12. In the ROM that rung is not a "ladder rung" at all: it is the
// `.LD` beam that STITCHES the two circles, `.LD 13,...` continuing from the
// beam the inner circle left at source point 7 (idx 6). The port re-authored the
// strut circle as a standalone closed hexagon and lost the stitch. Every one of
// the six missing ROM edges across the family is exactly this: a `.LD`
// beam-continuation the author replaced with an isolated closed ring.
//
// GROUND TRUTH is WSOBJ.MAC (~/Projects/star-wars-1983-source-text), the 1983
// Atari source. The draw lists below are transcribed BY HAND from `.WL TIE`
// (WSOBJ.MAC:1352-1367), `.WL TI1`/`.WL2 TI2` (1374-1382) and `.WL TI3`
// (1389-1422), and decoded here by an INDEPENDENT re-implementation of the AVG
// pen macros — NOT read out of `romModels.generated.ts`. The bake is then checked
// against this hand oracle (see "the ROM oracle" below), so the port AND the bake
// are each verified against WSOBJ.MAC rather than merely against each other.
// (Asserting `TIE_FIGHTER.edges === ROM_MODELS.TIE.edges` would prove only that
// two artifacts agree; a bake regression would drag the port down and stay green.)
//
// PEN SEMANTICS (sw5-1's parser contract, re-implemented independently below):
//   .BD a,b,c,…   Blank-move (pen UP) to a, then DRAW a-b, b-c, … (visible lines).
//   .LD a,b,c,…   Line-draw CONTINUING from the current beam: DRAW beam-a, a-b, …
//                 (the first stroke runs from wherever the previous run left off).
//
// INDEX BASE. As with `.WL RTH`, the source vertex table opens with an origin
// point that the bake drops, so the draw list's indices are 1-BASED over the
// source and map to our 0-based arrays as `arrayIndex = sourceIndex - 1`. This is
// not assumed — the hand decode reproduces the bake byte-for-byte, in order (see
// the oracle self-check), which is only possible under this exact mapping.
//
// NO SELF-EDGE HERE. Unlike `.WL RTH` (whose `.BD 31,23,22,21,21,24,23` draws a
// degenerate [20,20]), none of the four TIE-family draw lists repeats an index,
// so none carries a self-edge (asserted below). AC-5 is therefore satisfied by
// construction — pinned so a future re-port that smuggled one in would be caught.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  TIE_FIGHTER,
  TIE_WING_FRAG_1,
  TIE_WING_FRAG_2,
  TIE_WING_FRAG_3,
  type Model3D,
} from '../../src/core/models'
import { ROM_MODELS } from '../../src/tools/romModels.generated'
import { diffEdges, pairModels, verdictFor } from '../../src/tools/romCompare'
import type { Vec3 } from '@arcade/shared/math3d'

type Edge = readonly [number, number]
type Draw = readonly { pen: 'BD' | 'LD'; pts: readonly number[] }[]

// --- the independent oracle: the `.WL` draw lists, verbatim, decoded by hand ---

/** `.WL TIE` (WSOBJ.MAC:1352-1367), pen kind + SOURCE (1-based) point indices. */
const TIE_DRAW: Draw = [
  { pen: 'BD', pts: [1, 2, 3, 4, 5, 6, 1] },
  { pen: 'LD', pts: [7, 8, 9, 10, 11, 12, 7] },
  { pen: 'LD', pts: [25, 26, 27, 28, 29, 25] },
  { pen: 'LD', pts: [37, 38, 39, 47] },
  { pen: 'BD', pts: [39, 40, 41, 49] },
  { pen: 'BD', pts: [41, 42, 43, 44, 37] },
  { pen: 'LD', pts: [45, 46, 47, 48, 49, 50, 51, 52, 45] },
  { pen: 'LD', pts: [31, 32, 33, 34, 35, 36, 31] },
  { pen: 'LD', pts: [19, 20, 21, 22, 23, 24, 19] },
  { pen: 'LD', pts: [13, 14, 15, 16, 17, 18, 13] },
  { pen: 'BD', pts: [14, 20, 32, 46, 38, 26, 8, 2] },
  { pen: 'BD', pts: [3, 9, 27, 40] },
  { pen: 'BD', pts: [48, 33, 21, 15] },
  { pen: 'BD', pts: [16, 22, 34, 50, 42, 28, 10, 4] },
  { pen: 'BD', pts: [5, 11, 29, 43, 51, 35, 23, 17] },
  { pen: 'BD', pts: [18, 24, 36, 52, 44, 30, 12, 6] },
]

/** `.WL TI1` == `.WL2 TI2` (WSOBJ.MAC:1374-1382) — one shared draw list. The
 *  `.LD 13,…` stitch on the 2nd line is the 6-12 rung (source 7->13). */
const WING_DRAW: Draw = [
  { pen: 'BD', pts: [7, 8, 9, 10, 11, 12, 7] }, // inner circle of the fin
  { pen: 'LD', pts: [13, 14, 15, 16, 17, 18, 13] }, // strut circle — .LD stitches 7->13 (idx 6-12)
  { pen: 'BD', pts: [7, 1, 2, 3, 4, 5, 6, 1] }, // outer circle of the fin
  { pen: 'BD', pts: [2, 8, 14] }, // spider lines
  { pen: 'BD', pts: [15, 9, 3] },
  { pen: 'BD', pts: [4, 10, 16] },
  { pen: 'BD', pts: [17, 11, 5] },
  { pen: 'BD', pts: [6, 12, 18] },
]

/** `.WL TI3` (WSOBJ.MAC:1389-1422) — the centre cabin (uncommented lines only). */
const TI3_DRAW: Draw = [
  { pen: 'BD', pts: [1, 2, 3, 4, 5, 1] },
  { pen: 'LD', pts: [13, 14, 15, 23] },
  { pen: 'BD', pts: [15, 16, 17, 25] },
  { pen: 'BD', pts: [17, 18, 19, 20, 13] },
  { pen: 'LD', pts: [21, 22, 23, 24, 25, 26, 27, 28, 21] },
  { pen: 'LD', pts: [7, 8, 9, 10, 11, 12, 7] },
  { pen: 'BD', pts: [8, 22, 14, 2] },
  { pen: 'BD', pts: [3, 16] },
  { pen: 'BD', pts: [24, 9] },
  { pen: 'BD', pts: [10, 26, 18, 4] },
  { pen: 'BD', pts: [5, 19, 27, 11] },
  { pen: 'BD', pts: [12, 28, 20, 6] },
]

/** Re-implements the AVG pen macros over 1-based source indices, emitting 0-based
 *  edges. Deliberately NOT sw5-1's parser — an independent decode of the same
 *  spec, so agreement with the bake means something. (Same routine as sw5-2's.) */
function decodeDrawList(draw: Draw): Edge[] {
  const edges: Edge[] = []
  let beam: number | null = null
  for (const { pen, pts } of draw) {
    const idx = pts.map((p) => p - 1)
    if (pen === 'BD') {
      beam = idx[0] // pen up to the first point, then draw to each remaining point
      for (let i = 1; i < idx.length; i++) {
        edges.push([beam, idx[i]])
        beam = idx[i]
      }
    } else {
      if (beam === null) throw new Error('.LD with no prior beam position')
      for (const p of idx) {
        edges.push([beam, p]) // continue drawing from the current beam through every point
        beam = p
      }
    }
  }
  return edges
}

// --- helpers ----------------------------------------------------------------

/** Orientation-independent edge identity, so [1,3] and [3,1] are one edge. */
const key = ([a, b]: Edge): string => (a <= b ? `${a}-${b}` : `${b}-${a}`)
const isSelf = ([a, b]: Edge): boolean => a === b
const edgeSet = (edges: readonly Edge[]): Set<string> =>
  new Set(edges.filter((e) => !isSelf(e)).map(key))
const romOf = (name: string) => ROM_MODELS.find((m) => m.name === name)!

/** ROM object name -> its independent oracle and its port model. TI2 shares
 *  TI1's draw list (`.WL TI1` / `.WL2 TI2`), so both decode WING_DRAW. */
const FAMILY: readonly {
  rom: string
  port: Model3D
  portName: string
  draw: Draw
  verts: number
}[] = [
  { rom: 'TIE', port: TIE_FIGHTER, portName: 'TIE Fighter', draw: TIE_DRAW, verts: 52 },
  { rom: 'TI1', port: TIE_WING_FRAG_1, portName: 'TIE Fragment Left Wing', draw: WING_DRAW, verts: 18 },
  { rom: 'TI2', port: TIE_WING_FRAG_2, portName: 'TIE Fragment Right Wing', draw: WING_DRAW, verts: 18 },
  { rom: 'TI3', port: TIE_WING_FRAG_3, portName: 'TIE Fragment Cabin', draw: TI3_DRAW, verts: 28 },
]

const ORACLE: Record<string, Edge[]> = Object.fromEntries(
  FAMILY.map((f) => [f.rom, decodeDrawList(f.draw)]),
)

// ---------------------------------------------------------------------------
// The oracle itself. If the hand-decoded draw lists and the bake disagree, one
// of them is wrong and every other assertion here is worthless — so check that
// FIRST, against WSOBJ.MAC (via the transcription) rather than against models.ts.
// ---------------------------------------------------------------------------

describe('sw5-3 — the ROM oracle (hand-decoded from WSOBJ.MAC `.WL TIE/TI1/TI2/TI3`)', () => {
  it.each(FAMILY)(
    '$rom: the hand decode reproduces the baked edge list EXACTLY, in ROM order',
    ({ rom }) => {
      // Independent re-implementation of the pen macros vs sw5-1's parser output.
      // Ordered deep equality (not a set) — the bake preserves ROM stroke order, so
      // a decoder bug that reordered edges must fail here, not hide behind a set.
      expect(ORACLE[rom]).toEqual(romOf(rom).edges.map(([a, b]) => [a, b]))
      expect(romOf(rom).hasDrawList, `sw5-1 recovered .WL ${rom}`).toBe(true)
      expect(romOf(rom).scale, '.S = 13.').toBe(13)
    },
  )

  it('carries NO degenerate self-edge in ANY of the four lists (unlike `.WL RTH`)', () => {
    // AC-5's premise for this family: there is nothing to accidentally copy. RTH
    // had `21,21`; the TIE family's draw lists never repeat an index. Pin it, so
    // "the port carries no self-edge" (AC-5, below) is a property of the ROM here,
    // not a coincidence of the port.
    for (const { rom } of FAMILY) {
      expect(ORACLE[rom].filter(isSelf), `${rom} has no self-edge`).toEqual([])
    }
  })

  it('TI1 and TI2 decode to the SAME edge list (shared `.WL TI1` / `.WL2 TI2`)', () => {
    expect(ORACLE.TI1).toEqual(ORACLE.TI2)
  })
})

// ---------------------------------------------------------------------------
// AC-4 — VERTICES ARE UNCHANGED. They already match the ROM byte-for-byte; this
// story must not touch them (they are what the contact sheet's vertex guard
// requires before it will diff edges at all).
// ---------------------------------------------------------------------------

describe('sw5-3 AC-4 — the TIE family vertices are the ROM\'s, untouched', () => {
  it.each(FAMILY)('$rom: deep-equals the ROM $rom point table, in ROM order', ({ rom, port, verts }) => {
    // DEEP equality: edges are INDICES into this array, so a reorder would
    // silently repoint every edge while both arrays still "look" right.
    expect(port.vertices).toEqual(romOf(rom).vertices)
    expect(port.vertices).toHaveLength(verts)
  })

  it('TIE_FIGHTER vertex 0 is [-130,-208,234] — `.P -10,-16,18` scaled by `.S=13.`', () => {
    const S = 13
    const v0: Vec3 = [-10 * S, -16 * S, 18 * S]
    expect(TIE_FIGHTER.vertices[0]).toEqual(v0)
    expect(v0).toEqual([-130, -208, 234])
  })

  it('TIE_WING_FRAG_3 is still TIE_FIGHTER\'s aft 28 vertices (verts 24-51), sliced not re-typed', () => {
    expect(TIE_WING_FRAG_3.vertices).toEqual(TIE_FIGHTER.vertices.slice(-28))
  })
})

// ---------------------------------------------------------------------------
// AC-1 — every port edge list IS its ROM draw list: every ROM edge, and no
// others. One bidirectional set-equality per model against the independent
// oracle. This is the strongest pin; AC-2/AC-3 name specific witnesses so a
// PARTIAL re-port fails loudly rather than only in the aggregate.
// ---------------------------------------------------------------------------

describe('sw5-3 AC-1 — the TIE family edges ARE the ROM draw lists, not authored', () => {
  it.each(FAMILY)('$rom -> $portName: edges set-equal the ROM oracle, no drift either way', ({ rom, port }) => {
    expect(edgeSet(port.edges)).toEqual(edgeSet(ORACLE[rom]))
  })

  it.each(FAMILY)('$rom: diffs clean against the ROM via the real tool (romCompare.diffEdges)', ({ rom, port }) => {
    const d = diffEdges(ORACLE[rom], port.edges)
    expect(d.onlyInRom, `${rom}: ROM edges the port is still missing`).toEqual([])
    expect(d.onlyInPort, `${rom}: fabricated edges the port must drop`).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// AC-2 — the fragments' missing 6-12 rung is restored. The port shipped a
// five-rung spider ladder (7-13, 8-14, 9-15, 10-16, 11-17); the ROM has all six.
// ---------------------------------------------------------------------------

describe('sw5-3 AC-2 — the wing fragments\' 6-12 rung is restored', () => {
  /** The spider ladder: fin small-circle (idx 6-11) <-> strut circle (idx 12-17),
   *  rung i <-> i+6. The full ROM ladder is all six; the port dropped 6-12. */
  const RUNGS: readonly Edge[] = [[6, 12], [7, 13], [8, 14], [9, 15], [10, 16], [11, 17]]

  it('all six rungs 6-12 … 11-17 are genuine ROM edges (present in the hand oracle)', () => {
    // Guard the guard: prove the ladder this AC names is actually in `.WL TI1`,
    // so the test is pinning the ROM, not an arbitrary list.
    const rom = edgeSet(ORACLE.TI1)
    for (const r of RUNGS) expect(rom.has(key(r)), `${key(r)} is a ROM edge`).toBe(true)
  })

  it.each([
    { name: 'TIE_WING_FRAG_1 (TI1)', model: TIE_WING_FRAG_1 },
    { name: 'TIE_WING_FRAG_2 (TI2)', model: TIE_WING_FRAG_2 },
  ])('$name carries the full six-rung ladder, including 6-12', ({ model }) => {
    const present = new Set(model.edges.map(key))
    for (const r of RUNGS) expect(present.has(key(r)), `${key(r)} present`).toBe(true)
    // The specific witness this story is named for: the sixth, previously-dropped rung.
    expect(present.has(key([6, 12])), 'the 6-12 rung the port omitted').toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC-3 — the 3 TIE_FIGHTER edges that appear NOWHERE in the ROM are removed, and
// the 1 ROM edge the port lacked is restored. Named explicitly so a re-port that
// drops the fabrications but forgets the missing edge (or vice versa) fails loud.
// ---------------------------------------------------------------------------

describe('sw5-3 AC-3 — TIE_FIGHTER\'s fabricated edges are gone, its missing one restored', () => {
  // The audit's punch-list for TIE, re-derived below from the oracle so it can
  // never drift from `.WL TIE`.
  const FABRICATED: readonly Edge[] = [[28, 29], [24, 29], [39, 47]] // in port, in NO ROM draw
  const MISSING: readonly Edge[] = [[24, 28]] // the ROM cockpit-cap pentagon closure

  it('the named fabrications really are absent from `.WL TIE`, and the missing edge present', () => {
    // Prove the punch-list is the ROM's, not an arbitrary pick.
    const rom = edgeSet(ORACLE.TIE)
    for (const f of FABRICATED) expect(rom.has(key(f)), `${key(f)} is NOT a ROM edge`).toBe(false)
    for (const m of MISSING) expect(rom.has(key(m)), `${key(m)} IS a ROM edge`).toBe(true)
  })

  it('TIE_FIGHTER drops all 3 fabricated edges', () => {
    const present = new Set(TIE_FIGHTER.edges.map(key))
    for (const f of FABRICATED) expect(present.has(key(f)), `fabricated ${key(f)} removed`).toBe(false)
  })

  it('TIE_FIGHTER restores the missing ROM edge [24,28]', () => {
    const present = new Set(TIE_FIGHTER.edges.map(key))
    for (const m of MISSING) expect(present.has(key(m)), `ROM edge ${key(m)} present`).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC-3 (cabin half) — TI3's three missing beam-continuation rungs are restored.
// Explicit witnesses, same shape as the wing's 6-12 rung.
// ---------------------------------------------------------------------------

describe('sw5-3 — TIE_WING_FRAG_3 (TI3) restores its 3 missing `.LD` stitch rungs', () => {
  const TI3_MISSING: readonly Edge[] = [[0, 12], [12, 20], [6, 20]]

  it('the three are genuine ROM edges (present in the TI3 oracle)', () => {
    const rom = edgeSet(ORACLE.TI3)
    for (const m of TI3_MISSING) expect(rom.has(key(m)), `${key(m)} is a ROM edge`).toBe(true)
  })

  it('TIE_WING_FRAG_3 carries all three', () => {
    const present = new Set(TIE_WING_FRAG_3.edges.map(key))
    for (const m of TI3_MISSING) expect(present.has(key(m)), `${key(m)} present`).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC-5 — no degenerate self-edge is carried into any port model. GREEN keep-guard
// (the family's draw lists have none — proven above), pinned so a re-port can't
// introduce one; a self-edge would also trip models.test.ts's universal guard.
// ---------------------------------------------------------------------------

describe('sw5-3 AC-5 — no port model carries a degenerate self-edge', () => {
  it.each(FAMILY)('$portName carries no self-edge', ({ port }) => {
    expect(port.edges.some(isSelf), 'no [n,n] edge').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC-6 — the contact sheet clears all four TIE-family pairs, for real. '✓ edges
// match' is the one string the tool will not print unless a real comparison ran
// (verticesMatch true AND hasDrawList true AND zero drift) — assert the TEXT.
// ---------------------------------------------------------------------------

describe('sw5-3 AC-6 — the contact sheet clears all four TIE-family pairs', () => {
  const pairs = pairModels()
  it.each(FAMILY)('$rom -> $portName: 0/0 drift and verdict "✓ edges match"', ({ rom, portName }) => {
    const pair = pairs.find((p) => p.romName === rom)!
    expect(pair.port?.name).toBe(portName)
    expect(pair.verticesMatch, 'vertices already match — the diff is meaningful').toBe(true)
    expect(pair.onlyInRom).toEqual([])
    expect(pair.onlyInPort).toEqual([])
    const v = verdictFor(pair)
    expect(v.text).toBe('✓ edges match')
    expect(v.drift).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// PROVENANCE — TIE_FIGHTER's doc comment must reflect AC-1: its edges ARE the ROM
// draw list, no longer "hand-authored". sw5-2 explicitly deferred finishing this
// to sw5-3 ("TIE_FIGHTER's own re-port is story sw5-3"). Scope extends AC-1 to
// the comment; logged as a TEA deviation. The shared FILE HEADER (which also
// names TIE_FIGHTER as RE-AUTHORED) is left to a Delivery Finding — a header
// regex is brittle, and it legitimately discusses other models.
// ---------------------------------------------------------------------------

describe('sw5-3 provenance — TIE_FIGHTER\'s doc comment tells the truth', () => {
  /** models.ts as SOURCE TEXT — the claim lives in a comment, invisible to any
   *  import-based assertion. */
  const source = readFileSync(new URL('../../src/core/models.ts', import.meta.url), 'utf8')

  /** TIE_FIGHTER's own declaration + doc comment: from `export const TIE_FIGHTER`
   *  to the next `export const`. Scoped deliberately — a whole-file scan would
   *  match the shared header (which names other models) and fail for the wrong
   *  reason. */
  const block = (): string => {
    const start = source.indexOf('export const TIE_FIGHTER')
    expect(start, 'TIE_FIGHTER is still exported from models.ts').toBeGreaterThan(-1)
    const end = source.indexOf('export const', start + 1)
    return source.slice(start, end === -1 ? undefined : end)
  }

  it('cites `.WL TIE` as the source of its edges', () => {
    expect(block()).toMatch(/\.WL TIE/)
  })

  it('no longer claims its edges are RE-AUTHORED / hand-authored', () => {
    // The old comment reads "RE-AUTHORED by structure ... edges are hand-authored".
    // That is the fabrication this story removes; leaving it is a confident lie.
    expect(block(), 'edges are no longer authored').not.toMatch(/RE-AUTHORED|hand-authored/i)
  })
})
