// tests/core/ground-objects-rom.test.ts
//
// Story sw5-5 — RED phase (O'Brien / TEA): the surface tower, its cap, and the
// bunker are re-ported from the ROM.
//
// GROUND TRUTH is WSOBJ.MAC (~/Projects/star-wars-1983-source-text), the 1983
// Atari source. The vertex table below is transcribed BY HAND from it, NOT read
// out of `romModels.generated.ts` — so that the bake and the port are checked
// against an independent oracle rather than against each other. (A test that
// asserts `MODELS === ROM_MODELS` proves only that two artifacts agree; if the
// bake ever regressed, it would drag the port down with it and stay green.)
//
// -- THE POINT TABLE (WSOBJ.MAC:524-557) ------------------------------------
//
//   .WP GND            ;GROUND LASAR TOWER
//   .MACRO .PGND .A,.B,.C
//   .WORD .A'*.S,.B'*.S,.C'*.S-GD$MDT
//   .S=30.*4                                    -> 120
//
// then sixteen `.PGND x,y,z` rows. Row 0 is `.PGND 0,0,0 ;CENTER ON GROUND` —
// the ANCHOR, which the bake drops (it is placement metadata, not geometry), so
// the object carries FIFTEEN vertices and the routines' 1-based indices rebase
// to 0-based.
//
//   ROM axes:  x = fore/aft (the "FRONT" point is -x)
//              y = lateral  (+y LEFT, -y RIGHT)
//              z = UP, recentred by GD$MDT
//
// ⚠ THE LITERALS ARE HEX. WSOBJ.MAC is `.RADIX 16`, so the `.PGND` height column
// reads 0x14 / 0x52 / 0x58 — 20 / 82 / 88 — NOT the decimal 14 / 52 / 58 that
// story sw3-11 transcribed. This is THE bug behind this story: the port's tower
// is too short, and wrong in the middle. The arithmetic proves the hex reading
// and refutes the decimal one:
//
//   h=0x58 -> 88*120 - 0xF00 =  10560 - 3840 =  6720   <- the baked ROM z
//   h= 58. -> 58*120 - 0xF00 =   6960 - 3840 =  3120   <- nothing has this z
//
// ⚠ GD$MDT (= 0xF00 = 3840) IS NOT COSMETIC. Its comment is "OFFSET HITE TO MID
// OF PLAYERS HITE": it recentres the tower so that model z=0 sits at the height
// the player flies at. GD$MDT is therefore the ROM's own skim altitude, which is
// why state.ts's SKIM_ALTITUDE is derived from it (see the placement suite) and
// no longer a hand-picked number.
//
// -- ONE TABLE, FOUR OBJECTS ------------------------------------------------
//
// `.WPZ2 TWR` / `.WPZ2 BNK` / `.WPZ2 STB` (WSOBJ.MAC:555-557) alias GND's table:
// all four objects SHARE these fifteen points and differ only in which of them
// their `.WGD` draw routine strokes. That is why each ported model below carries
// all fifteen vertices while its own edges touch a subset — the unstroked points
// are ROM structure, not port dead weight (see models.test.ts's orphan carve-out).

import { describe, it, expect } from 'vitest'
import { SURFACE_TOWER, TOWER_CAP, SURFACE_BUNKER, type Model3D } from '../../src/core/models'
import { ROM_MODELS } from '../../src/tools/romModels.generated'
import type { Vec3 } from '@arcade/shared/math3d'

// --- the hand-transcribed oracle -------------------------------------------

const S = 120 // .S = 30.*4
const GD$MDT = 0xf00 // 3840

/** One `.PGND x,y,z` row, with the height read in the file's own hex radix. */
const pgnd = (x: number, y: number, hHex: number): Vec3 => [x * S, y * S, hHex * S - GD$MDT]

/**
 * WSOBJ.MAC's `.WP GND` point table, anchor row dropped — the fifteen points
 * GND, TWR, BNK and STB all share. Five 3-point cross-sections; the cabinet
 * draws TRIANGLES, never 4-corner boxes.
 *
 *            height (hex)   radius     ring
 */
