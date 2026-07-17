// tests/core/trench-panel-grid.test.ts
//
// Story sw7-6 (R6a) — B-010 KEYSTONE: the ROM's 4-slot × 2-bit wall-panel grid.  RED phase.
//
// THE DEFECT (finding B-010, docs/audit/findings/pair-trench.json): our trench
// wall content is an 8-entry hand-authored list of {turret|square|catwalk}
// entities (src/core/trench-obstacles.ts). "Our structure cannot represent
// per-wall 4-slot columns at any constant setting." The cabinet builds trench
// content from a PANEL GRID: each wedge is a 3-byte record
//   [WG$TYP, WG$PNL (left-wall descriptor), WG$PNR (right-wall descriptor)]
// and each descriptor byte packs 4 stacked vertical wall SLOTS, each a 2-bit
// type:  0 = blank, 1 = decorative PANEL (TD$WPN), 2 = force-field / CATWALK
// (TD$WFF), 3 = GUN (TD$WGA).  (WSBASE.MAC §WEDGES; WSPANL.MAC §WSPANL draw loop.)
//
// THE PACKING (WSBASE.MAC:182-192, the SHORT/LONG macro):
//     .BYTE  .A1*4+.A2*4+.A3*4+.A4
// MACRO-11 evaluates strictly LEFT-TO-RIGHT with NO operator precedence, so this
// is  ((A1*4 + A2) * 4 + A3) * 4 + A4  =  64·A1 + 16·A2 + 4·A3 + A4  — a clean
// 4×2-bit byte with A1 = TOP slot (bits 6-7) and A4 = BOTTOM slot (bits 0-1)
// (finding B-010 refutation_corrections, verified against the CATWALK-AT-TOP /
// CATWALK-AT-BOTTOM wedge comments). The NAIVE read of the same text — treating
// `*` as multiplying each term, i.e. 4·(A1+A2+A3)+A4 — is REFUTED here so a lazy
// port cannot regress to it.
//
// These are UNIT tests of a data model that does not exist yet (Dev builds
// src/core/trench-wedges.ts in GREEN), so they fail at import — that is the
// intended RED for a unit suite. The model must EXPRESS a per-wall 4-slot column
// of 2-bit types; the 8-entity list cannot, which is the whole point of B-010.

import { describe, it, expect } from 'vitest'
import {
  PANEL_BLANK,
  PANEL_PANEL,
  PANEL_FORCEFIELD,
  PANEL_GUN,
  WEDGE_SHORT,
  WEDGE_LONG,
  WEDGE_END,
  WEDGE_PORT,
  WEDGE_NEXT,
  decodePanelColumn,
  wedgeLength,
  wedgeGroup,
  WEDGE_GROUP_IDS,
  type Wedge,
} from '../../src/core/trench-wedges'

// The exact `.BYTE .A1*4+.A2*4+.A3*4+.A4` under MACRO-11 left-to-right evaluation.
// This is the ORACLE the model must reproduce; it is NOT decodePanelColumn's inverse
// by construction (we compute it independently) so encode∘decode is a real round-trip.
const romPack = (a1: number, a2: number, a3: number, a4: number) => ((a1 * 4 + a2) * 4 + a3) * 4 + a4

