// tests/core/exhaust-port-rom.test.ts
//
// Story sw5-4 — RED phase (O'Brien / TEA): the trench exhaust port is re-ported
// from the ROM.
//
// GROUND TRUTH is WSOBJ.MAC (~/Projects/star-wars-1983-source-text), the 1983
// Atari source. The tables below are transcribed BY HAND from it, NOT read out
// of `romModels.generated.ts` — so the bake and the port are each checked
// against an INDEPENDENT oracle rather than against each other. (A test that
// asserts `EXHAUST_PORT === ROM_MODELS.PORT` proves only that two artifacts
// agree; if the bake ever regressed it would drag the port down with it and
// stay green.)
//
// -- THE POINT TABLE (WSOBJ.MAC:620-635) -------------------------------------
//
//   .WP PORT           ;THERMAL EXHAUST PORT
//   .S=8               ;GROUND OBJECT SCALING
//
//   .PH 0C, 0C,0       ;0-3 INNER CIRCLE     <- the PORTHOLE itself
//   .PH 14, 14,0       ;4-7 SUPPORT BERM
//   .PH 20, 20,0       ;8-15 BASE
//                      (each row ± in both x and y — four corners per ring)
//
//   .MACRO .PH .1,.2,.3
//   .WORD .1'*.S,.2'*.S,.3'*.S      -> a plain ×.S, with no GD$MDT-style offset
//
// So: THREE CONCENTRIC SQUARES, twelve points, ALL at third-component 0. models.ts
// instead ships an authored 8-vertex OCTAGON of radius ~70. That is this story's
// defect, and it is not a tweak: different point count, different topology,
// ~3.6x different size.
//
// ⚠ CORRECTED BY sw5-6 — WHAT THAT THIRD ZERO MEANS.
// This header originally read the twelve zeros as "flat in z=0 … its face perpendicular
// to the trench axis, looking the pilot in the eye." That is WRONG, and it shipped a port
// standing on its edge. The ROM's THIRD component is HEIGHT, not depth — its own macro
// says so:
//     .MACRO .PGND .A,.B,.C        ;OFFSET HITE TO MID OF PLAYERS HITE
//     .WORD .A'*.S,.B'*.S,.C'*.S-GD$MDT    <- the HEIGHT offset hits the THIRD component
// and render.ts's TOWER_ORIENT already said it out loud: "The ROM's up-axis is Z (x is
// fore/aft, y lateral); ours is Y."
//
// Twelve points with zero HEIGHT is a HORIZONTAL plate. WSBASE.MAC `BSVPORT` then seats it
// at "Z HITE ON BOTTOM OF TRENCH" — so the port is a hole in the trench FLOOR, which is
// where the octagon was all along. The octagon's PLANE was right; only its shape was wrong.
// The vertex assertions below are untouched (they are the ROM's data, 1:1); what sw5-6
// corrects is the story they were told to tell. See tests/shell/render.exhaust-port-orient
// .test.ts for the orientation contract this implies.
//
// The port's own doc comment already found this object — it names `Object_12`
// @ $6545 ("12 verts, Z=0, three concentric squares at $60/$A0/$100 =
// 96/160/256") — and then declined to use it, because the disassembly could not
// tell it what the object WAS. The original source can: it is called `PORT`,
// and its comment reads ";THERMAL EXHAUST PORT".
//
// ⚠ THE LITERALS ARE HEX. WSOBJ.MAC is `.RADIX 16`, and it contains no `.RADIX`
// line to warn you (it is set upstream of the file). The trap here is meaner
// than the one that bit sw3-11/sw5-5, because a decimal misreading does not
// merely shrink this object — it COLLAPSES it:
//
//   BASE  0x20 * 8 = 32 * 8 = 256    <- the true outer square
//   BASE   20. * 8 = 20 * 8 = 160    <- lands EXACTLY on the true SUPPORT BERM
//
// Read as decimal, the outer base falls onto the berm ring and the three
// concentric squares silently become two — a plausible-looking object that
// passes an eyeball review. The arithmetic below refutes it, in the test, so
// nobody can quietly regress to decimal.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { EXHAUST_PORT } from '../../src/core/models'
import { ROM_MODELS } from '../../src/tools/romModels.generated'
import type { Vec3 } from '@arcade/shared/math3d'

// --- the hand-transcribed oracle --------------------------------------------

const S = 8 // .S = 8 ;GROUND OBJECT SCALING

/** One `.PH x,y,z` row: `.WORD x*.S, y*.S, z*.S`. Literals read in the file's
 *  own hex radix — pass them as JS hex so the source and the test line up. */
const ph = (x: number, y: number, z: number): Vec3 => [x * S, y * S, z * S]