const GND_TABLE: readonly Vec3[] = [
  pgnd(-8, 0, 0x00), pgnd(0, 8, 0x00), pgnd(0, -8, 0x00), //  0- 2  h=0     r=8  BASE
  pgnd(-4, 0, 0x58), pgnd(0, 4, 0x58), pgnd(0, -4, 0x58), //  3- 5  h=0x58  r=4  TOP OF CANNON
  pgnd(-4, 0, 0x52), pgnd(0, 4, 0x52), pgnd(0, -4, 0x52), //  6- 8  h=0x52  r=4  BOTTOM OF CANNON
  pgnd(-5, 0, 0x14), pgnd(0, 5, 0x14), pgnd(0, -5, 0x14), //  9-11  h=0x14  r=5  MIDLINE
  pgnd(-6, 0, 0x06), pgnd(0, 6, 0x06), pgnd(0, -6, 0x06), // 12-14  h=6     r=6  NEAR BOTTOM
]

/**
 * `.WGD STB` (WSOBJ.MAC:1761) — "STUB OF TOWER WITHOUT BUNKER HAT ON TOP".
 * Indices below are the routine's own 1-based point numbers minus one.
 *
 *   BDRAWTO 1,3,15,12,9    ;UP RIGHT SIDE
 *   DRAWTO  7,10,13,1      ;DOWN CENTER
 *   DRAWTO  2,14,11,8,7    ;UP LEFT SIDE
 */
const STB_EDGES: readonly (readonly [number, number])[] = [
  [0, 2], [2, 14], [14, 11], [11, 8], // up right side
  [8, 6], [6, 9], [9, 12], [12, 0], //   down centre
  [0, 1], [1, 13], [13, 10], [10, 7], [7, 6], // up left side
]

/**
 * `.WGD BNK` (WSOBJ.MAC:1711) — the "SHORTY". Strokes ONLY the base ring and the
 * near-bottom ring: a squat truncated pyramid.
 *
 *   BDRAWTO 1,2,14,13,1,3,15,13
 *   BDRAWTO 14,15
 */
const BNK_EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 13], [13, 12], [12, 0], [0, 2], [2, 14], [14, 12], [13, 14],
]

/**
 * `.WGD TWR` + `.WGD2 GND` (WSOBJ.MAC:1729-1730) — ONE object under two names,
 * one draw routine, which strokes the WHOLE tower: the column AND the white
 * cannon cap, in a single PLOT. This is the union our two port models must
 * reproduce between them (see the reconciliation test below).
 */
const TWR_EDGES: readonly (readonly [number, number])[] = [
  [0, 2], [2, 14], [14, 11], [11, 8], // base colour, up right
  [8, 5], [5, 3], [3, 6], //             top colour, up the middle
  [6, 9], [9, 12], [12, 0], [0, 1], [1, 13], [13, 10], [10, 7], // base colour, up left
  [7, 4], [4, 3], //                     top colour, the cap
  [6, 8], [6, 7], //                     top colour, partial cannon-bottom ring
]

/** The 7 strokes `.WGD TWR` makes under `MOVD M.GDCT` — the "special" WHITE
 *  colour of WSGRND.MAC's GDVIEW ("SO DRAW IT SPECIAL WHITE"). This is the cap. */
const TWR_WHITE_EDGES: readonly (readonly [number, number])[] = [
  [8, 5], [5, 3], [3, 6], [7, 4], [4, 3], [6, 8], [6, 7],
]

// --- helpers ---------------------------------------------------------------

/** Orientation-independent edge identity, so [1,3] and [3,1] are one edge. */
const key = ([a, b]: readonly [number, number]) => (a <= b ? `${a}-${b}` : `${b}-${a}`)
const edgeSet = (edges: readonly (readonly [number, number])[]) => new Set(edges.map(key))
const romModel = (name: string) => ROM_MODELS.find((m) => m.name === name)!
/** The vertex indices a model's own edges actually stroke. */
const drawn = (m: Model3D) => new Set(m.edges.flat())

// ---------------------------------------------------------------------------
// The oracle itself. If the bake and the hand transcription ever disagree, one
// of them is wrong and every other assertion in this file is worthless — so
// check that FIRST, and check it against WSOBJ.MAC rather than against MODELS.
// ---------------------------------------------------------------------------

