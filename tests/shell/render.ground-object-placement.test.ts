// tests/shell/render.ground-object-placement.test.ts
//
// Story sw5-5 — RED phase (O'Brien / TEA): the ROM->world bridge for the ground
// objects, and the constants that hang off it.
//
// sw5-5 moves SURFACE_TOWER / TOWER_CAP / SURFACE_BUNKER into RAW ROM UNITS, so
// models.ts now holds ROM truth for them exactly as it already does for the TIE
// family (which is why those pairs compare clean on the contact sheet). The ROM
// authors ground objects with:
//
//     x = fore/aft   y = lateral   z = UP, recentred by GD$MDT   scale .S=120
//
// but the port's surface world is Y-UP with the floor at y=0. Something has to
// bridge the two. The shell is where that belongs, and the precedent is already
// in the file: TIE_ORIENT is a FIXED display correction that stands the ROM's
// TIE upright without touching the model. TOWER_ORIENT is the same idea, and it
// is IDENTITY today only because sw3-11 re-authored the ground models into the
// port's frame by hand — the very thing this story undoes.
//
// So these tests pin the CONTRACT of the bridge (where the tower ends up), never
// the matrix that implements it. Dev stays free to compose it however reads best.
//
// -- WHAT THE BRIDGE MUST PRESERVE, AND WHAT IT MUST CHANGE ------------------
//
// PRESERVE: the tower's FOOTPRINT. The ROM base ring is r=8 -> 8*120 = 960 raw
// units, and the shipped game draws it at r=32. So the presentation scale is
// 960 -> 32, i.e. 1/30 (equivalently: 4 world units per .S unit, sw3-11's "x4").
// The tower must not get wider; the maze spacing and hit radii all assume today's
// footprint.
//
// CHANGE: the tower's HEIGHT. sw3-11 read the `.PGND` height column in decimal
// when WSOBJ.MAC is `.RADIX 16` (see tests/core/ground-objects-rom.test.ts), so
// the shipped tower is too short. Read correctly the rings land at, in world y:
//
//     h=0x00  ->    0     base            (on the floor)
//     h=0x06  ->   24     near bottom
//     h=0x14  ->   80     midline         (was 56 -- the decimal misread)
//     h=0x52  ->  328     bottom of cannon (was 208)
//     h=0x58  ->  352     top of cannon    (was 232)  <- the new TOWER_HEIGHT
//
// -- GD$MDT IS THE SKIM ALTITUDE --------------------------------------------
//
// GD$MDT (0xF00 = 3840) is not a cosmetic offset. Its comment is "OFFSET HITE TO
// MID OF PLAYERS HITE": the ROM recentres the tower so that model z=0 sits at the
// height the player flies at. Scaled into the world that is 3840/30 = 128 — so
// the ROM has been telling us the skim altitude all along. state.ts's
// SKIM_ALTITUDE was 120, a hand-picked number its own comment flagged as "chosen
// to play right... named for easy correction once deeper reverse-engineering
// recovers the real numbers". This is that correction.

import { describe, it, expect } from 'vitest'
import { TOWER_ORIENT, GROUND_MODEL_SCALE, modelMatrix } from '../../src/shell/render'
import { SURFACE_TOWER, TOWER_CAP, SURFACE_BUNKER, type Model3D } from '../../src/core/models'
import { TOWER_HEIGHT, SKIM_ALTITUDE, TURRET_HIT_RADIUS } from '../../src/core/state'
import { transform, type Vec3 } from '@arcade/shared/math3d'

const GD$MDT = 0xf00 // 3840 — the ROM's own "mid of player's height"

/** The model as the shell actually places it: a ground object standing at the
 *  world origin. Exactly the composition render.ts uses per turret, with the
 *  turret's own position left at the origin so world == placed. */
function placed(m: Model3D): Vec3[] {
  const mat = modelMatrix([0, 0, 0], TOWER_ORIENT, GROUND_MODEL_SCALE)
  return m.vertices.map((v) => transform(mat, v))
}

