// tests/core/surface-mazes.test.ts
//
// Story sw4-3 — Surface maze port (spec §C). RED phase (Furiosa / TEA).
//
// The surface phase's ground objects are NOT random — the 1983 cabinet ships
// hand-authored per-wave TOWER MAZES in WSGRND.MAC ("TOWER MAZES", ~line 144):
// one ground-object table per maze, each entry a TOWER / BISHOP / BUNKER at an
// explicit top-view coordinate (X ±right, Y forward, hex, out to $7C00+). This
// suite pins the pure-data transcription that GREEN adds as
// `src/core/surfaceMazes.ts` — data only, in the spirit of `models.ts`.
//
// --- ROM provenance (~/Projects/star-wars-1983-source-text/WSGRND.MAC) -------
//
// MACROS (WSGRND.MAC ~112-140):
//   TOWER  .A,.B,.C  → .WORD .B,.A ; .BYTE 1 (PC$TWR) ; increments .TWRS
//   BISHOP .A,.B,.C  → .WORD .B,.A ; .BYTE 2 (PC$BSH) ; increments .TWRS
//   BUNKER .A,.B,.C  → .WORD .B,.A ; .BYTE 3 (PC$BNK) ; does NOT touch .TWRS
//   .A = X (+right/-left), .B = Y (forward). `.TWRS` is the per-maze tower count
//   (BCD), consumed by IGRND as GD.TWL ("# OF TOWERS LEFT"). Bunkers are
//   shootable scenery-guns that never count toward the tower quota.
//
// PREFIX STRUCTURE: each maze has a base form (T{NAME}, e.g. TDIFF) and an
//   extended form (T3{NAME}, e.g. T3DIFF) at the SAME address; the base ends at
//   `MAZEND {NAME}`, the extended appends four more towers and ends at
//   `MAZEND 3{NAME}`. So the base entry list is a strict PREFIX of the extended
//   list (spec §C: "encode as one entry list + two lengths, not two copies").
//   BUNK is the lone unpaired maze (wave-2 "bunker wave", no T3BUNK).
//
// The golden tables below are the ROM's own declared counts — the per-maze
// `;N TOWERS` header comments and the assembler's `.TWRS`, transcribed straight
// from WSGRND.MAC and re-verified by counting the macro lines. They are an
// INDEPENDENT cross-check on the coordinate transcription (a checksum), not a
// copy of it — the full coordinate diff-vs-ROM is the Reviewer's job.
//
// Everything obeys the sacred boundary: pure data, no DOM, no time, no RNG.

import { describe, it, expect } from 'vitest'
import {
  SURFACE_MAZES,
  getMaze,
  type SurfaceMaze,
  type MazeEntry,
} from '../../src/core/surfaceMazes'

// The 19 mazes in WSGRND.MAC TGDPTR order, with their ROM-declared tower counts
// (TOWER + BISHOP entries; BUNKER excluded). Verified against both the per-maze
// `;N TOWERS` comments and a macro-line recount.
const ROM_TOWER_COUNTS: ReadonlyArray<readonly [name: string, towers: number]> = [
  ['BUNK', 0],
  ['SQUARE', 16],
  ['CLUSTR', 16],
  ['TURNON', 20],
  ['WEDGE', 20],
  ['DIFF', 20],
  ['TRAP', 21],
  ['SYMTRC', 21],
  ['VALLEY', 27],
  ['TWRCTY', 28],
  ['3SQUARE', 20],
  ['3CLUSTR', 20],
  ['3TURNON', 24],
  ['3WEDGE', 24],
  ['3DIFF', 24],
  ['3TRAP', 25],
  ['3SYMTRC', 25],
  ['3VALLEY', 31],
  ['3TWRCTY', 32],
]

