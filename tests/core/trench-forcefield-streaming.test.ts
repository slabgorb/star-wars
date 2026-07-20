// tests/core/trench-forcefield-streaming.test.ts
//
// Story sw7-22 (R6d) — RED phase (Imperator Furiosa / TEA): STREAM the grid's
// per-wedge force-field content (B-012) in over the full channel, replacing the
// single placeholder "catwalk" the 1.8s stub carried.
//
// THE DEFECT this story fixes: `enterPhase` seeds the trench from the 8-entry
// PROVISIONAL station list (`spawnTrenchObstacles`, trench-obstacles.ts) — turrets,
// squares, and exactly ONE placeholder force field ("catwalk") crammed into the
// nearest ~4,448 units. The authentic trench builds its wall content from the WEDGE
// PANEL GRID (`buildTrench`, sw7-6 / B-010): each wedge's left/right 4-slot columns
// carry PANEL_FORCEFIELD (TD$WFF) slots, and a real pie lays tens of them across the
// whole ~327,680-unit channel. sw7-19 wired the force-field GRAZE collision but had
// nowhere to put the fields (the port-clamp stub gave the channel no body). This
// story un-clamps the port (see trench-port-bs-plc.test.ts) and STREAMS the grid's
// force fields over the now-full channel — "unblocks the ~80 authentic force-field
// panels sw7-19 could not place into the 1.8s stub".
//
// MEASURED GROUND TRUTH (probe in the sw7-22 session; every number here is walked
// out of `buildTrench`, not invented):
//   • The port distance BS.PLC = 327,680 is CONSTANT across pies.
//   • PIE1 (BS.WAV 0 → our wave 1) has ZERO force fields — it is all wall GUNS
//     (B-017, the NEXT story). So the FIRST trench streams no force fields, and a
//     streaming that is truly data-driven must reflect that.
//   • BS.WAV 1 (our wave 2) carries ~82 force-field slots, their −Z distances
//     spanning 69,632 … 296,960 — the whole channel, all of it BEYOND the $7000
//     beam-reach window the stub could reach.
//
// SEAM (logged as a deviation; pinned via OBSERVABLES, not literals — the sw7-19
// rule): this suite reads the streamed fields off the SIM state
// (`enterPhase(...).trenchObstacles`, kind 'catwalk' — the kind the B-012 collision
// keys on), placed at trench entry. It pins WHERE each field sits (a grid-derived
// −Z, the correct wall) and that the set is DATA-DRIVEN from the grid, NOT the exact
// per-slot HEIGHT (M.Z0 ± $200 / $400 — that grid→world height map is Dev's to build,
// routed to a Delivery Finding) nor an exact count. A wave whose grid has fields but
// a stream that produces none, or fields at invented distances, both fail here.

import { describe, it, expect } from 'vitest'
import { initialState, type GameState } from '../../src/core/state'
import { enterPhase } from '../../src/core/sim'
import { TRENCH_FAR } from '../../src/core/trench-channel'
import {
  buildTrench,
  wedgeLength,
  PANEL_FORCEFIELD,
  type Wedge,
} from '../../src/core/trench-wedges'
import { createRng } from '@arcade/shared/rng'
import type { TrenchObstacle } from '../../src/core/state'

/** A fresh trench opened at the given (1-based) wave — the real spawn path. */
function freshTrench(wave: number, seed = 1983): GameState {
  return enterPhase({ ...initialState(seed), wave }, 'trench')
}

/** The force fields the trench carries — the kind the sw7-19 (B-012) collision reads. */
function fields(s: GameState): TrenchObstacle[] {
  return s.trenchObstacles.filter((o) => o.kind === 'catwalk')
}

/**
 * The grid's own force-field placements for a (1-based) wave, walked out of
 * `buildTrench` independently of the sim: each PANEL_FORCEFIELD slot becomes a
 * (wall-sign, −Z distance) pair. `left` column → left wall (−), `right` → right (+).
 * BS.WAV = wave − 1; for wave ≤ 11 the chain is RNG-independent (finding B-011), so
 * the seed is immaterial here.
 */
