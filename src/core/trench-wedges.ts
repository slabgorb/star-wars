// src/core/trench-wedges.ts
//
// The Death Star trench as the CABINET builds it — finding B-010 (KEYSTONE) and
// B-011 (docs/audit/findings/pair-trench.json). Our old trench was an 8-entry
// hand-authored list of {turret|square|catwalk} entities that "cannot represent
// per-wall 4-slot columns at any constant setting". The ROM assembles the trench
// from a PANEL GRID: an ordered chain of WEDGES, each carrying an independent
// left- and right-wall descriptor, chosen from 53 named wedge groups arranged
// into 11 predefined "pies" (one authored trench per early wave) plus a runtime
// random pie for the later waves.
//
// PURE DATA + PURE ASSEMBLER. This module is core: no DOM, no time, no
// Math.random — the only randomness is the seeded Rng carried in for the random
// pie. Rendering the panel CONTENT (catwalk collision, wall guns) is R6b/R6c and
// deliberately NOT built here (story sw7-6 scope: data model + traversal).
//
// SOURCE OF TRUTH: ~/Projects/star-wars-1983-source-text/WSBASE.MAC (the original
// 1983 MACRO-11 source, LF-normalised; .RADIX 16). This file is a 1:1
// transcription of its BASE PIE AND WEDGE TABLES — the data below mirrors the
// SHORT/LONG/PORT/NEXT/END macro lines line-for-line so it can be diff-traced.
// It is machine-local / gitignored, so the bytes must live here literally (a
// source-reading test would skip silently in CI — the skipIf trap).
//
// PANEL BYTE PACKING (WSBASE.MAC:182-192, the SHORT/LONG macro):
//     .BYTE  .A1*4+.A2*4+.A3*4+.A4
// MACRO-11 evaluates strictly LEFT-TO-RIGHT with no operator precedence, so this
// is ((A1*4+A2)*4+A3)*4+A4 = 64·A1 + 16·A2 + 4·A3 + A4 — a clean 4×2-bit byte
// with A1 the TOP slot (bits 6-7) and A4 the BOTTOM slot (bits 0-1). The naive
// read 4·(A1+A2+A3)+A4 is WRONG (it gives 35 for SHORT 2,3,3,3 instead of 0xBF).
// We author each wall as its four decoded slot values [top, upperMid, lowerMid,
// bottom] directly (the S/L/PORT helpers below), so the packing is only relevant
// to decodePanelColumn, which reproduces it independently.

import { createRng, nextInt, type Rng } from '@arcade/shared/rng'

/** Panel-slot types — the ROM's 2-bit TD$W* codes (WSPANL.MAC draw loop). */
export const PANEL_BLANK = 0 // empty wall slot
export const PANEL_PANEL = 1 // TD$WPN — a decorative wall panel
export const PANEL_FORCEFIELD = 2 // TD$WFF — force-field / catwalk slot
export const PANEL_GUN = 3 // TD$WGA — a wall gun

/** Wedge types — TYP$* (WSBASE.MAC:102-106). */
export const WEDGE_SHORT = 1 // TYP$SHORT — a $800 spacing wedge
export const WEDGE_LONG = 2 // TYP$LONG  — a $1000 spacing wedge
export const WEDGE_END = 3 // TYP$END   — end of trench
export const WEDGE_PORT = 4 // TYP$PORT  — the exhaust port
export const WEDGE_NEXT = 5 // TYP$NXT   — get next wedge from the pie (group divider)

/** A wall column: four stacked 2-bit slots, [top, upperMid, lowerMid, bottom]. */
export type PanelColumn = readonly [number, number, number, number]

/** One wedge: a type plus an independent left- and right-wall column. The two
 *  columns can differ (e.g. TWDG54 "8 GUNS LEFT SIDE THEN RIGHT") — the thing the
 *  old single-kind entity list could not express. NEXT/END markers carry blank
 *  columns; only SHORT/LONG/PORT wedges carry meaningful content. */
export interface Wedge {
  readonly type: number
  readonly left: PanelColumn
  readonly right: PanelColumn
}

const BLANK: PanelColumn = [PANEL_BLANK, PANEL_BLANK, PANEL_BLANK, PANEL_BLANK]

/**
 * Decode a packed panel-descriptor byte into its four slot values, MSB-first:
 * A1 (top) in bits 6-7 … A4 (bottom) in bits 0-1. The exact inverse of the ROM's
 * `64·A1 + 16·A2 + 4·A3 + A4` packing.
 */
export function decodePanelColumn(byte: number): PanelColumn {
  return [(byte >> 6) & 3, (byte >> 4) & 3, (byte >> 2) & 3, byte & 3]
}

/**
 * The channel length a wedge occupies, straight off DOFAR's spacing decision
 * (WSBASE.MAC:1091-1103): SHORT reserves `#800`, END reserves `#0`
 * ("DO HIM IMMEDIATELY"), and ALL ELSE — LONG and PORT — reserves `#1000`
 * ("ALL ELSE NEEDS 1000 SPACE FOR SAFETY"). NEXT is resolved to the next pie's
 * wedge before the spacing is read, so it carries none of its own. So the PORT
 * wedge is a full $1000 long and the END wall lands $1000 BEYOND the port
 * (BS.ELC > BS.PLC).
 */
