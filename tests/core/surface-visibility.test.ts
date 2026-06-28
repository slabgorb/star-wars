// tests/core/surface-visibility.test.ts
//
// Story 8-11 (RED): the Wave 2 Death Star surface geometry must be VISIBLE
// during gameplay.
//
// THE BUG. shell/render.ts draws the surface floor at `[0, -state.altitude, 0]`
// — world Z = 0, sitting on top of the cockpit. DEATH_STAR_SURFACE spans object
// Z from -3840 to +6720 (10 560 units deep), and SURFACE_ORIENT is a roll about
// Z, so it leaves each vertex's Z untouched. Placed at Z=0 the model straddles
// the camera: its detailed near rings (object Z up to +6720) fall BEHIND the
// cockpit and are clipped — project() drops any vertex with z >= -NEAR — while
// only the far rings (object Z <= -1440) survive, beyond where the turrets
// stand. The floor you are skimming over never reads; turrets appear to float in
// front of a distant speck.
//
// THE CONTRACT. Mirroring the Wave 3 fix (trenchPlacement), the GREEN phase adds
// a pure render export `surfacePlacement(state) -> { floor }` that positions the
// surface wholly ahead of the cockpit and spanning the turret zone, while
// preserving the working altitude-skim framing (floor Y tracks -altitude). Like
// the Wave 2/3 RED suites this references an export the GREEN phase will add, so
// `tsc` is red until it lands while vitest runs and reports the contract as
// failing. Orientation/scale stay an EYEBALL check (AC-3, context-story-8-11.md);
// these tests pin the structural, projection-level contract.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  SKIM_ALTITUDE,
  SPAWN_DISTANCE,
  type GameState,
} from '../../src/core/state'
import { DEATH_STAR_SURFACE } from '../../src/core/models'
import { FOV_Y } from '../../src/core/gameRules'
import { perspective, transform, add, type Vec3 } from '../../src/core/math3d'
import { project, NEAR, FAR } from '../../src/shell/wireframe'
import * as RenderModule from '../../src/shell/render'

/** A fresh surface run, optionally overridden (e.g. a different altitude). */
const surface = (over: Partial<GameState> = {}, seed = 1983): GameState => ({
  ...initialState(seed),
  phase: 'surface',
  ...over,
})

// A representative 4:3 viewport; project() only needs a positive aspect, and it
// clips solely on the near plane (z >= -NEAR), so "visible" here means "in front
// of the cockpit, i.e. actually stroked" — exactly render()'s own cull.
const W = 1280
const H = 960
const proj = perspective(FOV_Y, W / H, NEAR, FAR)

/** A surface vertex after the display orientation and the floor placement. */
const placed = (v: Vec3, floor: Vec3): Vec3 =>
  add(transform(RenderModule.SURFACE_ORIENT, v), floor)

/** How many of the surface's vertices land in front of the cockpit (drawable). */
const visibleCount = (floor: Vec3): number =>
  DEATH_STAR_SURFACE.vertices.filter((v) => project(placed(v, floor), proj, W, H) !== null)
    .length

// --- AC-1 / export shape & altitude framing ---------------------------------

describe('Story 8-11 — surfacePlacement export & altitude framing', () => {
  it('render exports a pure surfacePlacement(state) returning a finite Vec3 floor', () => {
    const { floor } = RenderModule.surfacePlacement(surface())
    expect(Array.isArray(floor)).toBe(true)
    expect(floor).toHaveLength(3)
    expect(floor.every((n) => Number.isFinite(n))).toBe(true)
  })

  it('is a pure function of state — identical input yields identical placement', () => {
    const a = RenderModule.surfacePlacement(surface())
    const b = RenderModule.surfacePlacement(surface())
    expect(a).toEqual(b)
  })

  it('keeps the floor in the ship’s altitude frame (it drops as the ship climbs)', () => {
    // The working terrain-skim mechanic must survive the Z fix: the floor's Y is
    // still -altitude, so climbing/diving still moves the surface away/closer.
    expect(RenderModule.surfacePlacement(surface({ altitude: SKIM_ALTITUDE })).floor[1]).toBe(
      -SKIM_ALTITUDE,
    )
    expect(RenderModule.surfacePlacement(surface({ altitude: 300 })).floor[1]).toBe(-300)
  })

  it('reads a grounded ship (altitude 0) verbatim, never substituting a default', () => {
    // altitude 0 is falsy-but-valid; a `|| SKIM_ALTITUDE` default would be a bug.
    const { floor } = RenderModule.surfacePlacement(surface({ altitude: 0 }))
    expect(floor[1] === 0).toBe(true) // -0 or +0, both === 0
    expect(floor[1]).not.toBe(-SKIM_ALTITUDE)
  })
})

// --- AC-1 the surface is positioned ahead of the cockpit (visible) ----------

describe('Story 8-11 — the surface sits ahead of the cockpit', () => {
  it('places the floor ahead of the near clip plane, not on top of the cockpit', () => {
    const { floor } = RenderModule.surfacePlacement(surface())
    expect(floor[2]).toBeLessThan(-NEAR) // down -Z, never the buggy Z=0
  })

  it('draws the WHOLE surface — every vertex lands in front of the cockpit, none clipped', () => {
    // The crux: at the buggy Z=0 floor the near rings (object Z up to +6720) are
    // behind the cockpit and dropped. A correct placement puts all of them ahead.
    const { floor } = RenderModule.surfacePlacement(surface())
    for (const v of DEATH_STAR_SURFACE.vertices) {
      expect(placed(v, floor)[2]).toBeLessThan(-NEAR)
    }
    expect(visibleCount(floor)).toBe(DEATH_STAR_SURFACE.vertices.length)
  })

  it('shows strictly more of the surface than the buggy Z=0 placement did', () => {
    // Pins the bug and guards against any regression to a Z=0 floor.
    const buggy = visibleCount([0, -SKIM_ALTITUDE, 0])
    const fixed = visibleCount(RenderModule.surfacePlacement(surface()).floor)
    expect(buggy).toBeLessThan(DEATH_STAR_SURFACE.vertices.length) // the bug: floor partly clipped
    expect(fixed).toBeGreaterThan(buggy) // the fix reveals the clipped rings
  })
})

// --- AC-2 turret / surface spatial alignment --------------------------------

describe('Story 8-11 — turrets stand on the surface, not over a distant speck', () => {
  it('puts floor geometry in the turret zone and recedes past it to the horizon', () => {
    // Turrets spawn at z = -SPAWN_DISTANCE and scroll to the cockpit (z -> 0), so
    // they occupy the band (-SPAWN_DISTANCE, 0). The surface must carry geometry
    // INSIDE that band (so turrets sit on visible floor) AND extend BEYOND it (so
    // the floor reads as receding terrain, not a slab that stops at the turrets).
    const { floor } = RenderModule.surfacePlacement(surface())
    const worldZ = DEATH_STAR_SURFACE.vertices.map((v) => placed(v, floor)[2])

    const inTurretZone = worldZ.some((z) => z > -SPAWN_DISTANCE && z < -NEAR)
    const beyondTurrets = worldZ.some((z) => z < -SPAWN_DISTANCE)

    expect(inTurretZone).toBe(true) // floor beneath where the turrets stand
    expect(beyondTurrets).toBe(true) // and it keeps going past them
  })
})
