// tests/core/darth-tie-rom.test.ts
//
// Story sw5-2 — RED phase (Han Solo / TEA): the Darth Vader TIE's EDGES are
// re-ported from the ROM draw list, replacing story 8-10's heuristic
// reconstruction.
//
// THE DEFECT. models.ts's own DARTH_TIE doc comment admits its edges were
// "RE-AUTHORED by structure ... octagon rim + inner square hub + spokes +
// 4-strut pylon". The contact-sheet audit (sw5-1) then measured what that cost:
// of the port's 104 edges, 44 appear NOWHERE in the ROM (invented), and 12 real
// ROM edges were never carried. The vertices, by contrast, are already the ROM's
// byte-for-byte (verified below) — this story is edges only.
//
// GROUND TRUTH is WSOBJ.MAC (~/Projects/star-wars-1983-source-text), the 1983
// Atari source. The draw list below is transcribed BY HAND from `.WL RTH`
// (WSOBJ.MAC:1427-1479) and decoded here by an INDEPENDENT re-implementation of
// the AVG pen macros — NOT read out of `romModels.generated.ts`. The bake is
// then checked against this hand oracle (see "the ROM oracle" below), so the port
// and the bake are each verified against WSOBJ.MAC rather than merely against
// each other. (A test that asserts `DARTH_TIE.edges === ROM_MODELS.RTH.edges`
// proves only that two artifacts agree; if the bake ever regressed it would drag
// the port down with it and stay green.)
//
// -- THE DRAW LIST (WSOBJ.MAC:1427-1479) -------------------------------------
//
//   .WL RTH                 ;DARTH VADER TIE FIGHTER
//     ;RIGHT WING            .BD 8,1,2,3,8,7,4,3 / .BD 4,5,6,7
//     ;RIGHT STRUT           .BD 12,11,10,9,12,28 / .BD 27,11 / .BD 10,26 / .BD 25,9
//     ;BODY                  .BD 37,36,... / .LD 38,46,... / .BD 39,36 / ...
//     ;LEFT STRUT            .BD 31,23,22,21,21,24,23 / ...
//     ;LEFT WING             .BD 19,18,17,16,19,20,15,16 / .BD 15,14,13,20
//     ;FRONT WINDOW          .BD 49,50,51,52,53,54,55,56,49,53 / ...
//   .LEND
//
// PEN SEMANTICS (sw5-1's parser contract, re-implemented independently below):
//   .BD a,b,c,…   Blank-move (pen UP) to a, then DRAW a-b, b-c, … (visible lines).
//   .LD a,b,c,…   Line-draw CONTINUING from the current beam: DRAW beam-a, a-b, …
//                 (the first stroke runs from wherever the previous run left off).
//
// INDEX BASE. `.WP RTH` opens with `.P 0,0,0` — the object origin, index 0, which
// the bake drops — so the first *rendered* vertex, `.P -18,-18,13` (";1-8 RIGHT
// OUTER WING"), is source point 1. The draw list's indices are therefore 1-BASED
// over the source, and map to our 0-based array as `arrayIndex = sourceIndex - 1`.
//
// ⚠ THE SELF-EDGE. `.BD 31,23,22,21,21,24,23` walks to source point 21 twice in a
// row → array index 20 twice → a degenerate edge [20,20]. On the cabinet that
// draws a zero-length line; it is not connectivity. The ROM oracle KEEPS it (it is
// the audit record), but the port must DROP it (AC-5) — a self-edge trips
// models.test.ts's universal "no degenerate edges" invariant.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DARTH_TIE } from '../../src/core/models'
import { ROM_MODELS } from '../../src/tools/romModels.generated'
import { diffEdges, pairModels, verdictFor } from '../../src/tools/romCompare'
import type { Vec3 } from '@arcade/shared/math3d'

type Edge = readonly [number, number]

// --- the independent oracle: `.WL RTH`, verbatim, decoded by hand -------------

/** One `.WL RTH` macro call: pen kind + its SOURCE (1-based) point indices,
 *  copied line-for-line from WSOBJ.MAC:1428-1479 (uncommented lines only). */