// Base → extended pairs. Each extended form appends exactly four towers.
const MAZE_PAIRS: ReadonlyArray<readonly [base: string, extended: string]> = [
  ['SQUARE', '3SQUARE'],
  ['CLUSTR', '3CLUSTR'],
  ['TURNON', '3TURNON'],
  ['WEDGE', '3WEDGE'],
  ['DIFF', '3DIFF'],
  ['TRAP', '3TRAP'],
  ['SYMTRC', '3SYMTRC'],
  ['VALLEY', '3VALLEY'],
  ['TWRCTY', '3TWRCTY'],
]

const towerBishopEntries = (m: SurfaceMaze): readonly MazeEntry[] =>
  m.entries.filter((e) => e.kind === 'tower' || e.kind === 'bishop')
const bunkerEntries = (m: SurfaceMaze): readonly MazeEntry[] =>
  m.entries.filter((e) => e.kind === 'bunker')

// --- AC1: the module is a pure-data registry of {x,y,kind,typeDigit} entries --

describe('sw4-3 — surfaceMazes is a pure-data registry (like models.ts)', () => {
  it('exports all 19 authored mazes, each with a name and a non-empty entry list', () => {
    expect(SURFACE_MAZES).toHaveLength(19)
    for (const m of SURFACE_MAZES) {
      expect(typeof m.name).toBe('string')
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.entries.length).toBeGreaterThan(0)
    }
  })

  it('registers every ROM maze name (getMaze resolves each)', () => {
    for (const [name] of ROM_TOWER_COUNTS) {
      const m = getMaze(name)
      expect(m, `maze ${name} must be registered`).toBeDefined()
      expect(m!.name).toBe(name)
    }
  })

  it('every entry is a {x,y,kind,typeDigit} record with a consistent kind↔typeDigit map', () => {
    // PC$TWR=1, PC$BSH=2, PC$BNK=3 (WSGRND.MAC ground-object picture bytes).
    const digitFor: Record<string, number> = { tower: 1, bishop: 2, bunker: 3 }
    for (const m of SURFACE_MAZES) {
      for (const e of m.entries) {
        expect(['tower', 'bishop', 'bunker']).toContain(e.kind)
        expect(e.typeDigit).toBe(digitFor[e.kind])
        expect(Number.isInteger(e.x)).toBe(true)
        expect(Number.isInteger(e.y)).toBe(true)
      }
    }
  })
})

// --- AC2 (geometry, EXACT): counts cross-check the ROM; radix guard; clamp cube -

describe('sw4-3 — maze geometry matches the ROM (transcription cross-check)', () => {
  it.each(ROM_TOWER_COUNTS)('%s carries %i towers (TOWER+BISHOP; bunkers excluded)', (name, towers) => {
    const m = getMaze(name)!
    expect(towerBishopEntries(m)).toHaveLength(towers)
    expect(m.towerCount).toBe(towers) // the maze's own declared count agrees
  })

  it('every base maze has 28 entries and every extended maze has 32 (uniform ROM shape)', () => {
    for (const [base, extended] of MAZE_PAIRS) {
      expect(getMaze(base)!.entries).toHaveLength(28)
      expect(getMaze(extended)!.entries).toHaveLength(32)
    }
    expect(getMaze('BUNK')!.entries).toHaveLength(28) // unpaired, base shape
  })

  it('coordinates are hex multiples of 0x400 — the radix guard against a decimal misread', () => {
    // Every WSGRND coordinate is a multiple of $400 (1024) read as HEX. A decimal
    // misread (e.g. `5000` as 5000 not $5000=20480) is NOT a $400 multiple, so
    // this catches the coordinate radix trap without copying the coordinates.
    for (const m of SURFACE_MAZES) {
      for (const e of m.entries) {
        expect(Math.abs(e.x) & 0x3ff, `${m.name} x=${e.x}`).toBe(0)
        expect(Math.abs(e.y) & 0x3ff, `${m.name} y=${e.y}`).toBe(0)
      }
    }
  })

  it('coordinates stay inside the play cube: |x| ≤ $8000, 0 ≤ y ≤ $8000 (Y forward)', () => {
    for (const m of SURFACE_MAZES) {
      for (const e of m.entries) {
        expect(Math.abs(e.x)).toBeLessThanOrEqual(0x8000)
        expect(e.y).toBeGreaterThanOrEqual(0)
        expect(e.y).toBeLessThanOrEqual(0x8000)
      }
    }
  })
})