/**
 * WSOBJ.MAC's `.WP PORT` point table, verbatim and in ROM order. `.WP` emits no
 * anchor row (unlike the `.PGND` ground family sw5-5 ported), so all twelve
 * points are real geometry and nothing is dropped.
 *
 *                                        ring        corner magnitude
 */
const PORT_TABLE: readonly Vec3[] = [
  ph(0x0c, 0x0c, 0), ph(0x0c, -0x0c, 0), //  0- 1  INNER CIRCLE   ±96
  ph(-0x0c, 0x0c, 0), ph(-0x0c, -0x0c, 0), //  2- 3  (the porthole)
  ph(0x14, 0x14, 0), ph(0x14, -0x14, 0), //  4- 5  SUPPORT BERM   ±160
  ph(-0x14, 0x14, 0), ph(-0x14, -0x14, 0), //  6- 7
  ph(0x20, 0x20, 0), ph(0x20, -0x20, 0), //  8- 9  BASE           ±256
  ph(-0x20, 0x20, 0), ph(-0x20, -0x20, 0), // 10-11
]

/**
 * `.WGD PORT` (WSOBJ.MAC:1855-1876), hand-walked. The routine strokes the plate
 * in THREE pens, and the pen changes are the ROM telling us what the object is:
 *
 *   PLOT 5
 *   MOVD #VGCGRN...        ;OUTER BASE     green
 *   DRAWTO 9,8,4
 *   BDRAWTO 6,10,11,7
 *   MOVD #VGCTRQ...        ;INNER BERM     turquoise
 *   DRAWTO 6,2
 *   BDRAWTO 6,4,0
 *   BDRAWTO 4,5,1
 *   BDRAWTO 5,7,3
 *   MOVD #VGCRED...        ;PORTHOLE       red
 *   DRAWTO 2,0,1,3
 *   ENDPLOT
 *
 * PLOT n starts a run at point n with the pen UP; DRAWTO a,b,… strokes a visible
 * line to each; BDRAWTO a,b,… is a BLANK move to `a` and then a DRAWTO of the
 * rest (sw5-1's parser contract).
 */
const PORT_EDGES: readonly (readonly [number, number])[] = [
  // green — OUTER BASE: the skirt out from the berm corners to the base corners
  [5, 9], [9, 8], [8, 4], [6, 10], [10, 11], [11, 7],
  // turquoise — INNER BERM
  [7, 6], [6, 2], [6, 4], [4, 0], [4, 5], [5, 1], [5, 7], [7, 3],
  // red — THE PORTHOLE: exactly the four inner-circle points, closed
  [3, 2], [2, 0], [0, 1], [1, 3],
]

/** The red `;PORTHOLE` pen strokes — the hole itself, and nothing else. This is
 *  the sub-shape the player must actually put a torpedo through (see the hit
 *  suite, exhaust-port-hit-rom.test.ts). */
const PORTHOLE_EDGES: readonly (readonly [number, number])[] = [
  [3, 2], [2, 0], [0, 1], [1, 3],
]

// --- helpers ----------------------------------------------------------------

/** Orientation-independent edge identity, so [1,3] and [3,1] are one edge. */
const key = ([a, b]: readonly [number, number]) => (a <= b ? `${a}-${b}` : `${b}-${a}`)
const edgeSet = (edges: readonly (readonly [number, number])[]) => new Set(edges.map(key))
const romPort = () => ROM_MODELS.find((m) => m.name === 'PORT')!
/** The vertex indices a model's own edges actually stroke. */
const drawn = new Set(PORT_EDGES.flat())

// ---------------------------------------------------------------------------
// The oracle itself. If the hand transcription and the bake disagree, one of
// them is wrong and every other assertion in this file is worthless — so check
// that FIRST, against WSOBJ.MAC rather than against models.ts.
// ---------------------------------------------------------------------------

describe('sw5-4 — the ROM oracle (hand-transcribed from WSOBJ.MAC `.WP PORT` / `.WGD PORT`)', () => {
  it('the baked PORT carries the hand-transcribed 12-point table, in ROM order', () => {
    expect(romPort().vertices).toEqual(PORT_TABLE)
    expect(romPort().scale, '.S = 8').toBe(S)
  })

  it('the baked PORT draw list matches the hand-walked `.WGD PORT` strokes', () => {
    expect(edgeSet(romPort().edges)).toEqual(edgeSet(PORT_EDGES))
    expect(romPort().edges).toHaveLength(18)
    expect(romPort().hasDrawList, 'sw5-1 recovered it').toBe(true)
  })

  it('the literals are HEX — and the decimal reading is arithmetically REFUTED', () => {
    // The headline trap. Decimal is not merely smaller here; it is degenerate.
    const berm = PORT_TABLE[4][0] //  0x14 * 8
    const base = PORT_TABLE[8][0] //  0x20 * 8

    expect(berm, '0x14 * 8').toBe(160)
    expect(base, '0x20 * 8').toBe(256)

    // Read as decimal, the BASE row (20) lands on 160 — which is the TRUE BERM.
    // The outer square would collapse onto the middle one and the port would
    // ship with two rings instead of three, looking perfectly plausible.
    expect(base, 'the decimal misreading of the base row').not.toBe(20 * S)
    expect(20 * S, 'and here is why that misreading is so easy to miss').toBe(berm)

    // The berm row read as decimal (14) would be 112 — a magnitude that appears
    // nowhere in the object.
    const magnitudes = new Set(PORT_TABLE.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]))
    expect(magnitudes.has(14 * S), 'the decimal misreading of the berm row').toBe(false)

    // ...and the bake, independently, agrees with the hex reading.
    expect(romPort().vertices[8][0]).toBe(256)
  })
})

