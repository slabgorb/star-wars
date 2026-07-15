// src/core/tie-waves.ts
//
// Story sw7-12 — R9b TSPWAV wave composition (audit finding A-017).
//
// The cabinet does not spawn each space wave from a formula — it selects the
// wave's contents from a DATA table `TSPWAV` of 6 authored SETS (WSCPU.MAC:1218–
// 1235). Each set lists which TWV wave-GROUPS appear, in order; each group is a
// list of `.WV shape,choreography,begin-loc` triples (WSCPU.MAC:1252–1320). Past
// the 6 sets the NWNSHP selector recycles the last two — DARTH SECOND on even
// space waves (SETA5), DARTH FIRST on odd (SETA6) (WSCPU.MAC:969–984,1225–1226).
//
// This module is the ported COMPOSITION DATA + selector (A-017), mirroring how
// sw7-11 landed the choreography VM (A-009) as a tested, unwired `src/core`
// module. It resolves each composed entry's choreography to a runnable sw7-11 VM
// program index (so the composition genuinely drives the VM), and pins the Darth
// (RTH) ordering. Wiring the plan into stepGame's spawn / ticking the VM per
// frame in moveEnemy, and Darth's ENEMY behaviour (4-hits, immortal-in-space,
// retreat, 2,000 pts — sw7-13), are out of scope; here RTH is only SCHEDULED.
//
// ⚠ THE LANDMINE (A-015 refutation). The ±2048 D-corners are NOT gated to
// "D-waves": TWV2Z — the sustaining group present in EVERY set — carries the
// 1D1/1D2/1D3 corners, so ±2048 appears from wave ONE (SET A1). See AC-5.
//
// `.RADIX 16` throughout (WSCOMN.MAC): the `$400`/`$7C00` literals are HEX. This
// module keeps the ROM hex so it reads like the assembler and stays auditable
// against WSCPU.MAC line-by-line. Pure src/core — no DOM, no clock, no random.

import { TIE_SPAWN_DISTANCE } from './state'
import { TCH1, TCH2 } from './tie-vm'

/** One composed wave entry — the `.WV shape,choreography,begin-loc` triple
 * (WSCPU.MAC:1242–1245: `.WV A1,A2,A3 → TS.A1 / TCH'A2' / TBG'A3'`). */
export interface WaveEntry {
  readonly shape: 'TIE' | 'RTH'
  readonly choreography: string
  readonly beginLoc: string
}

/** Shape table lives: a plain TIE takes 1 hit, Darth (RTH) takes 4 (WSCPU.MAC:1165–1166). */
export const SHAPE_LIVES: Readonly<Record<'TIE' | 'RTH', number>> = {
  TIE: 1,
  RTH: 4,
}

const wv = (shape: 'TIE' | 'RTH', choreography: string, beginLoc: string): WaveEntry => ({ shape, choreography, beginLoc })

/**
 * The 10 TWV wave-GROUPS — each a list of `.WV` triples (WSCPU.MAC:1252–1320).
 * TWV1x groups run the TCH1 scripts; TWV2x groups run the TCH2 (SPLIT) scripts.
 * TRTH1D is the Darth group: its THIRD entry is the RTH shape (WSCPU.MAC:1273–1276).
 * TWV2Z is the sustaining group in EVERY set — 18 entries, 9 of them the ±2048
 * D-corner begin-locs 1D1/1D2/1D3 (WSCPU.MAC:1299–1320); this is why the corners
 * are present in every wave (the AC-5 landmine).
 */
export const TWV_GROUPS: Readonly<Record<string, readonly WaveEntry[]>> = {
  TWV1A: [wv('TIE', '1A1', '1A1'), wv('TIE', '1A2', '1A2'), wv('TIE', '1A3', '1A3')], // :1253–1256
  TWV1B: [wv('TIE', '1B1', '1B1'), wv('TIE', '1B2', '1B2'), wv('TIE', '1B3', '1B3')], // :1258–1261
  TWV1C: [wv('TIE', '1C1', '1C1'), wv('TIE', '1C2', '1C2'), wv('TIE', '1C3', '1C3')], // :1263–1266
  TWV1D: [wv('TIE', '1D1', '1D1'), wv('TIE', '1D2', '1D2'), wv('TIE', '1D3', '1D3')], // :1268–1271
  TRTH1D: [wv('TIE', '1D1', '1D1'), wv('TIE', '1D2', '1D2'), wv('RTH', '1D3', '1D3')], // :1273–1276 — DARTH
  TWV2A: [wv('TIE', '2A1', '1A1'), wv('TIE', '2A2', '1A2'), wv('TIE', '2A3', '1A3')], // :1279–1282
  TWV2B: [wv('TIE', '2B1', '1B1'), wv('TIE', '2B2', '1B2'), wv('TIE', '2B3', '1B3')], // :1284–1287
  TWV2C: [wv('TIE', '2C1', '1C1'), wv('TIE', '2C2', '1C2'), wv('TIE', '2C3', '1C3')], // :1289–1292
  TWV2D: [wv('TIE', '2D1', '1D1'), wv('TIE', '2D2', '1D2'), wv('TIE', '2D3', '1D3')], // :1294–1297
  TWV2Z: [
    // :1299–1320 — the sustaining group; the 1D1/1D2/1D3 rows ARE the ±2048 corners.
    wv('TIE', '2A1', '1A1'), wv('TIE', '2A2', '1A2'), wv('TIE', '2A3', '1A3'),
    wv('TIE', '2D1', '1D1'), wv('TIE', '2D2', '1D2'), wv('TIE', '2D3', '1D3'),
    wv('TIE', '2B1', '1B1'), wv('TIE', '2B2', '1B2'), wv('TIE', '2B3', '1B3'),
    wv('TIE', '2D1', '1D1'), wv('TIE', '2D2', '1D2'), wv('TIE', '2D3', '1D3'),
    wv('TIE', '2C1', '1C1'), wv('TIE', '2C2', '1C2'), wv('TIE', '2C3', '1C3'),
    wv('TIE', '2D1', '1D1'), wv('TIE', '2D2', '1D2'), wv('TIE', '2D3', '1D3'),
  ],
}