/** Only the points a model's edges actually stroke — what the player SEES. */
function placedDrawn(m: Model3D): Vec3[] {
  const used = new Set(m.edges.flat())
  return placed(m).filter((_, i) => used.has(i))
}

const ys = (vs: Vec3[]) => vs.map((v) => v[1])
/** Horizontal distance from the tower's axis — the footprint radius. */
const radii = (vs: Vec3[]) => vs.map((v) => Math.hypot(v[0], v[2]))

describe('sw5-5 — the ROM ground objects land correctly in the y-up world', () => {
  // FIRST, and deliberately so. `modelMatrix(pos, orient, s = 1)` has a DEFAULT
  // parameter, so if the shell never exports GROUND_MODEL_SCALE the import lands
  // as `undefined`, the default silently takes over, and the placement tests below
  // quietly measure an unscaled model instead of failing. Pin the export itself so
  // that trapdoor is nailed shut: this test fails loudly, first, and by name.
  it('the shell exports the ROM -> world presentation scale', () => {
    expect(typeof GROUND_MODEL_SCALE, 'src/shell/render.ts must export GROUND_MODEL_SCALE').toBe('number')
    // The ROM base ring is r=8 -> 8 * .S(120) = 960 raw units, and the shipped
    // game draws it at r=32. 32/960 = 1/30. This is the number that keeps the
    // tower's FOOTPRINT identical while its height is corrected.
    expect(GROUND_MODEL_SCALE).toBeCloseTo(1 / 30, 10)
    expect(960 * GROUND_MODEL_SCALE).toBeCloseTo(32, 10)
  })

  it('TOWER_ORIENT actually reorients — the ROM model is z-up and cannot ship as IDENTITY', () => {
    // Guard against the tempting non-fix: swapping models.ts to ROM units and
    // leaving the orient alone. The model would render on its side, and every
    // other assertion here would be the only thing to catch it.
    const p = placed(SURFACE_TOWER)
    const spreadY = Math.max(...ys(p)) - Math.min(...ys(p))
    expect(spreadY, 'the tower must be tall along WORLD Y, not lying flat').toBeGreaterThan(300)
  })

  it('stands ON the floor: the base ring sits at y = 0', () => {
    const base = placed(SURFACE_TOWER).filter((_, i) => [0, 1, 2].includes(i))
    for (const v of base) expect(v[1]).toBeCloseTo(0)
  })

  it('keeps the shipped FOOTPRINT: the base ring is still r = 32 world units', () => {
    // The tower gets taller, never wider. 960 raw -> 32 world is the 1/30
    // presentation scale, and the maze spacing/hit radii all assume it.
    const base = placed(SURFACE_TOWER).filter((_, i) => [0, 1, 2].includes(i))
    for (const r of radii(base)) expect(r).toBeCloseTo(32)
  })

  it('puts every ring at its true HEX height — 0 / 24 / 80 / 328 / 352', () => {
    // The decimal misread put the midline at 56 and the cannon at 208/232. If a
    // future edit reverts to decimal, these are the numbers that move.
    const levels = [...new Set(ys(placed(SURFACE_TOWER)).map((y) => Math.round(y)))]
    expect(levels.sort((a, b) => a - b)).toEqual([0, 24, 80, 328, 352])
  })

  it('the cannon top is the composite peak, and TOWER_HEIGHT is exactly it (WYSIWYG)', () => {
    // state.ts documents TOWER_HEIGHT as the drawn peak — sim.ts launches every
    // tower fireball from `pos.y + TOWER_HEIGHT`, so if this drifts the shot
    // erupts out of thin air. The peak is only DRAWN by the cap (STB leaves the
    // cannon-top ring bare), so the composite is what counts.
    const composite = [...placedDrawn(SURFACE_TOWER), ...placedDrawn(TOWER_CAP)]
    expect(Math.max(...ys(composite))).toBeCloseTo(TOWER_HEIGHT)
    expect(TOWER_HEIGHT).toBe(352)
  })

  it('is the ROM aspect — 0x58 tall on a 16-wide base, ~5.5:1, not the 3.6:1 of the misread', () => {
    const p = placed(SURFACE_TOWER)
    const width = 2 * Math.max(...radii(p.filter((_, i) => [0, 1, 2].includes(i))))
    expect(TOWER_HEIGHT / width).toBeCloseTo(0x58 / 16, 1)
  })
})

