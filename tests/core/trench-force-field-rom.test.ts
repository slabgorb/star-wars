// tests/core/trench-force-field-rom.test.ts
//
// Story sw7-19 — RED phase (Han Solo / TEA): the trench "catwalk" is re-ported
// from the ROM as the WALL FORCE FIELD it actually is (finding M-012, and the
// model half of B-012).
//
// GROUND TRUTH is WSOBJ.MAC (~/Projects/star-wars-1983-source-text), the 1983
// Atari source. The tables below are transcribed BY HAND from it — NOT read out
// of `romModels.generated.ts` — so the bake and the port are each checked
// against an INDEPENDENT oracle rather than against each other (the sw5-4
// exhaust-port pattern: a test that asserts `TRENCH_CATWALK === ROM_MODELS.WFF`
// proves only that two artifacts agree; if the bake regressed it would drag the
// port down with it and stay green).
//
// -- THE POINT TABLE (WSOBJ.MAC:603-615) -------------------------------------
//
//   .WP WFF            ;WALL FORCE FIELD
//   .S=8               ;NOTE HALF SIZE DUE TO PSUB LACK OF DIV2
//   .PH -20,0,0        ;0-1 FRONT MIDLINE
//   .PH -20,40,0
//   .PH 0,0,-20        ;2-3 BOTTOM MIDLINE
//   .PH 0,40,-20
//   .PH 0,0,20         ;4-5 TOP MIDLINE
//   .PH 0,40,20
//
// SIX points — a 3-fin VERTICAL barrier that RISES from y=0 to y=512 (the 0x40
// column, ×8). Ours (`TRENCH_CATWALK`) instead ships a hand-authored 8-vertex
// horizontal girder spanning the channel at y∈[-12,12] (a "cross-brace"). That
// is this story's model defect: different point count, different topology, and
// —crucially— a WALL BARRIER, not a floor bar. (M-013 already deleted the
// fabricated floor rails and left a comment: "catwalks are a WALL-PANEL slot —
// TD$WFF, in trench-wedges.ts". This finishes that correction.)
//
// ⚠ THE LITERALS ARE HEX. WSOBJ.MAC is `.RADIX 16` and carries no `.RADIX` line
// to warn you (sw3-11/sw5-4/sw5-5 all bled on this). `.PH` args are ambient-
// radix (HEX); the trailing-dot `.P` decimal form is NOT used here. A decimal
// misreading looks plausible and passes an eyeball review — so the arithmetic is
// refuted IN the test below:
//
//   FRONT x   -0x20 * 8 = -256   <- the true corner
//   FRONT x    -20. * 8 = -160   <- appears nowhere; decimal is refuted
//   RISE  y    0x40 * 8 =  512   <- the barrier height
//   RISE  y      40. * 8 =  320   <- decimal is refuted
//
// -- THE DRAW ROUTINES (WSOBJ.MAC:1819-1848) ---------------------------------
//
//   .WGD WFF           ;WALL FORCE FIELD   (colour set by caller)
//   PLOT 1
//   DRAWTO 0,2,3,1,5,4,0
//
//   .WGD WFG           ;WALL FORCE FIELD, COLLIDED VERSION
//   PLOT 1 / MOVD #VJFLS   ;CATWALK COLOR WHEN COLLIDED
//   DRAWTO 0 / 2 / 3 / 1,5 / 6,3 / BDRAWTO 5,4 / DRAWTO 0
//
// `.WGD WFG`'s comment — "CATWALK COLOR WHEN COLLIDED" — is the identifying
// evidence that WFF/WFG IS the trench catwalk (M-012). WFG is the FLASHING
// collided colour twin (VJFLS); it strokes `DRAWTO 6,3`, but the shared table
// has only points 0..5 — a genuine 1983 ROM out-of-bounds read, transcribed
// verbatim in the bake as the audit record (see romModels.generated.ts header).
// The collided COLOUR variant is a render concern (our wireframes carry no
// per-object colour-flash) and, with the deferred ship glow/roll (A-018), is out
// of this story's scope — so WFG is not ported as a Model3D. Its ROM bug is
// documented below so a future port cannot re-introduce the out-of-range edge.