describe('sw5-5 — the ROM oracle (hand-transcribed from WSOBJ.MAC)', () => {
  it('the baked GND/TWR/BNK/STB all carry the same hand-transcribed 15-point table', () => {
    // `.WPZ2` aliasing: four objects, one point table. If the bake ever stopped
    // sharing it, the port's shared table would be silently wrong too.
    for (const name of ['GND', 'TWR', 'BNK', 'STB']) {
      expect(romModel(name).vertices, `${name} shares .WP GND's table`).toEqual(GND_TABLE)
    }
  })

  it('the height literals are HEX — the decimal reading is arithmetically refuted', () => {
    // This is the sw3-11 defect, pinned as a standing regression guard. The
    // cannon top is `.PGND -4,0,58` and 58 is hex.
    const cannonTop = GND_TABLE[3][2]
    expect(cannonTop, '0x58 * 120 - 0xF00').toBe(6720)
    expect(cannonTop, 'the decimal misreading of the same row').not.toBe(58 * S - GD$MDT)
    // ...and the bake, independently, agrees.
    expect(romModel('STB').vertices[3][2]).toBe(6720)
  })

  it('the baked draw routines match the hand-walked STB / BNK / TWR strokes', () => {
    expect(edgeSet(romModel('STB').edges)).toEqual(edgeSet(STB_EDGES))
    expect(edgeSet(romModel('BNK').edges)).toEqual(edgeSet(BNK_EDGES))
    expect(edgeSet(romModel('TWR').edges)).toEqual(edgeSet(TWR_EDGES))
  })

  // lang-review typescript #4 — FALSY ZERO. The live trap in this data, and the
  // same one that bit sw5-1 (where index 0 meant "the dropped anchor" on these
  // very objects, but a real vertex on WPN/WFF/PORT).
  //
  // Here the anchor is already gone, so index 0 is a REAL point — the base FRONT
  // corner — and it is one of the busiest vertices in both routines. Meanwhile
  // its x is 0 for two-thirds of the table, and GD$MDT makes z=0 impossible.
  // Any `if (!i)`, `i || fallback`, or truthiness filter anywhere in the port or
  // the placement path silently deletes geometry rather than erroring.
  it('index 0 is a REAL vertex — both routines stroke it, so no truthiness guard may skip it', () => {
    for (const [name, edges] of [['STB', STB_EDGES], ['BNK', BNK_EDGES]] as const) {
      const touching = edges.filter(([a, b]) => a === 0 || b === 0)
      expect(touching.length, `${name} strokes point 0`).toBeGreaterThan(0)
    }
    // ...and a zero COORDINATE is equally real: the left/right points of every
    // ring have x = 0 exactly. A `v[0] || d` in a transform would move them.
    const zeroX = GND_TABLE.filter(([x]) => x === 0)
    expect(zeroX).toHaveLength(10)
  })
})

// ---------------------------------------------------------------------------
// AC-1 / AC-2 — SURFACE_TOWER comes from `.WGD STB`, and gets its fifth ring.
// ---------------------------------------------------------------------------

