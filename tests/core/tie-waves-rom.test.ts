// tests/core/tie-waves-rom.test.ts
//
// Story sw7-12 — R9b TSPWAV wave composition (audit finding A-017), RED phase.
//
// THE DEFECT (A-017, class NO_COUNTERPART, `ours: null`). The cabinet selects each
// space wave's contents from a DATA table `TSPWAV` of 6 sets (WSCPU.MAC:1218–1235):
// e.g. `SET A1  TWV1A,TWV2B,TWV2C,TWV2Z` (WSCPU.MAC:1230). Each set lists which TWV
// wave-GROUPS appear, in order; each group is a list of `.WV shape,choreography,
// begin-loc` triples (WSCPU.MAC:1252–1320). Past the 6 authored sets the selector
// (`NWNSHP`, WSCPU.MAC:969–984) recycles the last two — DARTH SECOND on even space
// waves (SETA5), DARTH FIRST on odd (SETA6). Our sim has none of this: every space
// wave is an identical flat spawn (`SPAWN_LATERALS[spawnCount % 12]`, sim.ts:1239),
// wave identity is a formula, and Darth (RTH) never appears in any schedule.
//
// This suite pins the COMPOSITION DATA + SELECTOR contract and is EXPECTED TO FAIL
// until GREEN creates `src/core/tie-waves.ts`.
//
// GROUND TRUTH is WSCPU.MAC in the 1983 Atari source (~/Projects/star-wars-1983-
// source-text; historicalsource/star-wars @ 5355b76). Every table below is
// transcribed BY HAND from the source and cited line-by-line — not read out of any
// generated artifact. `.RADIX 16` throughout (WSCOMN.MAC), so the `×400`/`7C00`
// literals are HEX: `$400` = 1024, `$800` = 2048, `$7C00` = 31744 (= TIE_SPAWN_
// DISTANCE, state.ts:201 — cross-checked below).
//
// ── SCOPE (this story = the composition DATA + selector, A-017 only) ──────────────
//   IN:  the 6 TSPWAV sets, the TWV group definitions (`.WV` triples), the TBG
//        begin-location coordinates, the shape table (TIE=1 life, RTH=4), the
//        NWNSHP wave→set selector incl. the past-end Darth ordering, and that a
//        composed entry's choreography resolves to a RUNNABLE sw7-11 VM program
//        (so the composition genuinely "drives the sw7-11 VM").
//   OUT: wiring the plan into stepGame's spawn / running tickChoreo per frame in
//        moveEnemy (a spawn-contract + flight-integration change — routed to a
//        Delivery Finding, mirroring how sw7-11 landed the VM engine unwired);
//        Darth's ENEMY behaviour — 4-hits-to-kill, immortal-in-space, retreat,
//        2,000 pts (A-016 / S-002 = sw7-13). Here RTH is only SCHEDULED.
//
// ── ⚠ THE LANDMINE (A-015 refutation — the whole risk of this story) ──────────────
// A-015's ORIGINAL reasoning proposed gating the ±2048 D-corners to "D-group
// waves" and claimed "the ROM only presents ±2048 when a D-group wave/level is
// active." Its own refutation_correction marks that FALSE: "The ROM DOES present
// the ±2048 D-corners in EVERY wave. TWV2Z uses begin-locations 1D1/1D2/1D3 …
// and TWV2Z is the sustaining group in EVERY space-wave set (SETA1..SETA6) …
// SET A1 = TWV1A,TWV2B,TWV2C,TWV2Z is the first wave." So the ±2048 corners appear
// from wave ONE. Do NOT gate them to D-waves. AC-5 pins this so no future edit can
// silently reintroduce the refuted gate.
//
// ── SPEC RECONCILIATION (TEA design decisions — logged as session deviations) ─────
//   * PURE DATA MODULE. A-017's remediation is the ABSENCE of the composition data;
//     like sw7-11's VM engine, it lands as a tested standalone `src/core/tie-waves.ts`
//     (data + selector), pinned against WSCPU.MAC. The stepGame/flight wiring is a
//     distinct integration deferred to a Delivery Finding.
//   * ROM-FRAME begin-locations. TBG is pinned in the ROM frame the `.WB` macro
//     emits (WSCPU.MAC:1179–1184): [word0 = $7C00 depth, word1 = arg3×$400 lateral,
//     word2 = arg4×$400 up]. The sim's own (y-up) projection of these is sim.ts's
//     existing SPAWN_LATERALS; converting frames is the wiring's job, not the data's.
//   * 0-BASED SPACE WAVE. `selectWaveSet` takes the ROM's `SP.WAV` (0-based: 0 ⇒
//     SETA1). Mapping the clone's phase/wave counter onto SP.WAV is the caller's job.
//
// Sacred boundary: this module is pure src/core — no DOM, no clock, no Math.random.