import { describe, it, expect } from 'vitest'
import { TRENCH_CATWALK } from '../../src/core/models'
import { ROM_MODELS } from '../../src/tools/romModels.generated'
import { ROM_TO_PORT, pairOne, verdictFor } from '../../src/tools/romCompare'
import type { Vec3 } from '@arcade/shared/math3d'

// --- the hand-transcribed oracle --------------------------------------------

const S = 8 // .S = 8 ;NOTE HALF SIZE DUE TO PSUB LACK OF DIV2

/** One `.PH x,y,z` row: `.WORD x*.S, y*.S, z*.S`. Literals read in the file's
 *  own hex radix — passed as JS hex so the source and the test line up. */
const ph = (x: number, y: number, z: number): Vec3 => [x * S, y * S, z * S]

/** WSOBJ.MAC's `.WP WFF` point table, verbatim and in ROM order. */
const WFF_TABLE: readonly Vec3[] = [
  ph(-0x20, 0, 0), ph(-0x20, 0x40, 0), //  0-1 FRONT MIDLINE   x=-256, rises 0→512
  ph(0, 0, -0x20), ph(0, 0x40, -0x20), //  2-3 BOTTOM MIDLINE  z=-256
  ph(0, 0, 0x20), ph(0, 0x40, 0x20), //  4-5 TOP MIDLINE     z=+256
]

/** `.WGD WFF` (WSOBJ.MAC:1819-1823): `PLOT 1 / DRAWTO 0,2,3,1,5,4,0`. PLOT n
 *  starts the run at point n pen-UP; each DRAWTO strokes a visible line to the
 *  next index. So the pen walks 1→0→2→3→1→5→4→0. */
const WFF_EDGES: readonly (readonly [number, number])[] = [
  [1, 0], [0, 2], [2, 3], [3, 1], [1, 5], [5, 4], [4, 0],
]

/** `.WGD WFG` collided twin (WSOBJ.MAC:1831-1848), hand-walked, INCLUDING the
 *  ROM's out-of-range `DRAWTO 6,3` (point 6 does not exist in the 6-point
 *  table). BDRAWTO 5,4 = blank-move to 5 then stroke to 4. */
const WFG_EDGES: readonly (readonly [number, number])[] = [
  [1, 0], [0, 2], [2, 3], [3, 1], [1, 5], [5, 6], [6, 3], [5, 4], [4, 0],
]

// --- helpers ----------------------------------------------------------------

const key = ([a, b]: readonly [number, number]) => (a <= b ? `${a}-${b}` : `${b}-${a}`)
const edgeSet = (edges: readonly (readonly [number, number])[]) => new Set(edges.map(key))
const romWFF = () => ROM_MODELS.find((m) => m.name === 'WFF')!
const romWFG = () => ROM_MODELS.find((m) => m.name === 'WFG')!

// ---------------------------------------------------------------------------
// The oracle itself. If the hand transcription and the bake disagree, one of
// them is wrong and every other assertion is worthless — so check that FIRST,
// against WSOBJ.MAC rather than against models.ts.
// ---------------------------------------------------------------------------

describe('sw7-19 — the ROM oracle (hand-transcribed from WSOBJ.MAC `.WP WFF` / `.WGD WFF`)', () => {
  it('the baked WFF carries the hand-transcribed 6-point table, in ROM order', () => {
    expect(romWFF().vertices).toEqual(WFF_TABLE)
    expect(romWFF().scale, '.S = 8').toBe(S)
  })

  it('the baked WFF draw list matches the hand-walked `.WGD WFF` strokes', () => {
    expect(edgeSet(romWFF().edges)).toEqual(edgeSet(WFF_EDGES))
    expect(romWFF().edges).toHaveLength(7)
    expect(romWFF().hasDrawList, 'sw5-1 recovered it').toBe(true)
  })

  it('refutes the decimal misreading — .RADIX 16 makes the corners hex, not decimal', () => {
    // -0x20 * 8 = -256, NOT decimal -20 * 8 = -160; 0x40 * 8 = 512, NOT 40 * 8 = 320.
    expect(WFF_TABLE[0][0]).toBe(-256)
    expect(WFF_TABLE[0][0]).not.toBe(-160)
    const riseY = Math.max(...WFF_TABLE.map((v) => v[1]))
    expect(riseY).toBe(512)
    expect(riseY).not.toBe(320)
  })
})