function gridFields(wave: number): { sign: number; dist: number }[] {
  const chain = buildTrench(wave - 1, createRng(0))
  const out: { sign: number; dist: number }[] = []
  let acc = 0
  for (const w of chain as readonly Wedge[]) {
    for (const slot of w.left) if (slot === PANEL_FORCEFIELD) out.push({ sign: -1, dist: acc })
    for (const slot of w.right) if (slot === PANEL_FORCEFIELD) out.push({ sign: 1, dist: acc })
    acc += wedgeLength(w.type)
  }
  return out
}

const WAVE_WITH_FIELDS = 2 // BS.WAV 1 — ~82 force fields (measured)
const WAVE_NO_FIELDS = 1 //   BS.WAV 0 (PIE1) — 0 force fields, all guns (measured)

describe('sw7-22 (R6d) — the trench streams force fields from the wedge grid over the FULL channel', () => {
  it('the measured ground truth holds: PIE1 has none, BS.WAV 1 has many, all downrange of $7000', () => {
    // Anchors the story against the data so the rest of the suite is not circular.
    const none = gridFields(WAVE_NO_FIELDS)
    const many = gridFields(WAVE_WITH_FIELDS)
    expect(none.length).toBe(0)
    expect(many.length).toBeGreaterThan(60)
    expect(Math.min(...many.map((f) => f.dist))).toBeGreaterThan(TRENCH_FAR)
    expect(Math.max(...many.map((f) => f.dist))).toBeGreaterThan(200_000)
  })

  it('a wave WITH grid force fields streams many of them, spanning past the beam-reach window', () => {
    // RED now: `spawnTrenchObstacles` ignores the wave and the grid entirely, so the
    // trench carries the ONE stub catwalk at ~−3,248 and nothing beyond ~4,448.
    const ff = fields(freshTrench(WAVE_WITH_FIELDS))
    expect(ff.length, 'the grid streams tens of fields, not the single stub').toBeGreaterThan(40)
    expect(ff.some((f) => -f.pos[2] > TRENCH_FAR), 'fields sit beyond the $7000 window').toBe(true)
    expect(Math.max(...ff.map((f) => -f.pos[2])), 'fields reach deep down the full channel').toBeGreaterThan(200_000)
  })

  it('the stream is DATA-DRIVEN: a wave whose grid has no force fields (PIE1) streams none', () => {
    // The discriminator a fixed "always inject a catwalk" cannot pass. RED now: the
    // stub injects its placeholder catwalk on EVERY wave, so PIE1 wrongly has one.
    const ff = fields(freshTrench(WAVE_NO_FIELDS))
    expect(ff.length, 'PIE1 is all guns — no force fields until a later pie').toBe(0)
  })

  it('every streamed field sits at a grid-derived (wall, −Z) — no invented stations', () => {
    // Clone-safe derivation pin: each field must land where the wedge chain puts a
    // PANEL_FORCEFIELD slot, on that slot column's wall. Invented/evenly-spaced
    // placements fail; the exact per-slot HEIGHT is deliberately not pinned here.
    const ff = fields(freshTrench(WAVE_WITH_FIELDS))
    const grid = new Set(gridFields(WAVE_WITH_FIELDS).map((f) => `${f.sign}@${f.dist}`))
    for (const f of ff) {
      const key = `${Math.sign(f.pos[0])}@${-f.pos[2]}`
      expect(grid.has(key), `field at wall ${Math.sign(f.pos[0])}, −z ${-f.pos[2]} is a grid slot`).toBe(true)
    }
  })

  it('fields mount on BOTH walls — the side gate the B-012 graze reads is preserved', () => {
    // The grid carries left- and right-column fields; the stream must keep the wall
    // so the sw7-19 sign-gated graze still fires on the correct side (both walls
    // present ⇒ a hardcoded "always left" placement cannot pass).
    const ff = fields(freshTrench(WAVE_WITH_FIELDS))
    expect(ff.some((f) => f.pos[0] < 0), 'a left-wall field').toBe(true)
    expect(ff.some((f) => f.pos[0] > 0), 'a right-wall field').toBe(true)
  })

  it('streamed fields are the force-field kind the B-012 collision reads (catwalk)', () => {
    // They must BE 'catwalk' so the sw7-19 side-gated graze (proved in
    // trench-force-field-hazard.test.ts) applies to every streamed field unchanged.
    const ff = fields(freshTrench(WAVE_WITH_FIELDS))
    expect(ff.length).toBeGreaterThan(0)
    expect(ff.every((f) => f.kind === 'catwalk')).toBe(true)
  })
})