import { describe, it, expect } from 'vitest'
import { TIE_SPAWN_DISTANCE } from '../../src/core/state'
import { program, TCH1, TCH2, initVm, tickChoreo, type ChoreoInstr } from '../../src/core/tie-vm'
import {
  SHAPE_LIVES,
  TWV_GROUPS,
  TSPWAV,
  TBG,
  selectWaveSet,
  waveSpawnPlan,
  choreoPc,
  type WaveEntry,
} from '../../src/core/tie-waves'

// ── The ROM oracle, transcribed by hand from WSCPU.MAC ────────────────────────────

const U = 0x400 // ×$400 STARTING-LOCATION lateral/up step = 1024
const DEPTH = 0x7c00 // the fixed X (fore/aft) begin word — every alien starts at max depth

/** The 6 TSPWAV sets as ordered TWV group-name lists (WSCPU.MAC:1230–1235). */
const ROM_SETS: readonly (readonly string[])[] = [
  ['TWV1A', 'TWV2B', 'TWV2C', 'TWV2Z'], // SET A1  (:1230)
  ['TWV1B', 'TRTH1D', 'TWV2D', 'TWV2C', 'TWV2Z'], // SET A2  (:1231)
  ['TWV1C', 'TRTH1D', 'TWV2D', 'TWV2A', 'TWV2B', 'TWV2C', 'TWV2Z'], // SET A3  (:1232)
  ['TRTH1D', 'TWV2D', 'TWV2A', 'TWV2B', 'TWV2C', 'TWV2Z'], // SET A4  (:1233)
  ['TWV1D', 'TRTH1D', 'TWV2C', 'TWV2D', 'TWV2B', 'TWV2Z'], // SET A5  (:1234)
  ['TRTH1D', 'TWV2D', 'TWV2B', 'TWV2D', 'TWV2C', 'TWV2Z'], // SET A6  (:1235)
]

/** `.WV shape,choreo,beginLoc` triples for each TWV group (WSCPU.MAC:1252–1320).
 * The 3-tuples read [shape, choreography-suffix, beginLoc-suffix] exactly as the
 * `.WV A1,A2,A3 → TS.A1 / TCH'A2' / TBG'A3'` macro (WSCPU.MAC:1242–1245) expands. */
const wv = (shape: 'TIE' | 'RTH', choreography: string, beginLoc: string): WaveEntry => ({ shape, choreography, beginLoc })

