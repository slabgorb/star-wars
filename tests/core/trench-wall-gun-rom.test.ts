// tests/core/trench-wall-gun-rom.test.ts
//
// Story sw7-20 — RED phase (Han Solo / TEA): the trench turret is re-ported from
// the ROM as the authentic WALL GUN it is (finding M-011, the model half of the
// story; the behaviour half — the guns firing back — is
// trench-wall-gun-fire.test.ts).
//
// GROUND TRUTH is WSOBJ.MAC (~/Projects/star-wars-1983-source-text), the 1983
// Atari source. The tables below are transcribed BY HAND from it — NOT read out
// of `romModels.generated.ts` — so the bake and the port are each checked against
// an INDEPENDENT oracle rather than against each other (the sw5-4 / sw7-19
// pattern: a test that asserts `TRENCH_TURRET === ROM_MODELS.WGA` proves only
// that two artifacts agree; if the bake regressed it would drag the port down
// with it and stay green).
//
// -- THE POINT TABLE (WSOBJ.MAC:576-599) -------------------------------------
//
//   .WP WGA            ;WALL GUN TYPE A
//   .S=8               ;MATCHES WALL PANEL
//   .P 0,0,0           ;         ← origin, index 0 in the ROM table
//   .P -32,0,24        ;0-4 WALL BASE
//   .P 32,0,24
//   .P 32,0,-24
//   .P -32,0,-24
//   .P -12,12,8        ;5-10 GUN BODY
//   .P 12,4,8
//   .P 12,4,-8
//   .P -12,12,-8
//   .P -12,4,-8
//   .P -12,4,8
//   .P -12,9,4         ;11-14 GUN NOZZLE
//   .P -12,7,4
//   .P -12,9,-4
//   .P -12,7,-4
//
// FIFTEEN `.P` rows (0-14): the origin plus a 4-corner wall base (±256/±192 after
// ×8), a 6-point gun body, and a 4-point nozzle. Ours (`TRENCH_TURRET`) instead
// ships a hand-authored 10-vertex box+barrel whose own comment concedes "No
// authentic vertex table is directly portable … PROVISIONAL." M-011 rules that
// FALSE — the disassembly lacked the table but the MACRO-11 source carries it in
// full, so this is a straight data re-port.
//
// ⚠ THE LITERALS ARE DECIMAL — the OPPOSITE trap from WFF (sw7-19). `.WP WGA`
// uses the `.P` macro, whose definition (WSOBJ.MAC:136) is
//     .MACRO .P .1,.2,.3
//         .WORD .1'.*.S, .2'.*.S, .3'.*.S     ; the `'.` suffix forces DECIMAL
// so `.P -32` is decimal -32, NOT the ambient-radix hex the `.PH` macro (WFF)
// takes. The arithmetic is refuted IN the test below so a hex misreading cannot
// pass an eyeball review:
//
//   BASE x   -32  * 8 = -256   <- the true corner (decimal .P)
//   BASE x  -0x32 * 8 = -400   <- appears nowhere; the hex misreading is refuted
//   BASE z    24  * 8 =  192   <- the true depth
//   BASE z   0x24 * 8 =  288   <- the hex misreading is refuted
//
// -- THE ORIGIN IS DROPPED IN THE BAKE ---------------------------------------
//
// `.P 0,0,0` (ROM index 0) is a positioning origin the draw routine never
// references (its lowest index is 1). The bake omits it and reindexes the 14 real
// points 0-13; the port matches the bake (as TRENCH_CATWALK matched WFF's table
// 1:1). So both the oracle and the port carry 14 vertices, and every `.WGD WGA`
// index below is transcribed with the same −1 shift.
//
// -- THE DRAW ROUTINE (WSOBJ.MAC:1780-1796) ----------------------------------
//
//   .WGD WGA           ;WALL GUN, TYPE A   (colour VGCRED, set in-routine)
//   PLOT 4
//   DRAWTO 3,2,1,4,9,10,1
//   BDRAWTO 10,6,2
//   BDRAWTO 3,7,6,5,8,7,9,8
//   DRAWTO 13,14,9
//   BDRAWTO 14,12,10,5,11,12
//   BDRAWTO 11,13
//   ENDPLOT
//
// PLOT n starts the pen at point n, beam OFF. DRAWTO strokes a visible line from
// the current point to each listed index in turn. BDRAWTO blank-moves to its
// FIRST index (beam off) then strokes the rest. Twenty-five visible edges. The
// pen-walk is transcribed below in ROM indices, then reindexed −1 (origin
// dropped) to the bake/port indexing.