/**
 * The 6 TSPWAV sets, each an ordered list of TWV group names (WSCPU.MAC:1230–1235).
 * Every set ends with TWV2Z (the sustaining group). Darth ordering: SETA6 (last)
 * lists TRTH1D first, SETA5 (next-to-last) lists it second (WSCPU.MAC:1225–1226) —
 * the invariant the NWNSHP past-end recycle relies on.
 */
export const TSPWAV: readonly (readonly string[])[] = [
  ['TWV1A', 'TWV2B', 'TWV2C', 'TWV2Z'], // SET A1  (:1230)
  ['TWV1B', 'TRTH1D', 'TWV2D', 'TWV2C', 'TWV2Z'], // SET A2  (:1231)
  ['TWV1C', 'TRTH1D', 'TWV2D', 'TWV2A', 'TWV2B', 'TWV2C', 'TWV2Z'], // SET A3  (:1232)
  ['TRTH1D', 'TWV2D', 'TWV2A', 'TWV2B', 'TWV2C', 'TWV2Z'], // SET A4  (:1233)
  ['TWV1D', 'TRTH1D', 'TWV2C', 'TWV2D', 'TWV2B', 'TWV2Z'], // SET A5  (:1234) — Darth SECOND
  ['TRTH1D', 'TWV2D', 'TWV2B', 'TWV2D', 'TWV2C', 'TWV2Z'], // SET A6  (:1235) — Darth FIRST
]

const U = 0x400 // ×$400 STARTING-LOCATION lateral/up step = 1024 (WSCPU.MAC:1179–1184)

/**
 * TBG begin-locations (WSCPU.MAC:1186–1200), ROM frame [depth, lateral(Y), up(Z)].
 * `.WB name,_,a,b → .WORD $7C00 / .WORD a×$400 / .WORD b×$400`. A/B/C displace ONE
 * axis by ±1024; the D-group by ±2048 — the corners. The sim's y-up projection of
 * these (SPAWN_LATERALS) belongs to the wiring, not to this data module.
 */
export const TBG: Readonly<Record<string, readonly [number, number, number]>> = {
  '1A1': [TIE_SPAWN_DISTANCE, 0, U], '1A2': [TIE_SPAWN_DISTANCE, -U, 0], '1A3': [TIE_SPAWN_DISTANCE, U, 0], // :1186–1188
  '1B1': [TIE_SPAWN_DISTANCE, 0, U], '1B2': [TIE_SPAWN_DISTANCE, -U, 0], '1B3': [TIE_SPAWN_DISTANCE, U, 0], // :1190–1192
  '1C1': [TIE_SPAWN_DISTANCE, 0, U], '1C2': [TIE_SPAWN_DISTANCE, -U, 0], '1C3': [TIE_SPAWN_DISTANCE, U, 0], // :1194–1196
  '1D1': [TIE_SPAWN_DISTANCE, -2 * U, 0], '1D2': [TIE_SPAWN_DISTANCE, 2 * U, 0], '1D3': [TIE_SPAWN_DISTANCE, 0, 2 * U], // :1198–1200 — the ±2048 CORNERS
}

/**
 * The NWNSHP wave→set selector (WSCPU.MAC:969–984). `spaceWave` is the ROM's
 * 0-based SP.WAV: waves 0..5 map straight onto SETA1..SETA6. Past the table the
 * ROM `LSRA`s SP.WAV — EVEN (carry clear) recycles SETA5 (Darth SECOND), ODD
 * (carry set) recycles SETA6 (Darth FIRST). A middle set is never recycled.
 */
export function selectWaveSet(spaceWave: number): readonly string[] {
  if (spaceWave < TSPWAV.length) return TSPWAV[spaceWave]
  return spaceWave % 2 === 0 ? TSPWAV[4] : TSPWAV[5] // even → SETA5, odd → SETA6
}

/** The flattened per-wave spawn plan: every entry of every group in the selected set, in order. */
export function waveSpawnPlan(spaceWave: number): readonly WaveEntry[] {
  const plan: WaveEntry[] = []
  for (const group of selectWaveSet(spaceWave)) {
    for (const entry of TWV_GROUPS[group]) plan.push(entry)
  }
  return plan
}

const LETTER_INDEX: Readonly<Record<string, number>> = { A: 0, B: 1, C: 2, D: 3 }
const SLOT_INDEX: Readonly<Record<string, number>> = { '1': 0, '2': 1, '3': 2, Z: 3 }

/**
 * Resolve a composed entry's choreography suffix (`1A1`, `2D3`, …) to its sw7-11
 * VM program index. The leading digit picks the table (1 → TCH1, 2 → TCH2); the
 * letter+slot pick the script within it (TCH1 has 4 slots per letter — 1/2/3/Z;
 * TCH2 has 3 — 1/2/3). This is the `.WV`→`TCH'A2'` binding (WSCPU.MAC:1242–1245).
 */
export function choreoPc(choreography: string): number {
  const table = choreography[0]
  const letter = LETTER_INDEX[choreography[1]]
  const slot = SLOT_INDEX[choreography[2]]
  return table === '1' ? TCH1[letter * 4 + slot] : TCH2[letter * 3 + slot]
}