const ROM_GROUPS: Record<string, readonly WaveEntry[]> = {
  TWV1A: [wv('TIE', '1A1', '1A1'), wv('TIE', '1A2', '1A2'), wv('TIE', '1A3', '1A3')], // :1253–1256
  TWV1B: [wv('TIE', '1B1', '1B1'), wv('TIE', '1B2', '1B2'), wv('TIE', '1B3', '1B3')], // :1258–1261
  TWV1C: [wv('TIE', '1C1', '1C1'), wv('TIE', '1C2', '1C2'), wv('TIE', '1C3', '1C3')], // :1263–1266
  TWV1D: [wv('TIE', '1D1', '1D1'), wv('TIE', '1D2', '1D2'), wv('TIE', '1D3', '1D3')], // :1268–1271
  // TRTH1D — the DARTH group: its THIRD entry is the RTH shape (WSCPU.MAC:1273–1276).
  TRTH1D: [wv('TIE', '1D1', '1D1'), wv('TIE', '1D2', '1D2'), wv('RTH', '1D3', '1D3')],
  TWV2A: [wv('TIE', '2A1', '1A1'), wv('TIE', '2A2', '1A2'), wv('TIE', '2A3', '1A3')], // :1279–1282
  TWV2B: [wv('TIE', '2B1', '1B1'), wv('TIE', '2B2', '1B2'), wv('TIE', '2B3', '1B3')], // :1284–1287
  TWV2C: [wv('TIE', '2C1', '1C1'), wv('TIE', '2C2', '1C2'), wv('TIE', '2C3', '1C3')], // :1289–1292
  TWV2D: [wv('TIE', '2D1', '1D1'), wv('TIE', '2D2', '1D2'), wv('TIE', '2D3', '1D3')], // :1294–1297
  // TWV2Z — the sustaining group in EVERY set (WSCPU.MAC:1299–1320): 18 entries, and
  // 9 of them are the ±2048 D-corner begin-locs 1D1/1D2/1D3. THIS is why the corners
  // are present in every wave. (See AC-5, the landmine guard.)
  TWV2Z: [
    wv('TIE', '2A1', '1A1'), wv('TIE', '2A2', '1A2'), wv('TIE', '2A3', '1A3'),
    wv('TIE', '2D1', '1D1'), wv('TIE', '2D2', '1D2'), wv('TIE', '2D3', '1D3'),
    wv('TIE', '2B1', '1B1'), wv('TIE', '2B2', '1B2'), wv('TIE', '2B3', '1B3'),
    wv('TIE', '2D1', '1D1'), wv('TIE', '2D2', '1D2'), wv('TIE', '2D3', '1D3'),
    wv('TIE', '2C1', '1C1'), wv('TIE', '2C2', '1C2'), wv('TIE', '2C3', '1C3'),
    wv('TIE', '2D1', '1D1'), wv('TIE', '2D2', '1D2'), wv('TIE', '2D3', '1D3'),
  ],
}

/** Begin-locations (WSCPU.MAC:1186–1200), ROM frame [depth, lateral(Y), up(Z)].
 * `.WB name,_,a,b → .WORD $7C00 / .WORD a×$400 / .WORD b×$400`. Comment order:
 * "FRONT TO BACK, LEFT TO RIGHT, TOP TO BOTTOM". A/B/C displace ONE axis by ±$400;
 * the D-group by ±$800 (= ±2048) — the corners. */
const ROM_TBG: Record<string, readonly [number, number, number]> = {
  '1A1': [DEPTH, 0, U], '1A2': [DEPTH, -U, 0], '1A3': [DEPTH, U, 0], // :1186–1188
  '1B1': [DEPTH, 0, U], '1B2': [DEPTH, -U, 0], '1B3': [DEPTH, U, 0], // :1190–1192
  '1C1': [DEPTH, 0, U], '1C2': [DEPTH, -U, 0], '1C3': [DEPTH, U, 0], // :1194–1196
  '1D1': [DEPTH, -2 * U, 0], '1D2': [DEPTH, 2 * U, 0], '1D3': [DEPTH, 0, 2 * U], // :1198–1200 — the ±2048 CORNERS
}

const D_CORNERS = ['1D1', '1D2', '1D3'] as const
const maxAbsLateral = (loc: readonly [number, number, number]): number => Math.max(Math.abs(loc[1]), Math.abs(loc[2]))

