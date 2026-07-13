// tests/core/trench-rom-geometry.test.ts
//
// Story sw5-6 — RED phase (O'Brien / TEA): the Death Star trench, pinned from the ROM.
//
// GROUND TRUTH is WSBASE.MAC and WSMAIN.MAC (~/Projects/star-wars-1983-source-text),
// the 1983 Atari source. Everything below is transcribed BY HAND from those files, so
// the clone is checked against an INDEPENDENT oracle rather than against itself.
//
// == WHY THIS STORY EXISTS ====================================================
//
// sw5-4 re-ported EXHAUST_PORT from `.WP PORT` and concluded the plate stands VERTICAL,
// facing the pilot. It does not. The ROM's third coordinate is HEIGHT, not depth — its
// own macro says so:
//
//   .MACRO .PGND .A,.B,.C        ;OFFSET HITE TO MID OF PLAYERS HITE
//   .WORD .A'*.S,.B'*.S,.C'*.S-GD$MDT     <- the HEIGHT offset hits the THIRD component
//
// render.ts already knew this (TOWER_ORIENT: "The ROM's up-axis is Z (x is fore/aft,
// y lateral); ours is Y"). Every one of PORT's twelve points has third component 0, so
// the plate is flat in the HEIGHT plane — it is HORIZONTAL. And BSVPORT seats it on the
// floor, in as many words:
//
//   BSVPORT:                     ;VIEW THE EXHAUST PORT
//     LDD #-1000
//     STD M.GD+4                 ;Z HITE ON BOTTOM OF TRENCH
//     LDD #0
//     STD M.GD+2                 ;Y WIDTH IN CENTER
//
// The port is a hole in the trench FLOOR. sw5-4 fed the ROM triples into our y-up world
// without the axis remap that TOWER_ORIENT exists to perform, standing the plate on its
// edge — which is why half of it hangs below the floor. The defect is an axis-mapping
// error, NOT a too-short trench.
//
// == THE TRENCH ITSELF ========================================================
//
// WSBASE.MAC `TBSBL` ("BASE BOTTOM LINES") is the trench cross-section, verbatim. Each
// row is (Y offset, Z offset) — Y lateral, Z height (`LDD 0(U) ;Y OFFSET` / `LDD 2(U)
// ;Z OFFSET`):
//
//   .WORD -400,0          ;TOP LEFT PANEL
//   .WORD  400,0          ;TOP OF RIGHT PANEL
//   .WORD -400,-1000      ;FAR LEFT BOTTOM
//   .WORD -200,-1000      ;LEFT THIRD
//   .WORD  200,-1000      ;RIGHT THIRD
//   .WORD  400,-1000      ;FAR RIGHT BOTTOM
//
// Corroborated by BSVSID ("VIEW SIDE OF BASE TRENCH"): `LDD #-400 ;LEFT SIDE` /
// `LDD #400 ;RIGHT SIDE`, and BSVSDW: `LDD #-1000 ;BOTTOM EDGE`, `;LIMIT TO BOTTOM`.
//
// So the trench TOP is at height 0, its FLOOR at -1000, its walls at ±400.
//
// ⚠ THE LITERALS ARE HEX. WSBASE.MAC is `.RADIX 16` and carries no `.RADIX` line to warn
// you — the same trap that bit sw3-11 and sw5-5. Two independent proofs, both in the file:
//
//   1. DOFAR's comment: ";PAINFUL MATH -- 8000 WRAPAROUND HANDLER". Only 0x8000 is the
//      signed-16 wraparound point. Decimal 8000 is not special in any way.
//   2. `CMPD #7000` is the far cutoff — and the disassembly independently reports that
//      same cull as $7000. Hex on both sides.
//
// Read in hex: half-width 0x400 = 1024, depth 0x1000 = 4096. The clone shipped 256 and
// 320, both self-declared `PROVISIONAL … not pinned`. The real trench is a deep, narrow
// CANYON (2048 wide × 4096 deep); ours is a wide, shallow ditch (512 × 320).
//
// AC-2's premise — "the ROM base half-width is 256, EXACTLY TRENCH_HALF_W … strong
// corroboration that 256 is right" — is a COINCIDENCE. Our 256 was provisionally taken
// from `Obj_Trench_Squares`, which is trench FURNITURE (the floor squares); the PORT's
// base half-width is independently also 256. The trench is ±1024 and neither number
// says anything about the other.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  TRENCH_HALF_W,
  TRENCH_WALL_H,
  trenchChannel,
} from '../../src/core/trench-channel'

// --- the hand-transcribed ROM oracle ----------------------------------------

/** WSBASE.MAC `TBSBL`, verbatim, in the file's own hex radix: (lateral, height). */
const TBSBL: readonly (readonly [number, number])[] = [
  [-0x400, 0], //       TOP LEFT PANEL
  [0x400, 0], //        TOP OF RIGHT PANEL
  [-0x400, -0x1000], // FAR LEFT BOTTOM
  [-0x200, -0x1000], // LEFT THIRD
  [0x200, -0x1000], //  RIGHT THIRD
  [0x400, -0x1000], //  FAR RIGHT BOTTOM
]

/** The trench's own dimensions, read off TBSBL. Top is height 0; the floor is below it. */
const ROM_HALF_W = 0x400 //  1024 — BSVSID `LDD #-400 ;LEFT SIDE` / `LDD #400 ;RIGHT SIDE`
const ROM_DEPTH = 0x1000 // 4096 — BSVSDW `LDD #-1000 ;BOTTOM EDGE` / `;LIMIT TO BOTTOM`

