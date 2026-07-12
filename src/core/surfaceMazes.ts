// src/core/surfaceMazes.ts
//
// AUTHENTIC per-wave surface TOWER MAZES, transcribed from the 1983 Atari
// source WSGRND.MAC "TOWER MAZES" (~/Projects/star-wars-1983-source-text).
// Pure data — no DOM, no time, no randomness — like models.ts (story sw4-3).
//
// Each ground object is authored top-view: X +right/-left, Y forward (hex,
// out to $8000), on the y=0 floor. TOWER/BISHOP count toward the per-maze
// tower quota (.TWRS); BUNKER never does (shootable but quota-neutral).
//
// PREFIX STRUCTURE: a base maze (e.g. DIFF) and its extended T3 form (3DIFF)
// share one entry list at the SAME source address; the base ends at MAZEND,
// the extended appends four more towers. We store ONE list per family plus a
// base length — the base maze is the prefix slice, the extended is the whole.
//
// The 19 mazes are laid out in WSGRND TGDPTR (wave) order. Coordinates are
// the raw hex ROM units, unscaled (models.ts is likewise raw ROM units).

export type GroundKind = 'tower' | 'bunker' | 'bishop'

export interface MazeEntry {
  /** Source-frame lateral coordinate: +right / -left (raw hex ROM units). */
  readonly x: number
  /** Source-frame forward depth: Y toward the horizon, >= 0 (raw hex ROM units). */
  readonly y: number
  /** Ground-object kind: tower (PC$TWR=1), bishop (PC$BSH=2), bunker (PC$BNK=3). */
  readonly kind: GroundKind
  /** The ROM TGD$PC picture byte: 1 tower, 2 bishop, 3 bunker. */
  readonly typeDigit: 1 | 2 | 3
}

export interface SurfaceMaze {
  /** WSGRND maze name (e.g. 'DIFF', '3DIFF'). */
  readonly name: string
  /** All ground objects, in source order. */
  readonly entries: readonly MazeEntry[]
  /** TOWER+BISHOP count (the ROM .TWRS / TTWRS value); bunkers excluded. */
  readonly towerCount: number
}

// Raw families: one full (extended, where present) entry list + the base length.
// Tuples are [x, y, typeDigit] — the exact WSGRND rows, hex → decimal.
interface RawFamily {
  readonly names: readonly string[] // [base] or [base, extended]
  readonly baseLen: number
  readonly rows: ReadonlyArray<readonly [number, number, 1 | 2 | 3]>
}