export function wedgeLength(type: number): number {
  if (type === WEDGE_SHORT) return 0x800
  if (type === WEDGE_END || type === WEDGE_NEXT) return 0
  return 0x1000 // LONG and PORT — DOFAR's "all else"
}

// The SHORT/LONG/PORT/NEXT/END macros, as constructors — one call per ROM line so
// the tables below read like the assembler source. Args are the decoded slot
// values: left top..bottom, then right top..bottom.
const col = (a: number, b: number, c: number, d: number): PanelColumn => [a, b, c, d]
const S = (l0: number, l1: number, l2: number, l3: number, r0: number, r1: number, r2: number, r3: number): Wedge =>
  ({ type: WEDGE_SHORT, left: col(l0, l1, l2, l3), right: col(r0, r1, r2, r3) })
const L = (l0: number, l1: number, l2: number, l3: number, r0: number, r1: number, r2: number, r3: number): Wedge =>
  ({ type: WEDGE_LONG, left: col(l0, l1, l2, l3), right: col(r0, r1, r2, r3) })
const PORT = (l0: number, l1: number, l2: number, l3: number, r0: number, r1: number, r2: number, r3: number): Wedge =>
  ({ type: WEDGE_PORT, left: col(l0, l1, l2, l3), right: col(r0, r1, r2, r3) })
const NEXT: Wedge = { type: WEDGE_NEXT, left: BLANK, right: BLANK }
const END: Wedge = { type: WEDGE_END, left: BLANK, right: BLANK }

/**
 * The 53 named wedge groups (WSBASE.MAC §WEDGES). Each is a chain of content
 * wedges terminated by NEXT (advance to the next pie entry) — except the three
 * terminal PORT groups (TWDG29/98/99), which end PORT then END. The per-group
 * comment is the ROM's own WEDGE DESCRIPTIONS line (WSBASE.MAC:953-1003).
 */