// ---------------------------------------------------------------------------
// M-012 — the PORT model. TRENCH_CATWALK must become the WFF wall force field.
// ---------------------------------------------------------------------------

describe('sw7-19 / M-012 — TRENCH_CATWALK is the authentic `.WP WFF` wall force field', () => {
  it('carries the WFF vertex table, 1:1 in ROM order (deep-equal, like romCompare)', () => {
    // romCompare.verticesEqual is a DEEP, order-sensitive equality (sw5-5), and
    // ORIENTATION is the shell's job (render.ts), so the model holds raw ROM
    // vertices. RED: TRENCH_CATWALK currently ships an 8-vertex horizontal girder.
    expect(TRENCH_CATWALK.vertices).toEqual(WFF_TABLE)
  })

  it('strokes the `.WGD WFF` draw list, and nothing fabricated', () => {
    expect(edgeSet(TRENCH_CATWALK.edges)).toEqual(edgeSet(WFF_EDGES))
    expect(TRENCH_CATWALK.edges).toHaveLength(7)
  })

  it('is a VERTICAL wall barrier that rises 512 in height, not a flat channel girder', () => {
    // The old girder is thin in y (y∈[-12,12] ⇒ height 24). WFF rises the full
    // 0x40*8 = 512 up the wall. This one number separates a wall barrier from a
    // floor cross-brace, and is why a centred pilot can no longer just dive it.
    const ys = TRENCH_CATWALK.vertices.map((v) => v[1])
    const height = Math.max(...ys) - Math.min(...ys)
    expect(height).toBe(512)
    expect(height).not.toBe(24) // the fabricated girder's height — refuted
  })
})

// ---------------------------------------------------------------------------
// romCompare wiring — the contact sheet must now PAIR WFF with the port and
// declare the edges a match (today WFF is deliberately unmapped in ROM_TO_PORT).
// ---------------------------------------------------------------------------

describe('sw7-19 / M-012 — romCompare pairs WFF ↔ the port and confirms the match', () => {
  it('ROM_TO_PORT maps WFF to the Trench Catwalk port model', () => {
    // RED: WFF is currently absent from ROM_TO_PORT (the trench furniture was
    // "PROVISIONAL — not enough evidence to assert equivalence"; M-012 supplies it).
    expect(ROM_TO_PORT.WFF).toBe(TRENCH_CATWALK.name)
  })

  it('verdictFor the WFF/port pair is a clean edge match (vertices + edges agree)', () => {
    const pair = pairOne(romWFF(), TRENCH_CATWALK.name, TRENCH_CATWALK)
    expect(pair.verticesMatch, 'WFF vertices == port vertices').toBe(true)
    const verdict = verdictFor(pair)
    expect(verdict.drift, 'no ROM/port drift').toBe(false)
    expect(verdict.text).toBe('✓ edges match')
  })
})

// ---------------------------------------------------------------------------
// WFG — documented, NOT ported. Guards the 1983 ROM out-of-range read so a
// future collided-colour port cannot smuggle an undefined edge into a Model3D.
// ---------------------------------------------------------------------------

describe('sw7-19 — WFG (collided colour twin) is the ROM bug, kept out of the port', () => {
  it('the baked WFG matches the hand-walked `.WGD WFG` strokes, out-of-range edge and all', () => {
    expect(edgeSet(romWFG().edges)).toEqual(edgeSet(WFG_EDGES))
  })

  it('the baked WFG stroke reaches index 6, beyond its 6-point table (the 1983 out-of-bounds read)', () => {
    const maxIdx = Math.max(...romWFG().edges.flat())
    expect(maxIdx).toBe(6)
    expect(maxIdx).toBeGreaterThan(romWFG().vertices.length - 1) // 6 > 5 — undefined geometry
  })

  it('the port does NOT adopt the WFG out-of-range edge — every port edge indexes a real vertex', () => {
    // models.test.ts already enforces this for allModels(); pinned here too so
    // the intent survives if a colour variant is ever added. WFF (the ported
    // shape) tops out at index 5; only WFG reaches the phantom 6.
    const n = TRENCH_CATWALK.vertices.length
    for (const [a, b] of TRENCH_CATWALK.edges) {
      expect(a).toBeLessThan(n)
      expect(b).toBeLessThan(n)
    }
  })
})