const RAW_FAMILIES: readonly RawFamily[] = [
  {
    names: ['BUNK'],
    baseLen: 28,
    rows: [
      [12288, 1024, 3], [8192, 3072, 3], [-26624, 4096, 3], [18432, 5120, 3],
      [-20480, 6144, 3], [-12288, 6144, 3], [-16384, 8192, 3], [14336, 9216, 3],
      [28672, 9216, 3], [0, 10240, 3], [-30720, 12288, 3], [32768, 16384, 3],
      [24576, 17408, 3], [-28672, 18432, 3], [-22528, 18432, 3], [20480, 19456, 3],
      [-8192, 20480, 3], [0, 20480, 3], [10240, 20480, 3], [-18432, 26624, 3],
      [-10240, 26624, 3], [-24576, 28672, 3], [-6144, 28672, 3], [6144, 28672, 3],
      [22528, 28672, 3], [-2048, 30720, 3], [16384, 30720, 3], [26624, 30720, 3],
    ],
  },
  {
    names: ['SQUARE', '3SQUARE'],
    baseLen: 28,
    rows: [
      [-32768, 8192, 3], [-24576, 8192, 3], [-20480, 8192, 3], [20480, 8192, 3],
      [24576, 8192, 3], [-32768, 12288, 1], [-24576, 12288, 1], [-20480, 12288, 1],
      [-12288, 12288, 3], [-8192, 12288, 3], [0, 12288, 3], [8192, 12288, 3],
      [12288, 12288, 3], [20480, 12288, 1], [24576, 12288, 1], [-12288, 16384, 1],
      [-8192, 16384, 1], [0, 16384, 1], [8192, 16384, 1], [12288, 16384, 1], [22528, 18432, 3],
      [28672, 21504, 3], [-28672, 24576, 1], [28672, 24576, 1], [-4096, 26624, 1],
      [4096, 26624, 1], [-16384, 28672, 1], [16384, 28672, 1], [-24576, 32768, 1],
      [-8192, 32768, 1], [8192, 32768, 1], [24576, 32768, 1],
    ],
  },
  {
    names: ['CLUSTR', '3CLUSTR'],
    baseLen: 28,
    rows: [
      [-30720, 12288, 1], [-26624, 12288, 3], [-22528, 12288, 3], [-18432, 12288, 1],
      [-6144, 12288, 1], [-2048, 12288, 3], [2048, 12288, 3], [6144, 12288, 1],
      [18432, 12288, 1], [22528, 12288, 3], [26624, 12288, 3], [30720, 12288, 1],
      [-28672, 16384, 1], [-24576, 16384, 3], [-20480, 16384, 1], [-4096, 16384, 1],
      [4096, 16384, 1], [20480, 16384, 1], [24576, 16384, 3], [28672, 16384, 1],
      [-13312, 21504, 3], [13312, 21504, 3], [-24576, 24576, 1], [-8192, 24576, 3],
      [8192, 24576, 3], [24576, 24576, 1], [-8192, 29696, 1], [8192, 29696, 1],
      [-26624, 32768, 1], [-18432, 32768, 1], [18432, 32768, 1], [26624, 32768, 1],
    ],
  },
  {
    names: ['TURNON', '3TURNON'],
    baseLen: 28,
    rows: [
      [-8192, 4096, 1], [8192, 4096, 1], [-16384, 8192, 3], [16384, 8192, 3],
      [-8192, 10240, 1], [8192, 10240, 1], [-28672, 12288, 3], [-24576, 12288, 3],
      [24576, 12288, 3], [-20480, 14336, 1], [20480, 14336, 1], [-12288, 16384, 3],
      [0, 16384, 3], [12288, 16384, 3], [32768, 16384, 1], [-30720, 20480, 1], [0, 20480, 1],
      [30720, 20480, 1], [-16384, 24576, 1], [16384, 24576, 1], [-12288, 26624, 1],
      [12288, 26624, 1], [-28672, 28672, 1], [-24576, 28672, 1], [-4096, 28672, 1],
      [4096, 28672, 1], [24576, 28672, 1], [28672, 28672, 1], [-18432, 4096, 1],
      [22528, 4096, 1], [-26624, 8192, 1], [28672, 8192, 1],
    ],
  },
  {
    names: ['WEDGE', '3WEDGE'],
    baseLen: 28,
    rows: [
      [-18432, 0, 1], [18432, 0, 1], [-24576, 4096, 1], [-8192, 4096, 1], [-2048, 4096, 1],
      [2048, 4096, 1], [8192, 4096, 1], [-14336, 8192, 1], [14336, 8192, 1], [-7168, 11264, 1],
      [7168, 11264, 1], [-28672, 12288, 1], [0, 16384, 3], [0, 20480, 1], [32768, 20480, 3],
      [-6144, 24576, 3], [6144, 24576, 3], [32768, 24576, 1], [-30720, 28672, 3],
      [-24576, 28672, 1], [-20480, 28672, 1], [-4096, 28672, 1], [4096, 28672, 1],
      [20480, 28672, 1], [24576, 28672, 1], [30720, 28672, 3], [-8192, 30720, 3],
      [8192, 30720, 3], [-20480, 16384, 1], [-16384, 16384, 1], [12288, 16384, 1],
      [16384, 16384, 1],
    ],
  },
  {
    names: ['DIFF', '3DIFF'],
    baseLen: 28,
    rows: [
      [-20480, 4096, 3], [-8192, 4096, 3], [8192, 4096, 3], [20480, 4096, 3],
      [-24576, 6144, 1], [24576, 6144, 1], [-18432, 8192, 1], [18432, 8192, 1],
      [-16384, 12288, 3], [0, 12288, 1], [16384, 12288, 3], [-26624, 14336, 1],
      [-4096, 14336, 1], [4096, 14336, 1], [26624, 14336, 1], [-28672, 16384, 3],
      [28672, 16384, 3], [-28672, 20480, 1], [0, 20480, 2], [28672, 20480, 1],
      [-7168, 21504, 1], [7168, 21504, 1], [-16384, 22528, 1], [16384, 22528, 1],
      [-10240, 26624, 1], [10240, 26624, 1], [-4096, 28672, 2], [4096, 28672, 2],
      [-28672, 32768, 1], [-10240, 32768, 1], [10240, 32768, 1], [28672, 32768, 1],
    ],
  },
  {
    names: ['TRAP', '3TRAP'],
    baseLen: 28,
    rows: [
      [-26624, 24576, 1], [26624, 4096, 1], [-12288, 8192, 3], [-28672, 12288, 3],
      [-8192, 12288, 1], [8192, 12288, 1], [28672, 12288, 3], [-18432, 14336, 1],
      [18432, 14336, 1], [-28672, 16384, 1], [-6144, 16384, 3], [6144, 16384, 3],
      [18432, 16384, 1], [-8192, 20480, 3], [-4096, 20480, 1], [4096, 20480, 1],
      [8192, 20480, 3], [-30720, 24576, 1], [-24576, 24576, 1], [-16384, 24576, 1],
      [-12288, 24576, 1], [-2048, 24576, 1], [2048, 24576, 1], [12288, 24576, 1],
      [16384, 24576, 1], [24576, 24576, 1], [32768, 24576, 1], [0, 28672, 1],
      [-22528, 32768, 1], [-8192, 32768, 1], [8192, 32768, 1], [22528, 32768, 1],
    ],
  },
  {
    names: ['SYMTRC', '3SYMTRC'],
    baseLen: 28,
    rows: [
      [-22528, 2048, 3], [22528, 2048, 3], [-6144, 3072, 1], [6144, 3072, 1],
      [-15360, 5120, 1], [15360, 5120, 1], [-22528, 10240, 1], [22528, 10240, 1],
      [0, 12288, 3], [-8192, 14336, 1], [8192, 14336, 1], [-16384, 18432, 1],
      [16384, 18432, 1], [-28672, 20480, 1], [-10240, 20480, 3], [10240, 20480, 3],
      [28672, 20480, 1], [-4096, 22528, 3], [4096, 22528, 3], [-18432, 26624, 1],
      [18432, 26624, 1], [-30720, 28672, 1], [-24576, 28672, 1], [-12288, 28672, 1],
      [0, 28672, 1], [12288, 28672, 1], [24576, 28672, 1], [30720, 28672, 1],
      [-20480, 32768, 1], [-6144, 32768, 1], [6144, 32768, 1], [20480, 32768, 1],
    ],
  },
  {
    names: ['VALLEY', '3VALLEY'],
    baseLen: 28,
    rows: [
      [0, 0, 1], [-32768, 6144, 1], [-10240, 8192, 1], [10240, 8192, 1], [-28672, 12288, 1],
      [24576, 12288, 3], [28672, 12288, 1], [-20480, 14336, 1], [-8192, 14336, 1],
      [8192, 14336, 1], [20480, 14336, 1], [-6144, 18432, 1], [6144, 18432, 1],
      [-30720, 20480, 1], [-24576, 20480, 1], [-16384, 20480, 1], [16384, 20480, 1],
      [24576, 20480, 1], [30720, 20480, 1], [-7168, 23552, 1], [7168, 23552, 1],
      [-4096, 24576, 1], [4096, 24576, 1], [31744, 24576, 1], [-14336, 28672, 1],
      [-2048, 28672, 1], [2048, 28672, 1], [14336, 28672, 1], [-24576, 0, 1], [-16384, 0, 1],
      [16384, 0, 1], [24576, 0, 1],
    ],
  },
  {
    names: ['TWRCTY', '3TWRCTY'],
    baseLen: 28,
    rows: [
      [-28672, 0, 1], [-20480, 0, 1], [-12288, 0, 1], [-4096, 0, 1], [4096, 0, 1],
      [12288, 0, 1], [20480, 0, 1], [28672, 0, 1], [-14336, 4096, 1], [-16384, 10240, 1],
      [-30720, 12288, 1], [-22528, 12288, 1], [18432, 12288, 1], [26624, 12288, 1],
      [-24576, 16384, 1], [16384, 16384, 1], [24576, 16384, 1], [32768, 16384, 1],
      [0, 24576, 1], [-31744, 26624, 1], [-26624, 28672, 1], [-18432, 28672, 1],
      [-10240, 28672, 1], [-2048, 28672, 1], [6144, 28672, 1], [14336, 28672, 1],
      [22528, 28672, 1], [30720, 28672, 1], [-6144, 12288, 1], [2048, 12288, 1],
      [-2048, 16384, 1], [6144, 16384, 1],
    ],
  },
]

