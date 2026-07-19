// tests/core/trench-furniture-anchoring.test.ts
//
// Story sw5-6 — RED phase (O'Brien / TEA), AC-5: the trench furniture is re-anchored.
//
// AC-5: "Trench furniture (turrets, squares, catwalks) and TRENCH_SKIM are all scaled off
// the TRENCH_HALF_W/TRENCH_WALL_H anchors — re-check them against the new height rather
// than leaving them tuned to 320."
//
// The furniture heights are ABSOLUTE constants, hand-tuned against the old 320-tall wall:
//
//   trench-obstacles.ts   turret y =  60      (=  18.8% of a 320 wall)
//                         square y = 120      (=  37.5%)
//                         catwalk y = 200     (=  62.5%)
//   trench-detail.ts      panels span y = 80 … 200   (= 25% … 62.5%)
//
// Left alone against a 4096-deep trench they all collapse into the bottom 5% of the wall:
// the "overhead" catwalk you are supposed to DIVE UNDER ends up lying on the floor, and
// four thousand units of wall are left bare. None of these carry a ROM pin (they are all
// self-declared PROVISIONAL — the ROM's wall detail is a PRNG-picked shape script, not a
// grid), so this suite does NOT invent ROM numbers for them. It pins the CONSEQUENCE the
// AC actually asks for: the furniture must move with the anchors, and must go on being the
// thing it was — wall detail on the wall, and a catwalk you have to fly around.
//
// == THE DIFFICULTY CHANGE THIS EXPOSES =======================================
//
// The ROM clamps the pilot laterally to ±0x1FF (511) inside a trench whose walls are at
// ±0x400 (1024). So the cabinet's pilot CANNOT REACH THE WALLS — he has 513 units of
// clearance on each side, always. Wall-mounted furniture is therefore something he SHOOTS,
// never something he crashes into; the only thing that can physically block him is what
// spans the channel — the catwalk. That is why the ROM band exists at all ("dive under a
// catwalk instead of eating a guaranteed shield").
//
// Our old ±256 trench with a ±512 lateral band had the pilot flying THROUGH the walls, so
// wall obstacles were collidable by accident. Pinning the trench fixes that, and it is a
// real gameplay change — pinned below, and called out in Delivery Findings, not slipped in.

import { describe, it, expect } from 'vitest'
import { TRENCH_HALF_W, TRENCH_WALL_H, TRENCH_VIEW_HALF_W } from '../../src/core/trench-channel'
import {
  TRENCH_OBSTACLE_STATIONS,
  OBSTACLE_HIT_RADIUS,
  streamForceFields,
} from '../../src/core/trench-obstacles'
import { trenchWallDetail } from '../../src/core/trench-detail'
import { createRng } from '@arcade/shared/rng'

/** The ROM's reachable eye band, as a height above the trench floor (see
 *  render.trench-eye.test.ts for the WSMAIN.MAC oracle). */
const ROM_EYE_MIN = 0x1000 - 0xe00 //  512
const ROM_EYE_MAX = 0x1000 - 0x100 // 3840

describe('sw5-6 AC-5 — the furniture is re-anchored to the pinned trench', () => {
  it('every obstacle is inside the trench', () => {
    for (const o of TRENCH_OBSTACLE_STATIONS) {
      const [x, y] = o.pos
      expect(Math.abs(x), `${o.kind} is within the walls`).toBeLessThanOrEqual(TRENCH_HALF_W)
      expect(y, `${o.kind} is above the floor`).toBeGreaterThanOrEqual(0)
      expect(y, `${o.kind} is below the trench top`).toBeLessThanOrEqual(TRENCH_WALL_H)
    }
  })

  it('the furniture is NOT still clustered on the floor of a 4096-deep trench', () => {
    // The "you forgot to re-anchor" detector. At their 320-tuned heights (60/120/200)
    // every last obstacle sits in the bottom 5% of the new wall. If Dev pins the anchors
    // and leaves these alone, this fires.
    const tallest = Math.max(...TRENCH_OBSTACLE_STATIONS.map((o) => o.pos[1]))
    expect(tallest / TRENCH_WALL_H, 'the furniture must scale with the wall, not sit on it')
      .toBeGreaterThan(0.1)
  })

  it('the streamed wall force fields land INSIDE the pilot\'s reachable band', () => {
    // MIGRATED (sw7-22 / R6d): the force field ("catwalk") is no longer a furniture station
    // — force fields are now STREAMED from the wedge grid (`streamForceFields`). Their whole
    // reason to exist is unchanged: they must sit INSIDE the band the pilot flies, or the
    // hazard is unreachable (below his floor clearance) or scenery (above his ceiling). BS.WAV
    // 1 carries force fields (PIE1 is all guns); check every distinct slot height.
    const heights = new Set(streamForceFields(1, createRng(0)).map((f) => f.pos[1]))
    expect(heights.size, 'the trench streams force fields').toBeGreaterThan(0)
    for (const y of heights) {
      expect(y, 'a field below the pilot\'s floor clearance is not a hazard')
        .toBeGreaterThan(ROM_EYE_MIN)
      expect(y, 'a field above the pilot\'s ceiling is just scenery')
        .toBeLessThan(ROM_EYE_MAX)
    }
  })

  it('turrets and squares are mounted ON the walls', () => {
    for (const o of TRENCH_OBSTACLE_STATIONS) {
      if (o.kind === 'catwalk') continue
      expect(Math.abs(o.pos[0]), `${o.kind} is on a wall`).toBe(TRENCH_HALF_W)
    }
  })

  it('the wall panels cover the wall, not a strip along its foot', () => {
    // trench-detail exists to give the wall a surface. On a 4096 wall, a 120-unit band of
    // panels starting 80 up is invisible — the trench reads as a bare cage again, which is
    // the exact defect story 11-6 was written to remove.
    const panels = trenchWallDetail(0)
    const ys = panels.vertices.map((v) => v[1])
    const top = Math.max(...ys)
    expect(top / TRENCH_WALL_H, 'the panel band must scale with the wall').toBeGreaterThan(0.25)
    expect(top, 'and stay inside the trench').toBeLessThanOrEqual(TRENCH_WALL_H)

    for (const v of panels.vertices) {
      expect(Math.abs(v[0]), 'panels are ON the walls').toBe(TRENCH_HALF_W)
    }
  })
})

describe('sw5-6 — the pinned trench changes what can hit the pilot', () => {
  it('the pilot can never reach the walls — wall furniture is shoot-only', () => {
    // ROM: lateral clamp ±0x1FF (511) inside walls at ±0x400 (1024). The cabinet's pilot
    // always keeps 513 units of side clearance; he cannot crash into a wall turret, only
    // shoot it. Our old ±512 band in a ±256 trench let him fly straight through the walls.
    //
    // This is the load-bearing consequence of pinning TRENCH_HALF_W, so state it as a
    // contract rather than leaving it to be discovered as a "regression" later.
    const clearance = TRENCH_HALF_W - TRENCH_VIEW_HALF_W
    expect(clearance, 'the pilot stays inside the walls').toBeGreaterThan(0)
    expect(clearance, 'and out of reach of anything mounted on them')
      .toBeGreaterThan(OBSTACLE_HIT_RADIUS)
  })
})