const RTH_DRAW: readonly { pen: 'BD' | 'LD'; pts: readonly number[] }[] = [
  // ;RIGHT WING
  { pen: 'BD', pts: [8, 1, 2, 3, 8, 7, 4, 3] },
  { pen: 'BD', pts: [4, 5, 6, 7] },
  // ;RIGHT STRUT
  { pen: 'BD', pts: [12, 11, 10, 9, 12, 28] },
  { pen: 'BD', pts: [27, 11] },
  { pen: 'BD', pts: [10, 26] },
  { pen: 'BD', pts: [25, 9] },
  // ;BODY
  { pen: 'BD', pts: [37, 36, 35, 34, 42, 43, 44, 45, 37] },
  { pen: 'LD', pts: [38, 46, 47, 48, 41, 33, 40, 39, 38] },
  { pen: 'BD', pts: [39, 36] },
  { pen: 'BD', pts: [35, 40] },
  { pen: 'BD', pts: [33, 34] },
  { pen: 'BD', pts: [42, 41] },
  { pen: 'BD', pts: [48, 43] },
  { pen: 'BD', pts: [44, 47] },
  { pen: 'BD', pts: [46, 45] },
  // ;LEFT STRUT
  { pen: 'BD', pts: [31, 23, 22, 21, 21, 24, 23] }, // the `21,21` self-edge lives here
  { pen: 'BD', pts: [22, 30] },
  { pen: 'BD', pts: [29, 21] },
  { pen: 'BD', pts: [24, 32] },
  // ;LEFT WING
  { pen: 'BD', pts: [19, 18, 17, 16, 19, 20, 15, 16] },
  { pen: 'BD', pts: [15, 14, 13, 20] },
  // ;FRONT WINDOW
  { pen: 'BD', pts: [49, 50, 51, 52, 53, 54, 55, 56, 49, 53] },
  { pen: 'BD', pts: [54, 50] },
  { pen: 'BD', pts: [51, 55] },
  { pen: 'BD', pts: [56, 52] },
]

/** Re-implements the AVG pen macros over 1-based source indices, emitting
 *  0-based edges. Deliberately NOT sw5-1's parser — an independent decode of the
 *  same spec, so agreement with the bake means something. */
function decodeDrawList(draw: typeof RTH_DRAW): Edge[] {
  const edges: Edge[] = []
  let beam: number | null = null
  for (const { pen, pts } of draw) {
    const idx = pts.map((p) => p - 1)
    if (pen === 'BD') {
      // pen up to the first point, then draw to each remaining point
      beam = idx[0]
      for (let i = 1; i < idx.length; i++) {
        edges.push([beam, idx[i]])
        beam = idx[i]
      }
    } else {
      // continue drawing from the current beam through every point
      if (beam === null) throw new Error('.LD with no prior beam position')
      for (const p of idx) {
        edges.push([beam, p])
        beam = p
      }
    }
  }
  return edges
}

const ORACLE: readonly Edge[] = decodeDrawList(RTH_DRAW)

// --- helpers ----------------------------------------------------------------

/** Orientation-independent edge identity, so [1,3] and [3,1] are one edge. */
const key = ([a, b]: Edge): string => (a <= b ? `${a}-${b}` : `${b}-${a}`)
const isSelf = ([a, b]: Edge): boolean => a === b
const edgeSet = (edges: readonly Edge[]): Set<string> =>
  new Set(edges.filter((e) => !isSelf(e)).map(key))
const romRth = () => ROM_MODELS.find((m) => m.name === 'RTH')!

// ---------------------------------------------------------------------------
// The oracle itself. If the hand-decoded draw list and the bake disagree, one of
// them is wrong and every other assertion here is worthless — so check that
// FIRST, against WSOBJ.MAC (via the transcription) rather than against models.ts.
// ---------------------------------------------------------------------------

describe('sw5-2 — the ROM oracle (hand-decoded from WSOBJ.MAC `.WL RTH`)', () => {
  it('the hand decode reproduces the baked RTH edge list EXACTLY, in ROM order', () => {
    // Independent re-implementation of the pen macros vs sw5-1's parser output.
    // Ordered deep equality (not a set) — the bake preserves ROM stroke order, so
    // a decoder bug that reordered edges must fail here, not hide behind a set.
    expect(ORACLE).toEqual(romRth().edges.map(([a, b]) => [a, b]))
    expect(romRth().hasDrawList, 'sw5-1 recovered `.WL RTH`').toBe(true)
    expect(romRth().scale, '.S = 10.').toBe(10)
  })

  it('carries EXACTLY one degenerate self-edge, [20,20], from `21,21`', () => {
    // AC-5's premise: the ROM really does draw a zero-length line here (source
    // `.BD 31,23,22,21,21,24,23`). Pin that it is present in the ROM AND that it
    // is the only one — so "the port drops it" is a deliberate omission of a real
    // ROM quirk, not a coincidence.
    const selfEdges = ORACLE.filter(isSelf)
    expect(selfEdges).toEqual([[20, 20]])
  })

  it('has 72 real (non-self) undirected edges', () => {
    expect(edgeSet(ORACLE).size).toBe(72)
  })
})