const GROUPS: Record<number, readonly Wedge[]> = {
  // TWDG01 — 8 GUNS - 7 SINGLES ACROSS - EASY TO MEDIUM FLYING
  1: [
    S(0, 0, 2, 0, 0, 0, 2, 0),
    L(0, 0, 0, 0, 0, 0, 0, 3),
    L(0, 2, 0, 0, 0, 2, 0, 0),
    S(0, 0, 0, 3, 0, 3, 0, 0),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    L(2, 0, 0, 0, 2, 0, 3, 0),
    L(0, 3, 2, 0, 0, 0, 2, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 3, 2, 3, 0, 0, 2),
    S(3, 0, 0, 0, 0, 0, 0, 0),
    L(2, 0, 0, 0, 2, 0, 0, 0),
    NEXT,
  ],
  // TWDG02 — 8 GUNS - 4 SINGLES ACROSS - EASY FLYING
  2: [
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 3, 2, 0, 0, 0, 2, 0),
    L(0, 0, 0, 3, 0, 0, 0, 3),
    L(2, 0, 0, 0, 2, 3, 0, 0),
    L(0, 0, 3, 0, 0, 0, 3, 0),
    L(3, 0, 0, 2, 3, 0, 0, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 2, 0, 0, 0, 2, 0),
    NEXT,
  ],
  // TWDG03 — 8 GUNS - SEMI-ROLLER COASTER - HARD FLYING
  3: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 0, 0, 2, 2, 0, 0),
    S(0, 0, 0, 3, 0, 0, 0, 3),
    S(0, 0, 2, 2, 0, 0, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 3, 2, 0, 0, 3, 2, 0),
    S(0, 2, 0, 0, 0, 2, 0, 0),
    S(3, 0, 0, 0, 3, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 3, 2, 0, 0, 3, 2),
    S(0, 0, 2, 0, 0, 0, 2, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 2, 0, 0, 0, 2, 0),
    S(0, 2, 0, 0, 0, 2, 0, 0),
    S(2, 0, 0, 0, 2, 0, 0, 0),
    NEXT,
  ],
  // TWDG04 — 8 GUNS ALL LEVELS L & R - EASY FLYING
  4: [
    L(0, 0, 0, 0, 0, 3, 0, 0),
    L(0, 0, 3, 0, 0, 0, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 3),
    L(3, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 0, 3, 0, 0, 0),
    L(0, 0, 0, 3, 0, 0, 0, 0),
    L(0, 0, 0, 0, 0, 0, 3, 0),
    L(0, 3, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG05 — 8 GUNS - EASY ROLLER COASTER - MEDIUM FLYING
  5: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 2, 0, 0, 2, 2, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 3, 0, 0, 0, 3),
    L(0, 0, 2, 2, 0, 0, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(3, 0, 0, 0, 3, 0, 0, 0),
    L(2, 2, 0, 0, 2, 2, 0, 0),
    S(0, 0, 0, 3, 0, 0, 0, 3),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 3, 2, 2, 0, 3, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG06 — 0 GUNS - TIGHT ROLLER COASTER - HARD FLYING
  6: [
    S(0, 0, 2, 2, 0, 0, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 0, 0, 2, 2, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 2, 2, 0, 0, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 0, 0, 2, 2, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 2, 2, 0, 0, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 0, 0, 2, 2, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 2, 2, 0, 0, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 0, 0, 2, 2, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG07 — 8 GUNS - 8 SINGLES TOP AND BOTTOM - EASY FLYING
  7: [
    L(2, 0, 0, 0, 2, 0, 0, 0),
    L(2, 0, 3, 0, 2, 0, 0, 3),
    L(2, 3, 0, 0, 2, 0, 0, 0),
    L(2, 0, 0, 0, 2, 3, 0, 0),
    L(0, 0, 0, 2, 0, 0, 0, 2),
    L(0, 3, 0, 2, 0, 0, 3, 2),
    L(0, 0, 3, 2, 3, 0, 0, 2),
    L(0, 0, 0, 2, 0, 0, 0, 2),
    NEXT,
  ],
  // TWDG08 — 6 GUNS - 8 SINGLES BOTTOM TO TOP - EASY TO MEDIUM FLYING
  8: [
    L(0, 0, 0, 2, 0, 0, 0, 2),
    L(0, 3, 0, 2, 0, 3, 0, 2),
    L(0, 0, 0, 2, 0, 0, 0, 2),
    L(3, 0, 2, 0, 3, 0, 2, 0),
    L(0, 0, 2, 0, 0, 0, 2, 0),
    L(0, 0, 2, 0, 0, 0, 2, 0),
    L(3, 2, 0, 0, 3, 2, 0, 0),
    L(0, 2, 0, 0, 0, 2, 0, 0),
    NEXT,
  ],
  // TWDG09 — 6 GUNS - 24 HALVES - MEDIUM TO HARD FLYING
  9: [
    S(0, 2, 0, 2, 2, 0, 2, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 0, 2, 0, 0, 2, 0, 2),
    S(0, 3, 0, 3, 3, 0, 3, 0),
    S(2, 2, 0, 0, 0, 0, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 2, 2, 2, 2, 0, 0),
    S(3, 0, 0, 0, 0, 0, 0, 3),
    L(0, 2, 2, 0, 2, 0, 0, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 0, 2, 0, 0, 2, 2, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG10 — 8 GUNS - 24 PANELS -- INTRO WEDGE - EASY FLYING
  10: [
    L(1, 0, 0, 1, 1, 0, 0, 1),
    L(1, 0, 0, 1, 1, 0, 0, 1),
    L(0, 1, 1, 0, 0, 1, 1, 0),
    L(0, 1, 1, 0, 0, 1, 1, 0),
    L(1, 0, 0, 1, 1, 0, 0, 1),
    L(1, 0, 0, 1, 1, 0, 0, 1),
    S(0, 3, 3, 0, 0, 3, 3, 0),
    S(3, 0, 0, 3, 3, 0, 0, 3),
    NEXT,
  ],
  // TWDG11 — 8 GUNS - 5 SINGLES ACROSS - EASY TO MEDIUM FLYING
  11: [
    L(2, 0, 0, 0, 2, 0, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 2, 0, 0, 0, 2, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(3, 2, 0, 0, 3, 2, 0, 0),
    L(0, 0, 0, 3, 0, 0, 0, 3),
    L(0, 0, 3, 2, 0, 0, 3, 2),
    L(2, 3, 0, 0, 2, 3, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG12 — 8 GUNS - 3 DOUBLES ACROSS - EASY TO MEDIUM FLYING
  12: [
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 2, 2, 0, 0, 2, 2),
    L(0, 3, 0, 0, 0, 3, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 2, 2, 3, 0, 2, 2, 3),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(3, 0, 0, 0, 3, 0, 0, 0),
    L(2, 2, 3, 0, 2, 2, 3, 0),
    NEXT,
  ],
  // TWDG13 — 8 GUNS - 8 ALTERNATING HALVES ON BOTTOM - EASY FLYING
  13: [
    L(0, 0, 0, 3, 0, 0, 0, 3),
    L(0, 0, 0, 2, 0, 0, 0, 0),
    S(3, 0, 0, 0, 0, 0, 0, 2),
    L(0, 0, 0, 2, 0, 3, 0, 0),
    S(0, 3, 0, 0, 0, 0, 0, 2),
    L(0, 0, 0, 2, 0, 0, 3, 0),
    S(0, 0, 3, 0, 0, 0, 0, 2),
    L(0, 0, 0, 2, 3, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG14 — 8 GUNS - 4 SINGLES ACROSS - 1 TRIPLE - MEDIUM FLYING
  14: [
    S(0, 0, 0, 2, 0, 0, 0, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(3, 3, 0, 2, 3, 3, 0, 2),
    S(0, 0, 3, 0, 0, 0, 3, 0),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 2, 0, 2, 2, 2, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 3, 0, 0, 0, 3),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG15 — 3 GUNS - 4 TRIPLES - 4 HALVES -- QUICK SLANT - HARD FLYING
  15: [
    L(0, 2, 2, 2, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 2, 2, 2, 2, 2, 2, 0),
    L(0, 0, 0, 0, 0, 0, 0, 3),
    L(0, 0, 0, 0, 0, 0, 3, 0),
    L(0, 0, 0, 0, 0, 0, 0, 3),
    L(2, 2, 2, 2, 2, 2, 2, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 2, 2, 2, 2, 2, 2, 2),
    NEXT,
  ],
  // TWDG16 — 8 GUNS - 6 DOUBLES - TIGHT HUMP, SEMI-ROLLER - HARD FLYING
  16: [
    L(0, 0, 3, 0, 0, 0, 3, 0),
    L(0, 0, 0, 3, 0, 0, 0, 3),
    L(2, 2, 0, 0, 2, 2, 0, 0),
    S(0, 0, 0, 3, 0, 0, 0, 3),
    S(0, 0, 2, 2, 0, 0, 2, 2),
    S(0, 2, 2, 0, 0, 2, 2, 0),
    S(0, 0, 2, 2, 0, 0, 2, 2),
    L(2, 2, 0, 0, 2, 2, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 2, 0, 3, 2, 2, 0, 3),
    NEXT,
  ],
  // TWDG17 — 0 GUNS - 4 TRIPLES - MEDIUM FLYING
  17: [
    L(2, 2, 2, 0, 2, 2, 2, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 2, 2, 2, 0, 2, 2, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 2, 2, 0, 2, 2, 2, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 2, 2, 2, 0, 2, 2, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG18 — 4 GUNS - 6 SINGLES, 1 DOUBLE, 8 HALVES, 2 TRIPLES - HARD FLYING
  18: [
    L(2, 0, 2, 0, 2, 0, 2, 0),
    S(0, 2, 0, 2, 0, 2, 0, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(3, 0, 3, 0, 3, 0, 3, 0),
    L(2, 0, 0, 2, 2, 0, 0, 2),
    S(0, 2, 2, 0, 0, 2, 2, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 2, 2, 0, 0, 0, 0),
    S(0, 0, 0, 0, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 2, 2, 0, 2, 2, 2, 0),
    S(0, 2, 2, 2, 0, 2, 2, 2),
    NEXT,
  ],
  // TWDG19 — 8 GUNS - 16 HALVES, 1 DOUBLE, 2 SINGLES - MEDIUM FLYING
  19: [
    S(0, 0, 2, 2, 2, 2, 0, 0),
    S(3, 0, 0, 0, 0, 0, 3, 0),
    S(2, 2, 0, 0, 0, 0, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 2, 2, 0, 0, 0, 0, 0),
    S(0, 0, 0, 3, 3, 0, 0, 0),
    S(0, 2, 2, 0, 0, 2, 2, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 0, 0, 0, 2, 0, 0, 0),
    S(0, 3, 0, 0, 0, 0, 0, 3),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    S(0, 0, 3, 0, 0, 0, 0, 0),
    S(0, 2, 2, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 3, 0, 0),
    S(2, 0, 0, 2, 0, 2, 2, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG20 — 10 GUNS - 2 TRIPLES, 8 SINGLES - HARD FLYING
  20: [
    S(2, 0, 0, 0, 2, 0, 0, 0),
    S(0, 2, 0, 0, 0, 2, 0, 0),
    S(0, 0, 2, 0, 0, 0, 2, 0),
    S(0, 3, 0, 0, 0, 0, 3, 0),
    S(0, 2, 2, 2, 0, 2, 2, 2),
    S(3, 0, 0, 0, 3, 0, 0, 0),
    S(0, 2, 0, 0, 0, 2, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 2, 0, 0, 0, 2, 0, 0),
    S(3, 0, 0, 0, 3, 0, 0, 0),
    S(0, 2, 0, 0, 0, 2, 0, 0),
    S(3, 0, 0, 0, 3, 0, 0, 0),
    S(2, 2, 2, 0, 2, 2, 2, 0),
    S(0, 0, 2, 0, 0, 0, 2, 0),
    S(0, 0, 0, 3, 0, 0, 0, 3),
    S(0, 0, 2, 0, 0, 0, 2, 0),
    NEXT,
  ],
  // TWDG21 — 8 GUNS - 6 SINGLES ACROSS - EASY TO MEDIUM FLYING
  21: [
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 2, 0, 0, 0, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 0, 0, 2, 2, 0, 0, 2),
    S(0, 3, 3, 0, 0, 3, 3, 0),
    S(0, 3, 3, 0, 0, 3, 3, 0),
    S(2, 0, 0, 2, 2, 0, 0, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 2, 0, 0, 0, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG22 — 8 GUNS - 10 SINGLES ACROSS TOP AND BOTTOM - EASY TO MEDIUM FLYING
  22: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    L(2, 0, 3, 0, 2, 0, 3, 0),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    L(2, 3, 0, 0, 2, 3, 0, 0),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    L(2, 0, 3, 0, 2, 0, 3, 0),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    L(2, 3, 0, 0, 2, 3, 0, 0),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    L(2, 0, 0, 0, 2, 0, 0, 0),
    NEXT,
  ],
  // TWDG23 — 12 GUNS - 6 SINGLES - 1 DOUBLE -- LONG DOWN-UP - MEDIUM FLYING
  23: [
    L(0, 0, 2, 2, 0, 0, 2, 2),
    L(2, 3, 0, 0, 2, 3, 0, 0),
    L(0, 2, 3, 0, 0, 2, 3, 0),
    L(0, 0, 2, 3, 0, 0, 2, 3),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 3, 2, 0, 0, 3, 2),
    L(0, 3, 2, 0, 0, 3, 2, 0),
    L(3, 2, 0, 0, 3, 2, 0, 0),
    NEXT,
  ],
  // TWDG24 — 0 GUNS - 32 HALVES -- R AND L JOGS - HARD FLYING
  24: [
    S(0, 0, 0, 0, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 2, 2, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 2, 2, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 2, 2, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 2, 2, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG25 — 8 GUNS - 6 SINGLES - 3 DOUBLES -- DOWN HUMP DOWN - HARD FLYING
  25: [
    S(2, 3, 0, 0, 2, 3, 0, 0),
    S(0, 2, 3, 0, 0, 2, 3, 0),
    S(0, 0, 2, 0, 0, 0, 2, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 2, 2, 0, 0, 2, 2),
    L(2, 2, 0, 0, 2, 2, 0, 0),
    L(0, 0, 2, 2, 0, 0, 2, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 3, 0, 0, 2, 3, 0, 0),
    S(0, 2, 3, 0, 0, 2, 3, 0),
    S(0, 0, 2, 0, 0, 0, 2, 0),
    NEXT,
  ],
  // TWDG26 — 0 GUNS - 3 DOUBLES - 20 HALVES -- HALVES UP DOWN HALVES - HARD FLYING
  26: [
    S(2, 2, 2, 2, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 2, 2, 2, 0, 0, 0, 0),
    S(0, 0, 2, 2, 0, 0, 2, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 0, 0, 2, 2, 0, 0),
    L(0, 0, 2, 2, 0, 0, 2, 2),
    S(0, 0, 0, 0, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 2, 2, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG27 — 4 GUNS - 6 SINGLES BOTTOM TO TOP - EASY TO MEDIUM FLYING
  27: [
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 3, 0, 2, 0, 0, 3, 2),
    L(0, 0, 0, 2, 0, 0, 0, 2),
    L(0, 0, 2, 0, 0, 0, 2, 0),
    L(3, 0, 2, 0, 3, 0, 2, 0),
    L(0, 2, 0, 0, 0, 2, 0, 0),
    L(0, 2, 0, 0, 0, 2, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG28 — 6 GUNS - 6 SINGLES TOP TO BOTTOM - EASY TO MEDIUM FLYING
  28: [
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 0, 3, 0, 2, 0, 3, 0),
    L(2, 0, 0, 0, 2, 0, 0, 0),
    L(0, 2, 0, 3, 0, 2, 0, 3),
    L(0, 2, 0, 0, 0, 2, 0, 0),
    L(0, 0, 2, 0, 0, 0, 2, 0),
    L(0, 0, 2, 3, 0, 0, 2, 3),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG29 — 16 GUNS - HARDER PORT - PROTECT YOURSELF
  29: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 2, 2, 2, 0, 2, 2, 2),
    S(0, 2, 0, 0, 0, 2, 0, 0),
    L(3, 0, 0, 0, 3, 0, 0, 0),
    L(0, 3, 0, 0, 0, 3, 0, 0),
    L(3, 0, 3, 0, 3, 0, 3, 0),
    L(0, 3, 0, 3, 0, 3, 0, 3),
    S(0, 0, 3, 0, 0, 0, 3, 0),
    PORT(0, 0, 0, 3, 0, 0, 0, 3),
    END,
  ],
  // TWDG30 — 2 GUNS - 26 HALVES, 1 TRIPLE, 2 DOUBLES, 1 SINGLE - HARD FLYING
  30: [
    S(2, 2, 2, 0, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 3, 2, 2, 2, 2),
    L(2, 2, 2, 2, 0, 0, 0, 3),
    S(0, 0, 0, 0, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 0, 2, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 2, 2, 2, 2),
    L(2, 2, 2, 2, 0, 0, 0, 0),
    S(0, 0, 0, 0, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG31 — 10 GUNS - 3 DOUBLES ACROSS BOTTOM - MEDIUM FLYING
  31: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(3, 0, 0, 0, 0, 3, 0, 0),
    L(0, 0, 2, 2, 0, 0, 2, 2),
    S(0, 3, 0, 0, 3, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(3, 0, 0, 0, 0, 3, 0, 0),
    L(0, 0, 2, 2, 0, 0, 2, 2),
    S(0, 3, 0, 0, 3, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(3, 0, 0, 0, 0, 3, 0, 0),
    L(0, 0, 2, 2, 0, 0, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG32 — 6 GUNS - 5 SINGLES - 6 HALVES -- STAY L, THEN STAY R - MEDIUM FLYING
  32: [
    S(0, 0, 0, 2, 0, 0, 0, 2),
    L(0, 3, 0, 0, 2, 0, 0, 0),
    L(0, 0, 3, 0, 0, 2, 0, 0),
    L(3, 0, 0, 2, 0, 0, 2, 2),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    L(0, 0, 2, 2, 3, 0, 0, 2),
    L(0, 2, 0, 0, 0, 0, 3, 0),
    L(2, 0, 0, 0, 0, 3, 0, 0),
    L(0, 0, 0, 2, 0, 0, 0, 2),
    NEXT,
  ],
  // TWDG33 — 10 GUNS - 10 SINGLES - MEDIUM FLYING
  33: [
    S(0, 0, 0, 2, 0, 0, 0, 2),
    S(3, 0, 0, 0, 3, 0, 0, 0),
    S(0, 2, 0, 0, 0, 2, 0, 0),
    S(0, 0, 3, 2, 0, 0, 3, 2),
    S(0, 0, 2, 0, 0, 0, 2, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    S(0, 2, 3, 0, 0, 2, 3, 0),
    S(2, 0, 0, 0, 2, 0, 0, 0),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 0, 3, 0, 2, 0, 3, 0),
    S(0, 2, 0, 0, 0, 2, 0, 0),
    S(0, 0, 0, 3, 0, 0, 0, 3),
    NEXT,
  ],
  // TWDG34 — 10 GUNS - 9 SINGLES - MEDIUM FLYING
  34: [
    S(0, 0, 0, 3, 0, 0, 0, 3),
    L(0, 0, 0, 2, 0, 0, 0, 2),
    S(0, 0, 2, 0, 0, 0, 2, 0),
    L(2, 3, 0, 0, 2, 3, 0, 0),
    L(0, 0, 2, 0, 0, 0, 2, 0),
    S(0, 3, 0, 2, 0, 3, 0, 2),
    L(3, 0, 2, 0, 3, 0, 2, 0),
    L(2, 0, 0, 0, 2, 0, 0, 0),
    S(0, 2, 0, 0, 0, 2, 0, 0),
    L(0, 0, 2, 3, 0, 0, 2, 3),
    NEXT,
  ],
  // TWDG35 — 10 GUNS - 2 SINGLES - 4 DOUBLES - 10 HALVES - HARD FLYING
  35: [
    S(0, 0, 3, 2, 0, 0, 3, 2),
    L(0, 0, 2, 2, 0, 0, 0, 0),
    S(2, 2, 0, 0, 2, 2, 0, 0),
    L(0, 0, 0, 0, 0, 0, 2, 2),
    S(3, 3, 2, 2, 3, 3, 2, 2),
    L(0, 0, 2, 2, 0, 0, 0, 0),
    S(2, 2, 0, 0, 2, 2, 0, 0),
    L(0, 0, 0, 0, 0, 0, 2, 2),
    S(3, 3, 2, 2, 3, 3, 2, 2),
    L(0, 0, 2, 2, 0, 0, 0, 0),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    NEXT,
  ],
  // TWDG36 — 2 GUNS - 26 HALVES, 1 TRIPLE, 2 DOUBLES, 1 SINGLE - HARD FLYING
  36: [
    S(2, 2, 2, 2, 0, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 2, 2, 0, 0, 0, 3),
    L(0, 0, 0, 3, 2, 2, 2, 2),
    S(2, 2, 2, 2, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 2, 2, 2, 0, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 2, 2, 0, 0, 0, 0),
    L(0, 0, 0, 0, 2, 2, 2, 2),
    S(2, 2, 2, 2, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG37 — 0 GUNS - 4 TRIPLES, 2 DOUBLES, 2 SINGLES, 2 HALFS - HARD FLYING
  37: [
    L(0, 2, 2, 2, 0, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 2, 2, 0, 2, 2, 2, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 2, 2, 2, 0, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 2, 2, 0, 2, 2, 2, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 0, 2, 2, 2, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 2, 2, 2, 2, 2, 0, 2),
    NEXT,
  ],
  // TWDG41 — 8 GUNS ONLY MIDDLE LEVELS - EASY FLYING
  41: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 3, 0, 0, 0, 0, 3, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 3, 0, 0, 3, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 3, 0, 0, 0, 0, 3, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 3, 0, 0, 3, 0, 0),
    NEXT,
  ],
  // TWDG42 — 8 GUNS ALL LEVELS - EASY FLYING
  42: [
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 3, 3, 0, 0, 3, 3, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(3, 0, 0, 3, 3, 0, 0, 3),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG43 — 16 GUNS ALL LEVELS - EASY FLYING - MANY SHOTS
  43: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(3, 0, 0, 0, 3, 0, 0, 0),
    L(0, 3, 0, 0, 0, 3, 0, 0),
    S(0, 0, 3, 0, 0, 0, 3, 0),
    S(0, 0, 0, 3, 0, 0, 0, 3),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(3, 0, 0, 0, 3, 0, 0, 0),
    L(0, 3, 0, 0, 0, 3, 0, 0),
    S(0, 0, 3, 0, 0, 0, 3, 0),
    S(0, 0, 0, 3, 0, 0, 0, 3),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG44 — 8 GUNS - 6 SINGLES, 1 DOUBLE - MEDIUM FLYING
  44: [
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 2, 0, 0, 0, 2),
    L(0, 3, 2, 0, 0, 3, 2, 0),
    S(2, 2, 0, 3, 2, 2, 0, 3),
    S(0, 0, 0, 2, 0, 0, 0, 2),
    L(2, 0, 3, 0, 2, 0, 3, 0),
    L(0, 0, 0, 2, 0, 0, 0, 2),
    L(0, 3, 2, 0, 0, 3, 2, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG45 — 12 GUNS - 1 SINGLE - 8 STAGGERED HALVES - MEDIUM FLYING
  45: [
    S(0, 0, 0, 2, 0, 0, 0, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 3, 0, 2, 0, 0, 3, 0),
    S(3, 0, 0, 0, 0, 3, 0, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 0, 0, 3, 3, 2, 0, 3),
    S(0, 3, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 3, 0, 0, 0, 0),
    S(0, 0, 0, 0, 2, 3, 0, 2),
    S(2, 2, 3, 0, 0, 0, 3, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG53 — 16 GUNS ONLY TOP AND BOTTOM - EASY FLYING
  53: [
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(3, 0, 0, 3, 3, 0, 0, 3),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(3, 0, 0, 3, 3, 0, 0, 3),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(3, 0, 0, 3, 3, 0, 0, 3),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(3, 0, 0, 3, 3, 0, 0, 3),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG54 — 8 GUNS LEFT SIDE THEN RIGHT - EASY FLYING
  54: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(3, 0, 0, 3, 0, 0, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 3, 3, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 3, 0, 0, 3),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 0, 0, 3, 3, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG55 — 3 GUNS - 4 SINGLES - 4 DOUBLES - 4 HALVES -- JOG R,L,R,L - HARD FLYING
  55: [
    L(2, 2, 2, 2, 2, 0, 2, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 3, 2, 2, 2, 2, 2, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 2, 2, 2, 2, 2, 2, 3),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    L(2, 2, 3, 2, 2, 2, 2, 2),
    L(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG92 — 6 GUNS - 8 PANEL DIVIDER WITH CATWALK AT TOP
  92: [
    S(0, 1, 1, 0, 0, 1, 1, 0),
    S(2, 3, 3, 3, 2, 3, 3, 3),
    S(0, 1, 1, 0, 0, 1, 1, 0),
    NEXT,
  ],
  // TWDG93 — 0 GUNS - DIVIDER WITH ONE CATWALK AT TOP
  93: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(2, 1, 1, 1, 2, 1, 1, 1),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG94 — 0 GUNS - DIVIDER WITH ONE CATWALK AT BOTTOM
  94: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(1, 1, 1, 2, 1, 1, 1, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG95 — 0 GUNS - 8 PANEL DIVIDER
  95: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(1, 1, 1, 1, 1, 1, 1, 1),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    NEXT,
  ],
  // TWDG96 — 6 GUNS - 8 PANEL DIVDER WITH CATWALK AT BOTTOM
  96: [
    S(0, 1, 1, 0, 0, 1, 1, 0),
    S(3, 3, 3, 2, 3, 3, 3, 2),
    S(0, 1, 1, 0, 0, 1, 1, 0),
    NEXT,
  ],
  // TWDG97 — 8 GUNS - 8 PANELS -- HARD DIVIDER
  97: [
    S(0, 1, 1, 0, 0, 1, 1, 0),
    S(3, 3, 3, 3, 3, 3, 3, 3),
    S(0, 1, 1, 0, 0, 1, 1, 0),
    NEXT,
  ],
  // TWDG98 — 0 GUNS - 34 PANELS -- EASY PORT
  98: [
    S(1, 1, 1, 1, 1, 1, 1, 1),
    S(0, 1, 1, 1, 0, 1, 1, 1),
    S(0, 0, 1, 1, 0, 0, 1, 1),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 1, 1, 0, 0, 1, 1),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 1, 1, 0, 0, 1, 1),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 1, 1, 0, 0, 1, 1),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 1, 0, 0, 0, 1),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    S(0, 0, 0, 1, 0, 0, 0, 1),
    PORT(0, 0, 0, 0, 0, 0, 0, 0),
    END,
  ],
  // TWDG99 — 16 GUNS - 8 PANELS -- HARD PORT
  99: [
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(0, 2, 2, 2, 0, 2, 2, 2),
    S(0, 0, 0, 0, 0, 0, 0, 0),
    L(1, 0, 0, 0, 1, 0, 0, 0),
    L(0, 1, 0, 0, 0, 1, 0, 0),
    L(0, 0, 1, 0, 0, 0, 1, 0),
    L(0, 0, 0, 1, 0, 0, 0, 1),
    S(3, 3, 3, 3, 3, 3, 3, 3),
    PORT(3, 3, 3, 3, 3, 3, 3, 3),
    END,
  ],
}

/** The 53 wedge-group ids, in ascending order (TWDG01-37, 41-45, 53-55, 92-99). */
export const WEDGE_GROUP_IDS: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 41, 42, 43, 44, 45, 53, 54, 55, 92, 93, 94, 95, 96, 97, 98, 99,
]

/** The wedges of one named group (throws on an unknown id — every pie entry and
 *  every WEDGE_GROUP_IDS member must resolve). */
export function wedgeGroup(id: number): readonly Wedge[] {
  const g = GROUPS[id]
  if (!g) throw new Error(`unknown wedge group TWDG${id}`)
  return g
}

/**
 * The 11 predefined pies (TPIE = PIE1..PIE11, WSBASE.MAC:118-178). Each is a chain
 * of 16 wedge-group ids; a pie ends on a PORT-bearing terminal group so every
 * fixed run has a way out. `.PIE` emits the two 8-id halves that make each row.
 */
export const PIES: readonly (readonly number[])[] = [
  [10, 95, 54, 95, 4, 95, 42, 95, 41, 95, 53, 95, 43, 95, 42, 98],
  [10, 95, 4, 93, 7, 93, 31, 95, 21, 95, 22, 95, 41, 94, 7, 98],
  [10, 95, 2, 93, 8, 95, 28, 96, 27, 92, 31, 93, 12, 94, 53, 99],
  [10, 95, 5, 93, 17, 97, 14, 94, 34, 94, 44, 93, 17, 97, 14, 99],
  [10, 95, 44, 93, 33, 94, 27, 92, 28, 96, 12, 94, 11, 94, 1, 99],
  [10, 95, 5, 93, 33, 94, 23, 93, 34, 94, 14, 94, 31, 93, 17, 99],
  [10, 95, 26, 97, 9, 96, 19, 93, 23, 93, 32, 92, 45, 93, 13, 29],
  [10, 95, 3, 94, 37, 96, 6, 96, 25, 94, 16, 94, 20, 94, 18, 29],
  [10, 95, 15, 97, 24, 97, 30, 97, 36, 96, 55, 97, 37, 97, 43, 29],
  [10, 95, 5, 93, 17, 97, 24, 97, 55, 97, 6, 96, 37, 97, 36, 29],
  [10, 95, 15, 97, 24, 97, 35, 93, 16, 94, 20, 94, 18, 92, 6, 29],
]

// The runtime RANDOM pie (BS.WAV >= 11): the PIEXX template with its every-other
// XX slot filled from the TWDGXX pool (WSBASE.MAC:162-179, GNBASE). The fixed
// slots (10,95 lead, alternating 94/97 dividers, 29 terminal port) are the ROM's;
// only the XX slots vary by the run's seed.
const RPIE_TEMPLATE: readonly (number | 'XX')[] = [10, 95, 'XX', 94, 'XX', 97, 'XX', 94, 'XX', 97, 'XX', 94, 'XX', 97, 'XX', 29]
const RANDOM_POOL: readonly number[] = [3, 6, 9, 15, 14, 16, 18, 20, 24, 25, 26, 30, 32, 35, 36, 37, 55]

/** Pick the pie for a 0-based ROM wave (BS.WAV): 0..10 select the fixed authored
 *  pies PIE1..PIE11; >= 11 assemble a random pie by filling the RPIE template's XX
 *  slots from the pool via the seeded RNG (the ROM's `LDB P.RND1; MUL` pick). */
function selectPie(baseWave: number, rng: Rng): readonly number[] {
  if (baseWave >= 0 && baseWave < PIES.length) return PIES[baseWave]
  return RPIE_TEMPLATE.map((e) => (e === 'XX' ? RANDOM_POOL[nextInt(rng, RANDOM_POOL.length)] : e))
}

/**
 * Expand a pie into its ordered wedge chain (the ROM's IWEDGE/DOFAR walk). Within
 * a group, content wedges (SHORT/LONG/PORT) are emitted in order; NEXT terminates
 * the group and advances to the next pie entry; END terminates the whole trench.
 * The returned chain drops the NEXT dividers and ends on its single PORT then END.
 *
 * Pure and deterministic: for BS.WAV 0..10 the RNG is ignored (run-identical
 * authored trenches, finding B-011); for BS.WAV >= 11 the same seed always yields
 * the same chain.
 */
export function buildTrench(baseWave: number, rng: Rng): readonly Wedge[] {
  const pie = selectPie(baseWave, rng)
  const chain: Wedge[] = []
  for (const groupId of pie) {
    for (const w of wedgeGroup(groupId)) {
      if (w.type === WEDGE_NEXT) break // advance to the next pie entry
      chain.push(w)
      if (w.type === WEDGE_END) return chain // trench terminates at the END wedge
    }
  }
  return chain
}

/**
 * The −Z channel offset of the exhaust port in a built trench — the ROM's BS.PLC,
 * the sum of the `$800/$1000` wedge lengths laid before the PORT wedge. Data-driven
 * (walked out of the wedge chain, not a hand-picked constant); the END wall lands
 * one more $1000 beyond it (BS.ELC). Atari balanced every pie to the same channel
 * budget, so this is constant across the waves — but it is READ from the chain, so
 * it moves for free if the data ever does.
 */
export function trenchPortDistance(baseWave: number, rng: Rng): number {
  let acc = 0
  for (const w of buildTrench(baseWave, rng)) {
    if (w.type === WEDGE_PORT) return acc
    acc += wedgeLength(w.type)
  }
  return acc // no PORT in this chain (never happens for a real pie) — its full length
}

/** The default-wave exhaust-port offset (BS.WAV 0 = PIE1). A named anchor for the
 *  sim/tests; `trenchPortDistance` recomputes it per wave at trench entry. */
export const TRENCH_PORT_OFFSET = trenchPortDistance(0, createRng(0))