// ── AC-1 — TSPWAV: 6 sets, the exact ordered composition (WSCPU.MAC:1230–1235) ────
describe('sw7-12 AC-1 — TSPWAV is exactly the ROM 6 sets, in order', () => {
  it('has exactly 6 wave-composition sets', () => {
    expect(TSPWAV).toHaveLength(6)
  })

  it('each set is the ROM group list, in ROM order', () => {
    expect(TSPWAV.map((s) => [...s])).toEqual(ROM_SETS.map((s) => [...s]))
  })

  it('SET A1 (the first wave) is TWV1A,TWV2B,TWV2C,TWV2Z (WSCPU.MAC:1230)', () => {
    expect([...TSPWAV[0]]).toEqual(['TWV1A', 'TWV2B', 'TWV2C', 'TWV2Z'])
  })

  it('every set ENDS with TWV2Z — the sustaining group present in every wave', () => {
    for (const set of TSPWAV) expect(set[set.length - 1]).toBe('TWV2Z')
  })
})

// ── AC-2 — TWV group definitions: the `.WV` triples (WSCPU.MAC:1252–1320) ──────────
describe('sw7-12 AC-2 — TWV groups are the ROM `.WV` triples', () => {
  it('defines exactly the 10 named groups the sets reference', () => {
    expect(Object.keys(TWV_GROUPS).sort()).toEqual(Object.keys(ROM_GROUPS).sort())
  })

  for (const name of Object.keys(ROM_GROUPS)) {
    it(`${name} matches the ROM shape/choreography/begin-loc triples in order`, () => {
      expect(TWV_GROUPS[name].map((e) => ({ ...e }))).toEqual(ROM_GROUPS[name].map((e) => ({ ...e })))
    })
  }

  it('TWV2Z has 18 entries, 9 of them the D-corner begin-locs (WSCPU.MAC:1299–1320)', () => {
    expect(TWV_GROUPS.TWV2Z).toHaveLength(18)
    const dCorner = TWV_GROUPS.TWV2Z.filter((e) => (D_CORNERS as readonly string[]).includes(e.beginLoc))
    expect(dCorner).toHaveLength(9)
  })

  it('every set references only defined groups', () => {
    for (const set of TSPWAV) for (const g of set) expect(TWV_GROUPS[g], `group ${g} defined`).toBeDefined()
  })
})

// ── AC-3 — TBG begin-locations: coordinates, incl. the ±2048 corners ──────────────
describe('sw7-12 AC-3 — TBG begin-locations match the ROM `.WB` decode', () => {
  it('every begin-loc equals its ROM [depth,$400·arg] triple (WSCPU.MAC:1186–1200)', () => {
    for (const loc of Object.keys(ROM_TBG)) {
      expect([...TBG[loc]], `TBG${loc}`).toEqual([...ROM_TBG[loc]])
    }
  })

  it('the fixed depth word is $7C00 == TIE_SPAWN_DISTANCE (state.ts:201)', () => {
    expect(DEPTH).toBe(TIE_SPAWN_DISTANCE)
    for (const loc of Object.keys(TBG)) expect(TBG[loc][0], `TBG${loc}.x`).toBe(TIE_SPAWN_DISTANCE)
  })

  it('A/B/C groups displace exactly one axis by ±1024; NEVER 2048', () => {
    for (const loc of ['1A1', '1A2', '1A3', '1B1', '1B2', '1B3', '1C1', '1C2', '1C3']) {
      expect(maxAbsLateral(TBG[loc]), `TBG${loc}`).toBe(U) // 1024, not 2048
    }
  })

  it('the D-corners are the ±2048 begin-locs: 1D1 y=-2048, 1D2 y=+2048, 1D3 z=+2048', () => {
    expect([...TBG['1D1']]).toEqual([DEPTH, -2 * U, 0])
    expect([...TBG['1D2']]).toEqual([DEPTH, 2 * U, 0])
    expect([...TBG['1D3']]).toEqual([DEPTH, 0, 2 * U])
    for (const loc of D_CORNERS) expect(maxAbsLateral(TBG[loc]), `TBG${loc}`).toBe(2 * U) // 2048
  })
})