describe('sw5-6 — the ROM oracle (hand-transcribed from WSBASE.MAC)', () => {
  it('TBSBL describes a trench ±0x400 wide whose floor is 0x1000 below its top', () => {
    const lateral = TBSBL.map(([y]) => y)
    const height = TBSBL.map(([, z]) => z)

    expect(Math.max(...lateral), 'right wall').toBe(ROM_HALF_W)
    expect(Math.min(...lateral), 'left wall').toBe(-ROM_HALF_W)

    // Two heights only: the top rails (0) and the bottom lines (-0x1000).
    expect(new Set(height)).toEqual(new Set([0, -ROM_DEPTH]))
    expect(Math.max(...height) - Math.min(...height), 'top → floor').toBe(ROM_DEPTH)
  })

  it('is a CANYON — deeper than it is wide (the shape of the thing, not just its size)', () => {
    // 2048 across, 4096 down: exactly 2:1 taller than wide. Any port of this that comes
    // out wider than it is deep has misread something, whatever the absolute numbers.
    expect(ROM_DEPTH).toBeGreaterThan(2 * ROM_HALF_W)
    expect(ROM_DEPTH / (2 * ROM_HALF_W), 'depth : width').toBe(2)
  })

  it('the literals are HEX — and the decimal reading is arithmetically REFUTED', () => {
    // The trap that has now bitten this repo three times (sw3-11, sw5-5, and sw5-4's
    // reading of the port's plane). Refute it in the test so it cannot come back.
    expect(ROM_HALF_W, '0x400').toBe(1024)
    expect(ROM_DEPTH, '0x1000').toBe(4096)

    // Read as decimal, TBSBL's `400` and `1000` would be 400 and 1000 — plausible-looking
    // numbers that are simply not the trench.
    expect(TRENCH_HALF_W, 'the decimal misreading of `#400`').not.toBe(400)
    expect(TRENCH_WALL_H, 'the decimal misreading of `#-1000`').not.toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// AC-2 — TRENCH_WALL_H and TRENCH_HALF_W are PINNED, not guessed.
// ---------------------------------------------------------------------------

describe('sw5-6 AC-2 — the trench anchors are pinned from the ROM', () => {
  it('TRENCH_HALF_W is the ROM\'s ±0x400, not the provisional 256', () => {
    expect(TRENCH_HALF_W).toBe(ROM_HALF_W)
    // 256 came from `Obj_Trench_Squares` — trench FURNITURE sitting ON the floor, not the
    // trench. It is also, coincidentally, the PORT's base half-width; that coincidence is
    // what sw5-4 mistook for corroboration.
    expect(TRENCH_HALF_W, 'the Obj_Trench_Squares furniture ring must not anchor the trench')
      .not.toBe(256)
  })

  it('TRENCH_WALL_H is the ROM\'s 0x1000, not the provisional 320', () => {
    expect(TRENCH_WALL_H).toBe(ROM_DEPTH)
    expect(TRENCH_WALL_H, 'the guessed 320 is gone').not.toBe(320)
  })

  it('neither anchor is still marked PROVISIONAL in the source', () => {
    // The markers live in doc comments, invisible to any import-based assertion — they
    // have to be read as text. This epic exists because a guess became ground truth and
    // then became a doc citation; leaving the marker on a now-pinned constant is the
    // same failure running in reverse.
    const src = readFileSync(
      new URL('../../src/core/trench-channel.ts', import.meta.url),
      'utf8',
    )
    const declLine = (name: string): string => {
      const i = src.indexOf(`export const ${name}`)
      expect(i, `${name} is still exported`).toBeGreaterThan(-1)
      // the declaration plus its trailing same-line comment
      return src.slice(i, src.indexOf('\n', i))
    }
    expect(declLine('TRENCH_HALF_W')).not.toMatch(/PROVISIONAL/)
    expect(declLine('TRENCH_WALL_H')).not.toMatch(/PROVISIONAL/)
  })
})

// ---------------------------------------------------------------------------
// The generated channel must actually BE that trench.
// ---------------------------------------------------------------------------

describe('sw5-6 — trenchChannel() builds the ROM trench', () => {
  const model = trenchChannel(0)
  const xs = model.vertices.map((v) => v[0])
  const ys = model.vertices.map((v) => v[1])

  it('its walls stand at ±TRENCH_HALF_W', () => {
    expect(Math.min(...xs)).toBe(-TRENCH_HALF_W)
    expect(Math.max(...xs)).toBe(TRENCH_HALF_W)
  })

  it('its floor is y=0 and its top rails are a full TRENCH_WALL_H above them', () => {
    // We keep the FLOOR at y = 0 (as trenchChannel, spawnPort and the surface phase all
    // already do) and let the walls rise to +TRENCH_WALL_H. That is the ROM's frame with
    // the origin slid to the floor: relative geometry — which is what fidelity means —
    // is preserved exactly, and the port's own y=0 spawn stays correct.
    expect(Math.min(...ys), 'the floor').toBe(0)
    expect(Math.max(...ys), 'the top rails').toBe(TRENCH_WALL_H)
  })

  it('reads as a canyon: taller than it is wide', () => {
    const width = Math.max(...xs) - Math.min(...xs)
    const height = Math.max(...ys) - Math.min(...ys)
    expect(height, 'a corridor you fly DOWN, not a ditch you fly OVER').toBeGreaterThan(width)
  })
})