import { describe, it, expect } from 'vitest'
import { TRENCH_TURRET } from '../../src/core/models'
import { ROM_MODELS } from '../../src/tools/romModels.generated'
import { ROM_TO_PORT, pairOne, verdictFor } from '../../src/tools/romCompare'
import type { Vec3 } from '@arcade/shared/math3d'

// --- the hand-transcribed oracle --------------------------------------------

const S = 8 // .S = 8 ;MATCHES WALL PANEL

/** One `.P x,y,z` row: `.WORD x*.S, y*.S, z*.S`, literals DECIMAL (the `.P`
 *  macro's `'.` suffix). Passed as plain JS decimals so source and test line up. */
const p = (x: number, y: number, z: number): Vec3 => [x * S, y * S, z * S]

/** WSOBJ.MAC's `.WP WGA` point table, verbatim and in ROM order, with the `.P
 *  0,0,0` origin dropped and the remaining 14 points reindexed 0-13 (the bake's
 *  convention; the draw routine never references the origin). */
const WGA_TABLE: readonly Vec3[] = [
  p(-32, 0, 24), p(32, 0, 24), p(32, 0, -24), p(-32, 0, -24), //  0-3  WALL BASE  (±256/±192)
  p(-12, 12, 8), p(12, 4, 8), p(12, 4, -8), p(-12, 12, -8), p(-12, 4, -8), p(-12, 4, 8), // 4-9 GUN BODY
  p(-12, 9, 4), p(-12, 7, 4), p(-12, 9, -4), p(-12, 7, -4), // 10-13 GUN NOZZLE
]

/** `.WGD WGA` (WSOBJ.MAC:1780-1789) hand-walked in ROM indices then reindexed −1
 *  (origin dropped). Each block is one draw instruction:
 *    PLOT 4 · DRAWTO 3,2,1,4,9,10,1   → 4-3,3-2,2-1,1-4,4-9,9-10,10-1
 *    BDRAWTO 10,6,2                    → (blank 1→10) 10-6,6-2
 *    BDRAWTO 3,7,6,5,8,7,9,8           → (blank 2→3) 3-7,7-6,6-5,5-8,8-7,7-9,9-8
 *    DRAWTO 13,14,9                    → 8-13,13-14,14-9
 *    BDRAWTO 14,12,10,5,11,12          → (blank 9→14) 14-12,12-10,10-5,5-11,11-12
 *    BDRAWTO 11,13                     → (blank 12→11) 11-13
 *  reindexed to 0-13 below. 25 visible edges. */
const WGA_EDGES: readonly (readonly [number, number])[] = [
  [3, 2], [2, 1], [1, 0], [0, 3], [3, 8], [8, 9], [9, 0], // DRAWTO 3,2,1,4,9,10,1
  [9, 5], [5, 1], //                                          BDRAWTO 10,6,2
  [2, 6], [6, 5], [5, 4], [4, 7], [7, 6], [6, 8], [8, 7], //  BDRAWTO 3,7,6,5,8,7,9,8
  [7, 12], [12, 13], [13, 8], //                              DRAWTO 13,14,9
  [13, 11], [11, 9], [9, 4], [4, 10], [10, 11], //            BDRAWTO 14,12,10,5,11,12
  [10, 12], //                                                BDRAWTO 11,13
]

// --- helpers ----------------------------------------------------------------

const key = ([a, b]: readonly [number, number]) => (a <= b ? `${a}-${b}` : `${b}-${a}`)
const edgeSet = (edges: readonly (readonly [number, number])[]) => new Set(edges.map(key))
const romWGA = () => ROM_MODELS.find((m) => m.name === 'WGA')!

// ---------------------------------------------------------------------------
// The oracle itself. If the hand transcription and the bake disagree, one of them
// is wrong and every other assertion is worthless — so check that FIRST, against
// WSOBJ.MAC rather than against models.ts. (These pass today: the bake is already
// faithful. They GUARD it, and anchor the port assertions that follow.)
// ---------------------------------------------------------------------------