// ── AC-4 — the NWNSHP wave→set selector, incl. past-end Darth ordering ────────────
describe('sw7-12 AC-4 — selectWaveSet is the ROM NWNSHP selector (WSCPU.MAC:969–984)', () => {
  it('space waves 0..5 map straight onto SETA1..SETA6', () => {
    for (let w = 0; w < 6; w++) expect([...selectWaveSet(w)]).toEqual([...TSPWAV[w]])
  })

  it('past the table (SP.WAV>=6), EVEN space waves recycle SETA5 (Darth SECOND)', () => {
    // NWNSHP: LSRA on SP.WAV, IFCC (carry clear ⇒ even) → LDX #ZSPWAV-4 = SETA5 (:979–980)
    for (const w of [6, 8, 10, 12]) expect([...selectWaveSet(w)]).toEqual([...TSPWAV[4]]) // SETA5
  })

  it('past the table (SP.WAV>=6), ODD space waves recycle SETA6 (Darth FIRST, with music)', () => {
    // NWNSHP: ELSE (carry set ⇒ odd) → LDX #ZSPWAV-2 = SETA6 (:981–982)
    for (const w of [7, 9, 11, 13]) expect([...selectWaveSet(w)]).toEqual([...TSPWAV[5]]) // SETA6
  })

  it('never recycles a middle set — only SETA5/SETA6 are eligible past the table', () => {
    const eligible = [JSON.stringify([...TSPWAV[4]]), JSON.stringify([...TSPWAV[5]])]
    for (let w = 6; w < 40; w++) {
      expect(eligible, `wave ${w}`).toContain(JSON.stringify([...selectWaveSet(w)]))
    }
  })
})

// ── AC-5 — THE LANDMINE: ±2048 corners in EVERY wave, incl. SET A1 (refute A-015) ──
describe('sw7-12 AC-5 — the ±2048 D-corners appear in EVERY wave (A-015 refutation)', () => {
  it('SET A1 (the FIRST wave) already contains the ±2048 corners — NOT gated to D-waves', () => {
    // This is the exact false sub-claim A-015 was corrected on. SET A1 ends in TWV2Z,
    // which carries 1D1/1D2/1D3, so wave ONE shows ±2048.
    const plan = waveSpawnPlan(0)
    const locs = new Set(plan.map((e) => e.beginLoc))
    for (const corner of D_CORNERS) expect(locs.has(corner), `SET A1 has ${corner}`).toBe(true)
    // and the coordinate really is ±2048, not merely a D-labelled slot:
    expect(plan.some((e) => maxAbsLateral(TBG[e.beginLoc]) === 2 * U), 'SET A1 has a 2048 coord').toBe(true)
  })

  it('EVERY space wave (0..12, incl. past-end recycling) contains all three D-corners', () => {
    for (let w = 0; w <= 12; w++) {
      const locs = new Set(waveSpawnPlan(w).map((e) => e.beginLoc))
      for (const corner of D_CORNERS) expect(locs.has(corner), `wave ${w} has ${corner}`).toBe(true)
    }
  })

  it('REFUTATION GUARD: no wave is ±2048-free — the refuted "D-waves only" gate is impossible', () => {
    // If any implementation reintroduced the A-015 gate (corners only when a D-group
    // is "active"), some early wave would lack a 2048 coordinate. Assert none does.
    const wavesWithout2048 = []
    for (let w = 0; w <= 12; w++) {
      if (!waveSpawnPlan(w).some((e) => maxAbsLateral(TBG[e.beginLoc]) === 2 * U)) wavesWithout2048.push(w)
    }
    expect(wavesWithout2048).toEqual([])
  })
})