describe('sw7-6 B-010 — panel-column byte encoding (64·A1 + 16·A2 + 4·A3 + A4)', () => {
  it('slot type constants are the ROM 2-bit types (TD$W*): 0 blank / 1 panel / 2 force-field / 3 gun', () => {
    expect(PANEL_BLANK).toBe(0)
    expect(PANEL_PANEL).toBe(1)
    expect(PANEL_FORCEFIELD).toBe(2) // TD$WFF — the catwalk / force-field slot
    expect(PANEL_GUN).toBe(3) // TD$WGA — the wall gun slot
  })

  it('decodes a column to [top, upper-mid, lower-mid, bottom] MSB-first (A1 is the TOP slot)', () => {
    // TWDG92 middle wedge `SHORT 2,3,3,3` (WSBASE.MAC:880) — 0xBF.
    expect(romPack(2, 3, 3, 3)).toBe(0xbf)
    expect(decodePanelColumn(0xbf)).toEqual([PANEL_FORCEFIELD, PANEL_GUN, PANEL_GUN, PANEL_GUN])
    // All-blank and all-gun endpoints.
    expect(decodePanelColumn(0x00)).toEqual([0, 0, 0, 0])
    expect(decodePanelColumn(0xff)).toEqual([3, 3, 3, 3])
    // TWDG95 middle `SHORT 1,1,1,1` (all decorative panels) = 0x55.
    expect(romPack(1, 1, 1, 1)).toBe(0x55)
    expect(decodePanelColumn(0x55)).toEqual([1, 1, 1, 1])
    // TWDG01 first wedge `SHORT 0,0,2,0` (a lone force-field in slot 3) = 8.
    expect(romPack(0, 0, 2, 0)).toBe(8)
    expect(decodePanelColumn(8)).toEqual([0, 0, 2, 0])
  })

  it('REFUTES the naive read 4·(A1+A2+A3)+A4 — 0xBF is not 35', () => {
    // The lazy transcription of `.A1*4+.A2*4+.A3*4+.A4` (multiply each term) gives
    // 4·(2+3+3)+3 = 35 for SHORT 2,3,3,3. The real MACRO-11 value is 191. A model
    // that packs the byte wrong (35) decodes to garbage; pin the refutation.
    expect(4 * (2 + 3 + 3) + 3).toBe(35)
    expect(romPack(2, 3, 3, 3)).not.toBe(35)
    expect(decodePanelColumn(35)).not.toEqual([2, 3, 3, 3])
  })

  it('the TOP/BOTTOM ordering matches the ROM catwalk comments (A1 top, A4 bottom)', () => {
    // TWDG92 "CATWALK AT TOP" middle = SHORT 2,3,3,3 → force-field in the FIRST slot.
    expect(decodePanelColumn(romPack(2, 3, 3, 3))[0]).toBe(PANEL_FORCEFIELD)
    // TWDG96 "CATWALK AT BOTTOM" middle = SHORT 3,3,3,2 (WSBASE.MAC:908) → force-field
    // in the LAST slot. This is what fixes top-vs-bottom without a render.
    expect(romPack(3, 3, 3, 2)).toBe(0xfe)
    expect(decodePanelColumn(0xfe)[3]).toBe(PANEL_FORCEFIELD)
    expect(decodePanelColumn(0xfe)[0]).toBe(PANEL_GUN)
  })

  it('encode ∘ decode round-trips every legal column (all 4^4 = 256 combinations)', () => {
    for (let a1 = 0; a1 < 4; a1++)
      for (let a2 = 0; a2 < 4; a2++)
        for (let a3 = 0; a3 < 4; a3++)
          for (let a4 = 0; a4 < 4; a4++) {
            const byte = romPack(a1, a2, a3, a4)
            expect(byte).toBeGreaterThanOrEqual(0)
            expect(byte).toBeLessThanOrEqual(255)
            expect(decodePanelColumn(byte)).toEqual([a1, a2, a3, a4])
          }
  })
})

describe('sw7-6 B-010 — wedge record model (type + left/right 4-slot columns)', () => {
  it('wedge type bytes are TYP$* (WSBASE.MAC:102-106)', () => {
    expect(WEDGE_SHORT).toBe(1)
    expect(WEDGE_LONG).toBe(2)
    expect(WEDGE_END).toBe(3)
    expect(WEDGE_PORT).toBe(4)
    expect(WEDGE_NEXT).toBe(5)
  })

  it('a SHORT wedge is one $800 spacing and a LONG wedge is $1000 (WSBASE.MAC DOFAR/NWFAR)', () => {
    expect(wedgeLength(WEDGE_SHORT)).toBe(0x800) // 2048
    expect(wedgeLength(WEDGE_LONG)).toBe(0x1000) // 4096
    // Non-length markers occupy no channel length.
    expect(wedgeLength(WEDGE_END)).toBe(0)
    expect(wedgeLength(WEDGE_NEXT)).toBe(0)
  })

  it('each wedge carries an independent LEFT and RIGHT 4-slot column — the thing the 8-entity list cannot express', () => {
    // TWDG54 "8 GUNS LEFT SIDE THEN RIGHT" (WSBASE.MAC:852-863) is the canonical
    // proof that a wedge's two walls differ: `SHORT 3,0,0,3 0,0,0,0` — guns on the
    // LEFT wall only. A model with one shared descriptor, or an entity list keyed
    // to a single kind, cannot represent left≠right.
    const g54 = wedgeGroup(54)
    const asymmetric = g54.find(
      (w: Wedge) => JSON.stringify(w.left) !== JSON.stringify(w.right) && w.type === WEDGE_SHORT,
    )
    expect(asymmetric, 'TWDG54 has a SHORT wedge with left != right').toBeDefined()
    expect(asymmetric!.left).toEqual([3, 0, 0, 3])
    expect(asymmetric!.right).toEqual([0, 0, 0, 0])
  })
})