// ---------------------------------------------------------------------------
// AC-1 / AC-2 — EXHAUST_PORT *is* ROM PORT: vertices AND edges.
// ---------------------------------------------------------------------------

describe('sw5-4 AC-1/AC-2 — EXHAUST_PORT is ROM PORT', () => {
  it('carries the ROM point table verbatim — all 12 points, in ROM order', () => {
    // DEEP equality, not a count and not a set: edges are INDICES into this
    // array, so a reorder would silently repoint every edge while both arrays
    // still "look" right. It is also exactly what the contact sheet's vertex
    // guard demands before it will diff edges at all (AC-5, romCompare's
    // `verticesEqual` — an ordered deep compare).
    expect(EXHAUST_PORT.vertices).toEqual(PORT_TABLE)
  })

  it('is three CONCENTRIC SQUARES at ±96 / ±160 / ±256 — not an 8-point octagon', () => {
    expect(EXHAUST_PORT.vertices).toHaveLength(12)

    // Group the points by corner magnitude. A square ring has four corners, all
    // at the same |x| = |y|.
    const rings = new Map<number, Vec3[]>()
    for (const v of EXHAUST_PORT.vertices) {
      const m = Math.abs(v[0])
      expect(Math.abs(v[1]), 'every point is a SQUARE corner: |x| === |y|').toBe(m)
      rings.set(m, [...(rings.get(m) ?? []), v])
    }

    expect([...rings.keys()].sort((a, b) => a - b)).toEqual([96, 160, 256])
    for (const [m, pts] of rings) expect(pts, `ring ±${m} has four corners`).toHaveLength(4)

    // The octagon this replaces reached ~69.5 (hypot(64,27)) and had no vertex
    // at any of these magnitudes. If it survives, this fires.
    expect(rings.has(64), 'the authored octagon must be GONE').toBe(false)
  })

  it('is a FLAT PLATE with ZERO HEIGHT — a 512×512 patch of trench floor', () => {
    // The ROM's third component is its HEIGHT axis (`.PGND`'s ";OFFSET HITE" is applied to
    // it; render.ts's TOWER_ORIENT names the same convention). All twelve points therefore
    // sit at height 0 — the plate is HORIZONTAL, and `BSVPORT` lays it on the bottom of the
    // trench. Its two 512-unit spans are the trench's WIDTH and its LENGTH, not width and
    // height.
    //
    // These are the ROM's numbers 1:1 and must not be re-seated to suit a viewing angle:
    // romCompare's deep vertex compare (sw5-4 AC-5) demands them verbatim, and
    // PORT_HIT_RADIUS is bound to the porthole's 96 in the same units. The ORIENTATION is
    // the shell's job — see tests/shell/render.exhaust-port-orient.test.ts.
    for (const v of EXHAUST_PORT.vertices) {
      expect(v[2], 'every point is at ROM height 0 — the plate is flat on the ground').toBe(0)
    }

    const spread = (i: 0 | 1 | 2) => {
      const vals = EXHAUST_PORT.vertices.map((v) => v[i])
      return Math.max(...vals) - Math.min(...vals)
    }
    expect(spread(0), 'spans 512 along the trench (ROM fore/aft)').toBe(512)
    expect(spread(1), 'spans 512 across the trench (ROM lateral)').toBe(512)
    expect(spread(2), 'and has NO extent in HEIGHT — it is a floor, not a wall').toBe(0)
  })

  it('strokes exactly the 18 edges of `.WGD PORT`', () => {
    expect(edgeSet(EXHAUST_PORT.edges)).toEqual(edgeSet(PORT_EDGES))
    expect(EXHAUST_PORT.edges).toHaveLength(18)
  })

  it('closes the PORTHOLE — the red pen\'s four strokes around the inner square', () => {
    // The ROM's own colour grouping is the evidence that the inner square IS the
    // hole (`MOVD #VGCRED... ;PORTHOLE` strokes points 0-3 and nothing else).
    // The hit suite tunes the torpedo's sphere against exactly this sub-shape,
    // so pin it here rather than leaving it implied by the 18-edge set.
    const present = edgeSet(EXHAUST_PORT.edges)
    for (const e of PORTHOLE_EDGES) {
      expect(present.has(key(e)), `porthole stroke ${key(e)}`).toBe(true)
    }
    const inner = [0, 1, 2, 3].map((i) => EXHAUST_PORT.vertices[i])
    for (const [x, y] of inner) {
      expect(Math.abs(x), 'the porthole is the ±96 square').toBe(96)
      expect(Math.abs(y)).toBe(96)
    }
  })

  it('has no orphan vertices — every one of the 12 points is stroked', () => {
    // Unlike sw5-5's tower family (which shares one `.WP GND` table across four
    // objects and therefore carries points its own routine never draws), PORT
    // owns its table and `.WGD PORT` strokes ALL of it. So the port must NOT be
    // added to models.test.ts's SHARED_ROM_TABLE_MODELS orphan carve-out — it
    // has nothing to carve out. If a future edit drops a stroke, this fires here
    // rather than surfacing as a mystifying registry failure.
    const used = new Set(EXHAUST_PORT.edges.flat())
    for (let i = 0; i < EXHAUST_PORT.vertices.length; i++) {
      expect(used.has(i), `vertex ${i} is stroked`).toBe(true)
    }
    expect(drawn.size).toBe(12)
  })

  // lang-review typescript #4 — FALSY ZERO. This object is the worst case in the
  // whole registry for it: EVERY vertex has z === 0 exactly, and vertex 0 is a
  // real, heavily-stroked porthole corner. Any `v[2] || fallback`, `if (!i)`, or
  // truthiness filter in the port or the transform path silently rewrites the
  // whole plate (or deletes a corner) rather than erroring.
  it('index 0 and coordinate 0 are both REAL — no truthiness guard may skip them', () => {
    const touchingZero = EXHAUST_PORT.edges.filter(([a, b]) => a === 0 || b === 0)
    expect(touchingZero.length, 'vertex 0 is a porthole corner, stroked twice').toBeGreaterThan(0)

    const zeroZ = EXHAUST_PORT.vertices.filter(([, , z]) => z === 0)
    expect(zeroZ, 'all twelve z are a falsy-but-valid 0').toHaveLength(12)
  })
})