// ── AC-6 — Darth ordering & the RTH shape (scheduling only; behaviour is sw7-13) ──
describe('sw7-12 AC-6 — Darth (RTH) scheduling and the shape table', () => {
  it('the shape table gives TIE 1 life and RTH 4 lives (WSCPU.MAC:1165–1166)', () => {
    expect(SHAPE_LIVES.TIE).toBe(1)
    expect(SHAPE_LIVES.RTH).toBe(4)
  })

  it('RTH appears ONLY as TRTH1D\'s third entry — begin-loc 1D3, choreography 1D3', () => {
    const rthEntries: { group: string; entry: WaveEntry }[] = []
    for (const [group, entries] of Object.entries(TWV_GROUPS)) {
      for (const entry of entries) if (entry.shape === 'RTH') rthEntries.push({ group, entry })
    }
    expect(rthEntries).toHaveLength(1)
    expect(rthEntries[0].group).toBe('TRTH1D')
    expect(rthEntries[0].entry).toEqual({ shape: 'RTH', choreography: '1D3', beginLoc: '1D3' })
    expect(TWV_GROUPS.TRTH1D.indexOf(rthEntries[0].entry)).toBe(2) // the THIRD entry
  })

  it('the Darth group TRTH1D is scheduled in sets A2..A6 but NOT SET A1', () => {
    expect(TSPWAV[0].includes('TRTH1D')).toBe(false) // SET A1: no Darth
    for (let s = 1; s < 6; s++) expect(TSPWAV[s].includes('TRTH1D'), `SETA${s + 1}`).toBe(true)
  })

  it('SETA6 (last) lists Darth FIRST; SETA5 (next-to-last) lists Darth SECOND', () => {
    // The invariant NWNSHP relies on: "LAST ENTRY MUST HAVE DARTH FIRST / NEXT TO
    // LAST HAS DARTH SECOND" (WSCPU.MAC:1225–1226).
    expect(TSPWAV[5].indexOf('TRTH1D')).toBe(0) // SETA6 — Darth first
    expect(TSPWAV[4].indexOf('TRTH1D')).toBe(1) // SETA5 — Darth second
  })

  it('a recycled ODD wave presents Darth FIRST; a recycled EVEN wave presents Darth SECOND', () => {
    expect(selectWaveSet(7).indexOf('TRTH1D')).toBe(0) // odd → SETA6 → Darth first
    expect(selectWaveSet(6).indexOf('TRTH1D')).toBe(1) // even → SETA5 → Darth second
  })
})

// ── AC-7 — the composition DRIVES the sw7-11 VM (runnable program entries) ─────────
describe('sw7-12 AC-7 — every composed entry drives a real sw7-11 VM program', () => {
  it('TWV1x choreography resolves to a TCH1 entry; TWV2x to a TCH2 (split) entry', () => {
    // TCH1 = [A1,A2,A3,AZ,B1..DZ] (16); TCH2 = [A1,A2,A3,B1..D3] (12) — sw7-11 exports.
    expect(choreoPc('1A1')).toBe(TCH1[0])
    expect(choreoPc('1D3')).toBe(TCH1[14])
    expect(choreoPc('2A1')).toBe(TCH2[0])
    expect(choreoPc('2B1')).toBe(TCH2[3])
    expect(choreoPc('2D3')).toBe(TCH2[11])
  })

  it('a TWV1 group runs TCH1 scripts; a TWV2 group runs TCH2 scripts', () => {
    for (const e of TWV_GROUPS.TWV1A) expect(TCH1.includes(choreoPc(e.choreography)), `${e.choreography}`).toBe(true)
    for (const e of TWV_GROUPS.TWV2Z) expect(TCH2.includes(choreoPc(e.choreography)), `${e.choreography}`).toBe(true)
  })

  it('EVERY entry in EVERY set resolves to a runnable program index, and ticks without error', () => {
    for (let w = 0; w < 6; w++) {
      for (const entry of waveSpawnPlan(w)) {
        const pc = choreoPc(entry.choreography)
        expect(Number.isInteger(pc) && pc >= 0 && pc < program.length, `${entry.choreography}→${pc}`).toBe(true)
        // The composed program is a real sw7-11 VM program: it advances a frame with
        // no status bits set and does not throw (proves the composition drives the VM).
        expect(() => tickChoreo(initVm(pc), program, 0)).not.toThrow()
      }
    }
  })
})