describe('sw7-20 — the ROM oracle (hand-transcribed from WSOBJ.MAC `.WP WGA` / `.WGD WGA`)', () => {
  it('the baked WGA carries the hand-transcribed 14-point table (origin dropped), in ROM order', () => {
    expect(romWGA().vertices).toEqual(WGA_TABLE)
    expect(romWGA().scale, '.S = 8 ;MATCHES WALL PANEL').toBe(S)
  })

  it('the baked WGA draw list matches the hand-walked `.WGD WGA` strokes (25 edges)', () => {
    expect(edgeSet(romWGA().edges)).toEqual(edgeSet(WGA_EDGES))
    expect(romWGA().edges).toHaveLength(25)
    expect(romWGA().hasDrawList).toBe(true)
  })

  it('refutes the HEX misreading — the `.P` macro is DECIMAL, unlike WFF’s `.PH`', () => {
    // -32 * 8 = -256 (decimal .P), NOT -0x32 * 8 = -400; 24 * 8 = 192, NOT 0x24 * 8 = 288.
    expect(WGA_TABLE[0]).toEqual([-256, 0, 192])
    expect(WGA_TABLE[0][0]).not.toBe(-400) // the hex misreading of the x corner
    expect(WGA_TABLE[0][2]).not.toBe(288) // the hex misreading of the z depth
  })

  it('the origin `.P 0,0,0` is dropped: 14 vertices, none at the origin', () => {
    expect(WGA_TABLE).toHaveLength(14)
    expect(WGA_TABLE.some((v) => v[0] === 0 && v[1] === 0 && v[2] === 0)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// M-011 — the PORT model. TRENCH_TURRET must become the WGA wall gun. RED today:
// it ships the 10-vertex PROVISIONAL box+barrel.
// ---------------------------------------------------------------------------

describe('sw7-20 / M-011 — TRENCH_TURRET is the authentic `.WP WGA` wall gun', () => {
  it('carries the WGA vertex table, 1:1 in ROM order (deep-equal, like romCompare)', () => {
    // romCompare.verticesEqual is a DEEP, order-sensitive equality (sw5-5), and
    // ORIENTATION is the shell's job (render.ts), so the model holds raw ROM
    // vertices. RED: TRENCH_TURRET currently ships a 10-vertex hand-authored box.
    expect(TRENCH_TURRET.vertices).toEqual(WGA_TABLE)
  })

  it('strokes the `.WGD WGA` draw list, and nothing fabricated (25 edges)', () => {
    expect(edgeSet(TRENCH_TURRET.edges)).toEqual(edgeSet(WGA_EDGES))
    expect(TRENCH_TURRET.edges).toHaveLength(25)
  })

  it('is the WGA wall gun, not the provisional box (±256 wall base, gun body rising to y=96)', () => {
    // Two numbers separate WGA from the old stand-in. The old box base is a ±30
    // square (width 60) capped at y=72; WGA is a ±256 wall base (width 512) whose
    // gun body tops at y=96. Robust to vertex ORDER — reads the extremes.
    const xs = TRENCH_TURRET.vertices.map((v) => v[0])
    const ys = TRENCH_TURRET.vertices.map((v) => v[1])
    expect(Math.max(...xs) - Math.min(...xs), 'WGA wall base spans ±256 (width 512)').toBe(512)
    expect(Math.max(...ys), 'the gun body tops at y=96, not the box cap y=72').toBe(96)
  })

  it('every port edge indexes a real vertex (no fabricated / out-of-range index)', () => {
    const n = TRENCH_TURRET.vertices.length
    for (const [a, b] of TRENCH_TURRET.edges) {
      expect(a).toBeLessThan(n)
      expect(b).toBeLessThan(n)
    }
  })
})

// ---------------------------------------------------------------------------
// romCompare wiring — the contact sheet must now PAIR WGA with the port and
// declare the edges a match (today WGA is deliberately unmapped in ROM_TO_PORT).
// ---------------------------------------------------------------------------

describe('sw7-20 / M-011 — romCompare pairs WGA ↔ the port and confirms the match', () => {
  it('ROM_TO_PORT maps WGA to the TRENCH_TURRET port model', () => {
    // RED: WGA is currently absent from ROM_TO_PORT (the turret was "PROVISIONAL
    // — no authentic vertex table"); M-011 supplies the mapping.
    expect(ROM_TO_PORT.WGA).toBe(TRENCH_TURRET.name)
  })

  it('verdictFor the WGA/port pair is a clean edge match (vertices + edges agree)', () => {
    const pair = pairOne(romWGA(), TRENCH_TURRET.name, TRENCH_TURRET)
    expect(pair.verticesMatch, 'WGA vertices == port vertices').toBe(true)
    const verdict = verdictFor(pair)
    expect(verdict.drift, 'no ROM/port drift').toBe(false)
    expect(verdict.text).toBe('✓ edges match')
  })
})