// ---------------------------------------------------------------------------
// AC-4 — VERTICES ARE UNCHANGED. They already match the ROM byte-for-byte; this
// story must not touch them (they are what the contact sheet's vertex guard
// requires before it will diff edges at all).
// ---------------------------------------------------------------------------

describe('sw5-2 AC-4 — DARTH_TIE vertices are the ROM\'s, untouched', () => {
  it('deep-equals ROM RTH\'s 56-point table, in ROM order', () => {
    // DEEP equality: edges are INDICES into this array, so a reorder would
    // silently repoint every edge while both arrays still "look" right.
    expect(DARTH_TIE.vertices).toEqual(romRth().vertices)
    expect(DARTH_TIE.vertices).toHaveLength(56)
  })

  it('vertex 0 is [-180,-180,130] — `.P -18,-18,13` scaled by `.S=10.`', () => {
    const S = 10
    const v0: Vec3 = [-18 * S, -18 * S, 13 * S]
    expect(DARTH_TIE.vertices[0]).toEqual(v0)
    expect(v0).toEqual([-180, -180, 130])
  })
})

// ---------------------------------------------------------------------------
// AC-1 / AC-2 / AC-6 — the edges ARE `.WL RTH`: every ROM edge, and no others.
// ---------------------------------------------------------------------------