const KIND_FOR: Record<1 | 2 | 3, GroundKind> = { 1: 'tower', 2: 'bishop', 3: 'bunker' }

const towerCountOf = (es: readonly MazeEntry[]): number =>
  es.filter((e) => e.kind !== 'bunker').length

function buildMazes(): SurfaceMaze[] {
  const out: SurfaceMaze[] = []
  for (const fam of RAW_FAMILIES) {
    const entries: MazeEntry[] = fam.rows.map(([x, y, d]) => ({ x, y, kind: KIND_FOR[d], typeDigit: d }))
    // base = prefix slice; extended (if any) = the whole list.
    const base = entries.slice(0, fam.baseLen)
    out.push({ name: fam.names[0], entries: base, towerCount: towerCountOf(base) })
    if (fam.names.length > 1) {
      out.push({ name: fam.names[1], entries, towerCount: towerCountOf(entries) })
    }
  }
  return out
}

// Wave order: WSGRND TGDPTR lists all base mazes first, then the extended forms.
const MAZE_ORDER: readonly string[] = [
  'BUNK', 'SQUARE', 'CLUSTR', 'TURNON', 'WEDGE', 'DIFF', 'TRAP', 'SYMTRC', 'VALLEY', 'TWRCTY',
  '3SQUARE', '3CLUSTR', '3TURNON', '3WEDGE', '3DIFF', '3TRAP', '3SYMTRC', '3VALLEY', '3TWRCTY',
]