describe('sw5-5 — the bunker is still the SHORTY once placed', () => {
  it('stands on the floor and reaches only the near-bottom ring (h=6 -> y=24)', () => {
    const p = placedDrawn(SURFACE_BUNKER)
    expect(Math.min(...ys(p))).toBeCloseTo(0)
    expect(Math.max(...ys(p))).toBeCloseTo(24)
  })

  it('is squat: no taller than half its own width (the macro\'s own word, "SHORTY")', () => {
    const p = placedDrawn(SURFACE_BUNKER)
    const height = Math.max(...ys(p)) - Math.min(...ys(p))
    const width = 2 * Math.max(...radii(p))
    expect(height).toBeLessThanOrEqual(width / 2)
  })

  it('is dwarfed by the corrected tower — under a sixth of its height', () => {
    const height = Math.max(...ys(placedDrawn(SURFACE_BUNKER)))
    expect(height).toBeLessThan(TOWER_HEIGHT / 6)
  })
})

// ---------------------------------------------------------------------------
// AC-5 — the collision consequences of a taller tower, stated out loud.
// ---------------------------------------------------------------------------

describe('sw5-5 AC-5 — the collidable volume, and what the taller tower does to it', () => {
  it('GD$MDT IS the skim altitude: SKIM_ALTITUDE is derived from the ROM, not guessed', () => {
    expect(SKIM_ALTITUDE).toBe(GD$MDT * GROUND_MODEL_SCALE)
    expect(SKIM_ALTITUDE).toBe(128)
  })

  it('the ship flies at the ROM\'s true fraction of tower height (GD$MDT / the tower\'s height)', () => {
    // The tower spans h=0 to h=0x58, so its height in raw ROM units is
    // 0x58 * .S = 10560 — NOT the recentred z of its peak (6720), which is a
    // coordinate, not a height. 3840 / 10560 = 0.3636...
    //
    // The old pairing (120 / 232) put the ship at 52% — roughly mid-tower, which
    // is what state.ts's comment claimed to want, but it was measuring against a
    // tower that had been transcribed too short. Corrected, the towers LOOM.
    const romFraction = GD$MDT / (0x58 * 120)
    expect(romFraction).toBeCloseTo(0.3636, 4)
    expect(SKIM_ALTITUDE / TOWER_HEIGHT).toBeCloseTo(romFraction, 4)
  })

  it('the hit VOLUME itself is unchanged — a bolt at the tower base still kills it', () => {
    // AC-5 asks for any change in the collidable volume to be called out. There
    // is none: a turret is a TURRET_HIT_RADIUS sphere centred on its base, and
    // this story does not touch it. What changes is the tower drawn AROUND it.
    expect(TURRET_HIT_RADIUS).toBe(200)
  })

  it('CALLED OUT: the hit sphere no longer reaches the cannon — the top of the tower is not shootable', () => {
    // This is the consequence AC-5 wants surfaced rather than discovered later.
    // The sphere reaches y=200 from the base. The old tower peaked at 232, so
    // all but its cap was coverable; the corrected tower peaks at 352, so the
    // entire cannon section (from y=328) now sits outside the hit volume.
    //
    // Deliberately NOT fixed here: growing the radius is a play-balance decision,
    // not a fidelity one, and the ROM's own turret hit test is not yet recovered.
    // Logged as a Delivery Finding. Pinned so the gap cannot go quiet.
    const cannonSeat = 328
    expect(TURRET_HIT_RADIUS).toBeLessThan(cannonSeat)
    expect(TOWER_HEIGHT - TURRET_HIT_RADIUS, 'unshootable metres of tower').toBe(152)
  })
})