// ---------------------------------------------------------------------------
// AC-3 — the PROVISIONAL marker comes off.
// ---------------------------------------------------------------------------

describe('sw5-4 AC-3 — EXHAUST_PORT is no longer PROVISIONAL', () => {
  /** models.ts as SOURCE TEXT. The marker lives in a doc comment, so it is
   *  invisible to any import-based assertion — it has to be read, not evaluated. */
  const source = readFileSync(new URL('../../src/core/models.ts', import.meta.url), 'utf8')

  /** Just the EXHAUST_PORT doc block + declaration: from the doc comment that
   *  precedes `export const EXHAUST_PORT` to the end of that declaration. Scoped
   *  deliberately — TRENCH_TURRET and friends are still legitimately PROVISIONAL
   *  and a whole-file scan would either fail forever or pass for the wrong
   *  reason. */
  const block = (): string => {
    const decl = source.indexOf('export const EXHAUST_PORT')
    expect(decl, 'EXHAUST_PORT is still exported from models.ts').toBeGreaterThan(-1)
    const docStart = source.lastIndexOf('/**', decl)
    const declEnd = source.indexOf('\n}', decl)
    return source.slice(docStart, declEnd)
  }

  it('carries no PROVISIONAL marker — the port has an authentic vertex table now', () => {
    expect(block()).not.toMatch(/PROVISIONAL/)
  })

  it('no longer claims the ROM has no table for it, nor that the shape is authored', () => {
    // The old comment asserts, in order: that `Object_3D_Data.asm` has "no vertex
    // table named or addressed for it"; that the Object_12 identification is an
    // unconfirmed "AGENT INFERENCE"; and that "the geometry therefore stays
    // AUTHORED". WSOBJ.MAC settles all three — the object is named PORT and its
    // comment says ";THERMAL EXHAUST PORT". Leaving that paragraph in place would
    // leave a confident lie in the file, which is precisely what this epic exists
    // to remove.
    const b = block()
    expect(b, 'the shape is no longer authored').not.toMatch(/AUTHORED/i)
    expect(b, 'the identification is no longer an inference').not.toMatch(/AGENT INFERENCE/i)
    expect(b, 'cite the real source').toMatch(/WSOBJ/i)
  })
})