function orderMazes(mazes: readonly SurfaceMaze[]): readonly SurfaceMaze[] {
  const byName = new Map(mazes.map((m) => [m.name, m]))
  return MAZE_ORDER.map((n) => {
    const m = byName.get(n)
    if (!m) throw new Error(`surfaceMazes: missing maze ${n}`)
    return m
  })
}

/** All 19 authored surface mazes, in WSGRND TGDPTR (wave) order. */
export const SURFACE_MAZES: readonly SurfaceMaze[] = orderMazes(buildMazes())

const BY_NAME: ReadonlyMap<string, SurfaceMaze> = new Map(SURFACE_MAZES.map((m) => [m.name, m]))

/** Look a maze up by its WSGRND name; undefined for an unknown name. */
export function getMaze(name: string): SurfaceMaze | undefined {
  return BY_NAME.get(name)
}

// Wave -> maze. WSGRND TGDPTR assigns ground mazes to ROM waves 2..20 (wave 1
// has no ground phase); wave >= 21 re-picks from the last six (MAP$RPT). The
// clone HAS a wave-1 surface, so wave 1 gets SQUARE as a mixed intro; waves
// 2..20 follow the ROM assignment (wave 2 = BUNK, 7 = DIFF, 16 = 3DIFF, ...);
// wave >= 21 cycles the last six mazes deterministically (the pure core cannot
// re-roll a PRNG the way the ROM does).
const WRAP_START = 13 // MAZE_ORDER index of 3WEDGE (WSGRND MAP$RPT)
const WRAP_COUNT = 6

export function mazeForWave(wave: number): SurfaceMaze {
  const w = wave < 1 ? 1 : Math.floor(wave)
  let idx: number
  if (w === 1) idx = MAZE_ORDER.indexOf('SQUARE') // clone intro (no ROM wave-1 ground)
  else if (w <= 20) idx = w - 2 // ROM wave numbering: wave 2 -> index 0 (BUNK)
  else idx = WRAP_START + ((w - 21) % WRAP_COUNT) // cycle the last six
  return SURFACE_MAZES[idx]
}