describe('sw5-2 AC-1/AC-2 — DARTH_TIE.edges are `.WL RTH`, not authored', () => {
  it('is exactly the ROM draw list\'s 72 real edges — set-equal, no drift either way', () => {
    // AC-1 (derived from `.WL RTH`) + AC-2 (44 fabricated removed) + the ROM half
    // of AC-3 (12 missing restored), all in one bidirectional set-equality.
    expect(edgeSet(DARTH_TIE.edges)).toEqual(edgeSet(ORACLE))
  })

  it('carries exactly 72 edges (down from the authored 104) and NO self-edge', () => {
    // The port must not copy the ROM's [20,20] (AC-5), so it is the 72 real edges
    // and nothing else. A stray self-edge would also trip models.test.ts's
    // universal "no degenerate edges" guard.
    expect(DARTH_TIE.edges).toHaveLength(72)
    expect(DARTH_TIE.edges.some(isSelf), 'no degenerate self-edge').toBe(false)
  })

  it('diffs clean against the ROM: 0 in ROM not in port, 0 in port not in ROM', () => {
    // Via the real tool (romCompare.diffEdges), against the independent oracle.
    const d = diffEdges(ORACLE, DARTH_TIE.edges)
    expect(d.onlyInRom, 'the 12 real ROM edges are all present now').toEqual([])
    expect(d.onlyInPort, 'the 44 fabricated edges are all gone now').toEqual([])
  })

  it('a representative fabricated spoke ([0,8], the authored rim→hub spoke) is GONE', () => {
    // Concrete AC-2 witness: story 8-10 joined the wing octagon rim to its inner
    // square with spokes like [0,8]/[7,8]/[1,9]…; `.WL RTH` has none of them. If
    // any survives, the re-port copied structure the ROM never draws.
    const present = new Set(DARTH_TIE.edges.map(key))
    for (const fabricated of [[0, 8], [7, 8], [1, 9], [2, 9]] as Edge[]) {
      expect(present.has(key(fabricated)), `fabricated spoke ${key(fabricated)}`).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// AC-3 — the twelve ROM edges the port never had are restored. Named explicitly
// so a PARTIAL re-port (some pairs missing) fails loudly, not just the aggregate.
// ---------------------------------------------------------------------------

describe('sw5-2 AC-3 — the 12 restored ROM edges', () => {
  const present = () => new Set(DARTH_TIE.edges.map(key))

  // six bilateral cross-brace mirror pairs
  const CROSS_BRACES: readonly [Edge, Edge][] = [
    [[2, 7], [3, 6]], // right wing outer
    [[15, 18], [14, 19]], // left wing outer
    [[35, 38], [34, 39]], // body, lower belt
    [[42, 47], [43, 46]], // body, upper belt
  ]
  // the four front-window chords
  const WINDOW_CHORDS: readonly Edge[] = [[48, 52], [49, 53], [50, 54], [51, 55]]

  it.each(CROSS_BRACES)('restores the bilateral cross-brace pair %s / %s', (a, b) => {
    const p = present()
    expect(p.has(key(a)), `${key(a)} present`).toBe(true)
    expect(p.has(key(b)), `${key(b)} (its Y-mirror) present`).toBe(true)
  })

  it.each(WINDOW_CHORDS)('restores the front-window chord %s', (chord) => {
    expect(present().has(key(chord)), `${key(chord)} present`).toBe(true)
  })

  it('all twelve are genuinely ROM edges (present in the hand oracle)', () => {
    // Guard the guard: prove the edges this AC names are actually in `.WL RTH`,
    // so the test is pinning the ROM, not an arbitrary list.
    const rom = edgeSet(ORACLE)
    const twelve = [...CROSS_BRACES.flat(), ...WINDOW_CHORDS]
    expect(twelve).toHaveLength(12)
    for (const e of twelve) expect(rom.has(key(e)), `${key(e)} is a ROM edge`).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC-5 — the ROM's degenerate self-edge is NOT copied into the port.
// ---------------------------------------------------------------------------

describe('sw5-2 AC-5 — the degenerate self-edge [20,20] is dropped', () => {
  it('the ROM draws it but the port does not carry it', () => {
    // The ROM side is proven above; here assert the port omits exactly it.
    expect(edgeSet(ORACLE)).not.toContain('20-20') // filtered out of the real set
    expect(romRth().edges.some(([a, b]) => a === 20 && b === 20), 'ROM has [20,20]').toBe(true)
    expect(
      DARTH_TIE.edges.some(([a, b]) => a === 20 && b === 20),
      'port does NOT copy [20,20]',
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC-6 — the contact sheet reports a clean RTH → Darth Vader TIE, for real.
// ---------------------------------------------------------------------------

describe('sw5-2 AC-6 — the contact sheet clears RTH → Darth Vader TIE', () => {
  it('0 in ROM not in port · 0 in port not in ROM, and the verdict is "✓ edges match"', () => {
    // The headline deliverable, through the same pipeline the sheet renders.
    // '✓ edges match' is the one string the tool will not print unless a real
    // comparison actually ran (verticesMatch true AND hasDrawList true AND zero
    // drift) — so assert the TEXT, not just the counts.
    const pair = pairModels().find((p) => p.romName === 'RTH')!
    expect(pair.port?.name).toBe('Darth Vader TIE')
    expect(pair.verticesMatch, 'vertices already match — the diff is meaningful').toBe(true)
    expect(pair.onlyInRom).toEqual([])
    expect(pair.onlyInPort).toEqual([])
    const v = verdictFor(pair)
    expect(v.text).toBe('✓ edges match')
    expect(v.drift).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC-7 — the doc comment cites `.WL RTH` and drops the "re-authored" claim.
// ---------------------------------------------------------------------------

describe('sw5-2 AC-7 — DARTH_TIE\'s doc comment tells the truth', () => {
  /** models.ts as SOURCE TEXT — the claim lives in a comment, invisible to any
   *  import-based assertion. */
  const source = readFileSync(new URL('../../src/core/models.ts', import.meta.url), 'utf8')

  /** DARTH_TIE's own declaration + doc comment: from `export const DARTH_TIE` to
   *  the next `export const`. Scoped deliberately — the file's shared header still
   *  names TIE_FIGHTER as re-authored (sw5-3's territory), and a whole-file scan
   *  would fail for the wrong reason. */
  const block = (): string => {
    const start = source.indexOf('export const DARTH_TIE')
    expect(start, 'DARTH_TIE is still exported from models.ts').toBeGreaterThan(-1)
    const end = source.indexOf('export const', start + 1)
    return source.slice(start, end === -1 ? undefined : end)
  }

  it('cites `.WL RTH` as the source of its edges', () => {
    expect(block()).toMatch(/\.WL RTH/)
  })

  it('no longer claims a RE-AUTHORED ring structure', () => {
    // The old comment reads "RE-AUTHORED by structure ... octagon rim + inner
    // square hub + spokes + 4-strut pylon". That is the fabrication this story
    // removes; leaving it would be a confident lie in the file.
    expect(block(), 'the edges are no longer authored').not.toMatch(/RE-AUTHORED/i)
  })
})