describe('sw5-5 AC-1/AC-2 — SURFACE_TOWER is ROM STB', () => {
  it('carries the ROM point table verbatim — all 15 points, in ROM order', () => {
    // Deep equality, not a count: edges are INDICES into this array, so a
    // reorder would silently repoint every edge while both arrays still "look"
    // right. This is also exactly what the contact sheet's vertex guard demands
    // before it will diff edges at all (AC-6).
    expect(SURFACE_TOWER.vertices).toEqual(GND_TABLE)
  })

  it('has FIVE cross-section rings of three points — the cannon top is restored', () => {
    // The headline defect: the port had four rings / twelve points. The missing
    // one is the cannon top (h=0x58), which `.WGD STB` does not stroke but the
    // shared point table DOES carry — and which TOWER_CAP strokes in white.
    const rings = new Map<number, number>()
    for (const [, , z] of SURFACE_TOWER.vertices) rings.set(z, (rings.get(z) ?? 0) + 1)
    expect([...rings.keys()].sort((a, b) => a - b)).toEqual([-3840, -3120, -1440, 6000, 6720])
    for (const [z, n] of rings) expect(n, `ring z=${z} is a cabinet TRIANGLE`).toBe(3)

    const cannonTopRing = SURFACE_TOWER.vertices.filter(([, , z]) => z === 6720)
    expect(cannonTopRing, 'the ring sw3-11 dropped').toHaveLength(3)
  })

  it('strokes exactly the 13 edges of `.WGD STB` — and leaves the cannon top bare', () => {
    expect(edgeSet(SURFACE_TOWER.edges)).toEqual(edgeSet(STB_EDGES))
    expect(SURFACE_TOWER.edges).toHaveLength(13)
    // The STUB is a stub: it must NOT stroke the hat. Points 3-5 are carried
    // (the table is shared) but untouched — TOWER_CAP draws them, in white.
    for (const i of [3, 4, 5]) {
      expect(drawn(SURFACE_TOWER).has(i), `STB must not stroke cannon-top point ${i}`).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// AC-3 — SURFACE_BUNKER comes from `.WGD BNK`.
// ---------------------------------------------------------------------------

describe('sw5-5 AC-3 — SURFACE_BUNKER is ROM BNK', () => {
  it('carries the same shared ROM point table verbatim (`.WPZ2 BNK`)', () => {
    expect(SURFACE_BUNKER.vertices).toEqual(GND_TABLE)
  })

  it('strokes exactly the 8 edges of `.WGD BNK` — base + near-bottom only', () => {
    expect(edgeSet(SURFACE_BUNKER.edges)).toEqual(edgeSet(BNK_EDGES))
    expect(SURFACE_BUNKER.edges).toHaveLength(8)
  })

  it('is the SHORTY: it strokes only the two lowest rings, never the column', () => {
    // The bunker's whole character. It shares the tower's table but reaches only
    // h=6 — so every point it draws must sit in the bottom two cross-sections.
    const zs = [...drawn(SURFACE_BUNKER)].map((i) => SURFACE_BUNKER.vertices[i][2])
    expect(new Set(zs)).toEqual(new Set([-3840, -3120]))
  })
})

// ---------------------------------------------------------------------------
// AC-4 — TOWER_CAP is reconciled: the split is a COLOUR split and nothing else.
//
// In the ROM there is no "cap" object. `.WGD TWR` / `.WGD2 GND` is ONE routine
// that strokes the column and the hat together, switching pen colour mid-draw
// (MOVD M.GDCB -> base yellow, MOVD M.GDCT -> the special white). Canvas strokes
// one colour per drawWireframe call, so the port splits that single routine into
// two models. These tests are the PROOF that the split is lossless — the thing
// AC-4 asks to be demonstrated rather than merely asserted in a comment.
// ---------------------------------------------------------------------------

describe('sw5-5 AC-4 — TOWER_CAP reconciles against `.WGD TWR`', () => {
  it('indexes the same shared point table, so it seats on the column exactly', () => {
    // Sharing the table is what makes the split safe: both models are placed by
    // the same transform, so the cap cannot drift off the column's cannon ring.
    expect(TOWER_CAP.vertices).toEqual(GND_TABLE)
  })

  it('strokes exactly the strokes `.WGD TWR` makes in the WHITE pen', () => {
    expect(edgeSet(TOWER_CAP.edges)).toEqual(edgeSet(TWR_WHITE_EDGES))
  })

  it('SURFACE_TOWER + TOWER_CAP reproduce `.WGD TWR` exactly — the split loses nothing', () => {
    // THE reconciliation. The union of the two port models' edges is precisely
    // the ROM's single tower routine: 13 + 7 - 2 shared = 18.
    const union = new Set([...edgeSet(SURFACE_TOWER.edges), ...edgeSet(TOWER_CAP.edges)])
    expect(union).toEqual(edgeSet(TWR_EDGES))
    expect(union.size).toBe(18)

    // The 2-edge overlap is real and intended, not sloppiness: `.WGD TWR` strokes
    // the partial cannon-bottom ring (`BDRAWTO 7,9` / `BDRAWTO 7,8`) in the WHITE
    // pen, while `.WGD STB` strokes those same two segments in the base colour to
    // close its open top. Each port model inherits its own routine's version.
    const shared = [...edgeSet(SURFACE_TOWER.edges)].filter((k) => edgeSet(TOWER_CAP.edges).has(k))
    expect(new Set(shared)).toEqual(new Set([key([6, 8]), key([6, 7])]))
  })

  it('together they stroke every point of the shared table — nothing is orphaned by the pair', () => {
    // Individually each model leaves points bare (that is the ROM's shared-table
    // design). The COMPOSITE must not: a point no drawn object ever touches
    // would be a genuine porting error rather than ROM structure.
    const both = new Set([...drawn(SURFACE_TOWER), ...drawn(TOWER_CAP)])
    expect([...both].sort((a, b) => a - b)).toEqual([...GND_TABLE.keys()])
  })
})