describe('sw7-6 B-010 — wedge groups & concrete divider content (WSBASE.MAC)', () => {
  it('there are exactly 53 named wedge groups: TWDG01-37, 41-45, 53-55, 92-99', () => {
    const expected = [
      ...Array.from({ length: 37 }, (_, i) => i + 1), // 01..37
      41, 42, 43, 44, 45,
      53, 54, 55,
      92, 93, 94, 95, 96, 97, 98, 99,
    ]
    expect([...WEDGE_GROUP_IDS].sort((a, b) => a - b)).toEqual(expected)
    expect(WEDGE_GROUP_IDS.length).toBe(53)
  })

  it('TWDG92 "8 PANEL DIVIDER WITH CATWALK AT TOP" — 3 SHORT wedges + NEXT (WSBASE.MAC:878-882)', () => {
    const g = wedgeGroup(92)
    // SHORT 0,1,1,0 / SHORT 2,3,3,3 / SHORT 0,1,1,0 / NEXT
    expect(g.map((w) => w.type)).toEqual([WEDGE_SHORT, WEDGE_SHORT, WEDGE_SHORT, WEDGE_NEXT])
    expect(g[0].left).toEqual([0, 1, 1, 0])
    expect(g[1].left).toEqual([2, 3, 3, 3]) // catwalk (force-field) on top, guns below
    expect(g[1].right).toEqual([2, 3, 3, 3])
    // The catwalk is a force-field slot, NOT a separate entity kind — B-012 lives here too.
    expect(g[1].left[0]).toBe(PANEL_FORCEFIELD)
  })

  it('TWDG95 "8 PANEL DIVIDER" is all decorative panels (no guns, no catwalk) (WSBASE.MAC:899-903)', () => {
    const g = wedgeGroup(95)
    expect(g[1].left).toEqual([1, 1, 1, 1])
    expect(g[1].right).toEqual([1, 1, 1, 1])
    for (const w of g) {
      for (const slot of [...w.left, ...w.right]) {
        expect(slot).not.toBe(PANEL_GUN)
        expect(slot).not.toBe(PANEL_FORCEFIELD)
      }
    }
  })

  it('the PORT wedge and the END terminator live in the terminal groups (TWDG29/98/99)', () => {
    // TWDG98 "EASY PORT" (WSBASE.MAC:920-935), TWDG99 "HARD PORT" (:938-948) and
    // TWDG29 "HARDER PORT" (:624-634) all end `... PORT ... / END`. These are the
    // groups the pies terminate on.
    for (const id of [29, 98, 99]) {
      const g = wedgeGroup(id)
      const types = g.map((w) => w.type)
      expect(types.filter((t) => t === WEDGE_PORT).length, `group ${id} has exactly one PORT`).toBe(1)
      expect(types[types.length - 1], `group ${id} ends with END`).toBe(WEDGE_END)
      // PORT precedes END.
      expect(types.indexOf(WEDGE_PORT)).toBeLessThan(types.indexOf(WEDGE_END))
    }
  })

  it('every wedge in every group has two 4-slot columns of legal 2-bit types', () => {
    for (const id of WEDGE_GROUP_IDS) {
      for (const w of wedgeGroup(id)) {
        // END/NEXT are markers; content wedges (SHORT/LONG/PORT) carry columns.
        if (w.type === WEDGE_SHORT || w.type === WEDGE_LONG || w.type === WEDGE_PORT) {
          expect(w.left).toHaveLength(4)
          expect(w.right).toHaveLength(4)
          for (const slot of [...w.left, ...w.right]) {
            expect(slot).toBeGreaterThanOrEqual(0)
            expect(slot).toBeLessThanOrEqual(3)
          }
        }
      }
    }
  })
})