// --- AC2 (bunkers quota-neutral): TTWRS counts towers+bishops only -----------

describe('sw4-3 — bunkers are quota-neutral (WSGRND BUNKER never touches .TWRS)', () => {
  it('towerCount excludes bunkers — a maze with bunkers has more entries than towerCount', () => {
    const square = getMaze('SQUARE')!
    expect(bunkerEntries(square).length).toBeGreaterThan(0)
    expect(square.towerCount).toBe(16)
    expect(square.entries.length).toBeGreaterThan(square.towerCount) // 28 > 16
    expect(square.towerCount + bunkerEntries(square).length).toBe(square.entries.length)
  })

  it('BUNK is the bunkers-only wave: 0 towers, every entry a bunker (spec §C "wave 2")', () => {
    const bunk = getMaze('BUNK')!
    expect(bunk.towerCount).toBe(0)
    expect(bunk.entries.every((e) => e.kind === 'bunker')).toBe(true)
    expect(towerBishopEntries(bunk)).toHaveLength(0)
  })

  it('bishops DO count toward towerCount (BISHOP increments .TWRS, unlike BUNKER)', () => {
    // DIFF authors two BISHOP entries among its 20 towers — they are counted.
    const diff = getMaze('DIFF')!
    const bishops = diff.entries.filter((e) => e.kind === 'bishop')
    expect(bishops.length).toBeGreaterThan(0)
    expect(towerBishopEntries(diff)).toHaveLength(diff.towerCount)
  })
})

// --- AC3: prefix structure — base entry list ⊂ extended entry list -----------

describe('sw4-3 — prefix structure: T3{NAME} extends T{NAME} (base ⊂ extended)', () => {
  it.each(MAZE_PAIRS)('%s is the exact prefix of %s, which appends four towers', (baseName, extName) => {
    const base = getMaze(baseName)!
    const ext = getMaze(extName)!
    // The base entry list is a strict prefix of the extended entry list.
    expect(ext.entries.slice(0, base.entries.length)).toEqual(base.entries)
    // The extension appends exactly four more entries, all towers (+4 to .TWRS).
    expect(ext.entries.length).toBe(base.entries.length + 4)
    expect(ext.towerCount).toBe(base.towerCount + 4)
    const appended = ext.entries.slice(base.entries.length)
    expect(appended).toHaveLength(4)
    expect(appended.every((e) => e.kind === 'tower')).toBe(true)
  })

  it('the extended coordinates genuinely differ from the base tail (real append, not a copy)', () => {
    // Guards a vacuous "prefix" that just duplicated the last base rows.
    const diff = getMaze('DIFF')!
    const d3 = getMaze('3DIFF')!
    const appended = d3.entries.slice(diff.entries.length)
    // Every appended tower sits deeper (larger Y) than the base's deepest row —
    // the T3 forms extend the maze outward to Y=$8000.
    const baseMaxY = Math.max(...diff.entries.map((e) => e.y))
    expect(appended.every((e) => e.y >= baseMaxY)).toBe(true)
  })
})

// --- Rule enforcement: immutable pure data (lang-review #2 readonly) ----------

describe('sw4-3 — the maze registry is stable, immutable data', () => {
  it('is a singleton — repeated reads return the identical object graph (no regeneration)', () => {
    // Two DISTINCT lookups must return the same instance (not a rebuilt copy).
    expect(getMaze('DIFF')).toBe(getMaze('DIFF'))
    expect(getMaze('3TWRCTY')).toBe(SURFACE_MAZES[SURFACE_MAZES.length - 1])
  })

  it('exposes no unknown maze (getMaze is undefined for a non-name, not a throw)', () => {
    expect(getMaze('NOT_A_MAZE')).toBeUndefined()
  })
})
