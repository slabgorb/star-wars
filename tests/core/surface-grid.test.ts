// tests/core/surface-grid.test.ts
//
// Story 11-5 — Procedural Death Star surface: a receding ground grid + horizon.
// RED phase. These tests define the contract and are EXPECTED TO FAIL until the
// GREEN phase implements it.
//
// WHY THIS STORY EXISTS (see docs/adr/0002-scene-geometry-surface-and-trench.md
// part A): DEATH_STAR_SURFACE (Object_8) is a narrow 3-fin spike, never a ground.
// Seated 600 units from the eye it balloons off every screen edge and collapses
// to a triangle at the crosshair — the surface phase reads as a triangle, not a
// surface. The fix is a PURE, deterministic core generator that builds a wide,
// receding ground grid on the y=0 plane and scrolls it toward the cockpit.
//
// THE CONTRACT this suite asks DEV to implement:
//
//   src/core/surface-grid.ts:
//     export function surfaceGrid(scroll: number): Model3D
//     export const GRID_X: number            // lateral spacing of longitudinal lines
//     export const GRID_Z: number            // spacing of lateral lines (the scroll period)
//     export const GRID_HALF_WIDTH: number   // outermost longitudinal line at x = ±GRID_HALF_WIDTH
//     export const GRID_FAR: number          // far cutoff (the grid recedes to z ≈ -GRID_FAR)
//
//   src/core/state.ts — GameState gains:
//     surfaceScrollZ: number   // accumulator; initialState() seeds it to 0
//
//   src/core/sim.ts:
//     - stepSurface advances surfaceScrollZ by TURRET_SCROLL_SPEED·dt (the SAME
//       flow that scrolls the turrets), and surfaceGrid reads it.
//     - enterPhase resets surfaceScrollZ to 0 on every phase entry.
//
// DESIGN DECISIONS (logged as TEA deviations — the spec left these open):
//   - Module path: the generator + its GRID_* envelope constants live in a
//     dedicated `src/core/surface-grid.ts` (single responsibility; 11-6's
//     trenchChannel will mirror it). Dev may split internally and re-export.
//   - Return type: a `Model3D` (the story description says `-> Model3D`), so the
//     shell strokes it through the existing drawWireframe like every other model.
//
// Tests reference GRID_* BY NAME, never hard-coded numbers, so they stay correct
// whatever authentic-feel values GREEN settles on (the surface.test.ts pattern).
// Per the repo's RED convention, `tsc` is red until the new symbols exist; vitest
// (esbuild, no typecheck) still RUNS these and reports the contract as failing.

import { describe, it, expect } from 'vitest'
import {
  surfaceGrid,
  GRID_X,
  GRID_Z,
  GRID_HALF_WIDTH,
  GRID_FAR,
} from '../../src/core/surface-grid'
import {
  initialState,
  TURRET_SCROLL_SPEED,
  type GameState,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { DEATH_STAR_SURFACE, type Model3D } from '../../src/core/models'

const EPS = 1e-6

/** Distinct x-values carrying a LONGITUDINAL line (an edge parallel to −Z: both
 *  endpoints share an x and differ in z), sorted ascending. */
function longitudinalXs(m: Model3D): number[] {
  const xs = new Set<number>()
  for (const [a, b] of m.edges) {
    const va = m.vertices[a]
    const vb = m.vertices[b]
    if (va[0] === vb[0] && va[2] !== vb[2]) xs.add(va[0])
  }
  return [...xs].sort((p, q) => p - q)
}

/** Distinct z-values carrying a LATERAL line (an edge across X: both endpoints
 *  share a z and differ in x), sorted ascending. */
function lateralZs(m: Model3D): number[] {
  const zs = new Set<number>()
  for (const [a, b] of m.edges) {
    const va = m.vertices[a]
    const vb = m.vertices[b]
    if (va[2] === vb[2] && va[0] !== vb[0]) zs.add(va[2])
  }
  return [...zs].sort((p, q) => p - q)
}

// --- AC1: surfaceGrid is a well-formed Model3D on the y=0 ground plane --------

describe('Story 11-5 — surfaceGrid: shape & the ground plane', () => {
  it('returns a Model3D with vertices and edges', () => {
    const g = surfaceGrid(0)
    expect(typeof g.name).toBe('string')
    expect(Array.isArray(g.vertices)).toBe(true)
    expect(Array.isArray(g.edges)).toBe(true)
    expect(g.vertices.length).toBeGreaterThan(0)
    expect(g.edges.length).toBeGreaterThan(0)
  })

  it('every vertex is a finite 3D point', () => {
    const g = surfaceGrid(0)
    for (const v of g.vertices) {
      expect(v).toHaveLength(3)
      expect(Number.isFinite(v[0])).toBe(true)
      expect(Number.isFinite(v[1])).toBe(true)
      expect(Number.isFinite(v[2])).toBe(true)
    }
  })

  it('every edge indexes two distinct, in-range vertices (no degenerate edges)', () => {
    const g = surfaceGrid(0)
    for (const [a, b] of g.edges) {
      expect(Number.isInteger(a)).toBe(true)
      expect(Number.isInteger(b)).toBe(true)
      expect(a).not.toBe(b)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(g.vertices.length)
      expect(b).toBeLessThan(g.vertices.length)
    }
  })

  it('lies flat on the y=0 ground plane (this is a floor, not the y-spanning spike)', () => {
    const g = surfaceGrid(0)
    for (const v of g.vertices) expect(v[1]).toBe(0)
  })
})

// --- AC1: pure & deterministic ----------------------------------------------

describe('Story 11-5 — surfaceGrid is pure & deterministic', () => {
  it('returns identical geometry for identical scroll (no DOM/time/random state)', () => {
    // Repeated calls must match exactly — a Math.random()/Date.now() leak would
    // diverge here. Purity is further guaranteed by the core/shell boundary
    // (the generator lives in core/, which may never touch the shell).
    expect(surfaceGrid(0)).toEqual(surfaceGrid(0))
    expect(surfaceGrid(137.5)).toEqual(surfaceGrid(137.5))
  })
})

// --- AC1: width / length envelope & line counts ------------------------------

describe('Story 11-5 — surfaceGrid envelope & line counts', () => {
  it('spans the full width: outermost longitudinal lines reach ±GRID_HALF_WIDTH', () => {
    const xs = surfaceGrid(0).vertices.map((v) => v[0])
    expect(Math.max(...xs)).toBeCloseTo(GRID_HALF_WIDTH)
    expect(Math.min(...xs)).toBeCloseTo(-GRID_HALF_WIDTH)
  })

  it('is mirror-symmetric across x=0 (for every (x,0,z) there is a (-x,0,z))', () => {
    const g = surfaceGrid(0)
    const present = new Set(g.vertices.map((v) => `${v[0]}|${v[2]}`))
    for (const v of g.vertices) {
      expect(present.has(`${-v[0]}|${v[2]}`)).toBe(true)
    }
  })

  it('spaces the longitudinal lines exactly GRID_X apart, with no gaps', () => {
    const xs = longitudinalXs(surfaceGrid(0))
    expect(xs.length).toBeGreaterThanOrEqual(3) // a grid, not a lone line
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(GRID_X)
    }
    // count is consistent with the spacing across the full ±GRID_HALF_WIDTH span
    const span = xs[xs.length - 1] - xs[0]
    expect(xs.length).toBe(Math.round(span / GRID_X) + 1)
  })

  it('spaces the lateral lines exactly GRID_Z apart, receding from the cockpit to the horizon', () => {
    const zs = lateralZs(surfaceGrid(0))
    expect(zs.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < zs.length; i++) {
      expect(zs[i] - zs[i - 1]).toBeCloseTo(GRID_Z)
    }
    const nearest = zs[zs.length - 1] // least-negative z = closest to the cockpit
    const farthest = zs[0] // most-negative z = the horizon
    expect(nearest).toBeLessThanOrEqual(0 + EPS) // ahead of / at the cockpit
    expect(nearest).toBeGreaterThanOrEqual(-GRID_Z - EPS) // within one cell of it
    expect(farthest).toBeLessThanOrEqual(-(GRID_FAR - GRID_Z)) // recedes to ≈ the far cutoff
    expect(farthest).toBeGreaterThanOrEqual(-GRID_FAR - EPS) // but never overshoots it
  })
})

// --- AC1 / AC3: scroll recycling & direction ---------------------------------

describe('Story 11-5 — surfaceGrid scroll recycling', () => {
  it('recycles by scroll mod GRID_Z: surfaceGrid(s) === surfaceGrid(s + GRID_Z)', () => {
    for (const s of [0, GRID_Z / 3, 1.0, GRID_Z * 2.25]) {
      expect(surfaceGrid(s)).toEqual(surfaceGrid(s + GRID_Z))
    }
  })

  it('scrolls the ground toward the camera as scroll grows (lateral lines advance in +Z)', () => {
    const base = lateralZs(surfaceGrid(0))
    // An INTERIOR lateral line — away from both ends, so a sub-cell scroll can't
    // wrap it. A grid that scrolls toward the cockpit moves it by +delta in z.
    const interior = base[Math.floor(base.length / 2)]
    const delta = GRID_Z * 0.3
    const shifted = lateralZs(surfaceGrid(delta))
    expect(shifted.some((z) => Math.abs(z - (interior + delta)) < EPS)).toBe(true)
    // …and it did NOT stay put (it genuinely moved, not a no-op scroll).
    expect(shifted.some((z) => Math.abs(z - interior) < EPS)).toBe(false)
  })
})

// --- AC3: the surfaceScrollZ accumulator -------------------------------------

describe('Story 11-5 — surfaceScrollZ accumulator', () => {
  it('initialState seeds surfaceScrollZ to 0', () => {
    const s = initialState()
    expect(typeof s.surfaceScrollZ).toBe('number')
    expect(s.surfaceScrollZ).toBe(0)
  })

  it('advances surfaceScrollZ by TURRET_SCROLL_SPEED·dt while skimming the surface', () => {
    const s0 = enterPhase(initialState(), 'surface')
    const dt = 0.1
    const s1 = stepGame(s0, NO_INPUT, dt)
    expect(s1.surfaceScrollZ).toBeCloseTo(TURRET_SCROLL_SPEED * dt)
  })

  it('rides the SAME flow as the turrets (ground and turrets advance by one delta)', () => {
    const s0: GameState = { ...enterPhase(initialState(), 'surface'), turrets: [{ pos: [0, 0, -1000] }] }
    const dt = 0.1
    const s1 = stepGame(s0, NO_INPUT, dt)
    const turretAdvance = s1.turrets[0].pos[2] - -1000
    expect(turretAdvance).toBeCloseTo(TURRET_SCROLL_SPEED * dt)
    expect(s1.surfaceScrollZ).toBeCloseTo(turretAdvance)
  })

  it('resets surfaceScrollZ to 0 on entering the surface phase', () => {
    const dirty = { ...initialState(1983), surfaceScrollZ: 555 }
    expect(enterPhase(dirty, 'surface').surfaceScrollZ).toBe(0)
  })

  it('resets surfaceScrollZ to 0 on entering any other phase too', () => {
    const dirty = { ...initialState(1983), surfaceScrollZ: 555 }
    expect(enterPhase(dirty, 'space').surfaceScrollZ).toBe(0)
    expect(enterPhase(dirty, 'trench').surfaceScrollZ).toBe(0)
  })

  it('accumulates deterministically for a fixed seed', () => {
    let a = enterPhase(initialState(7), 'surface')
    let b = enterPhase(initialState(7), 'surface')
    for (let i = 0; i < 20; i++) {
      a = stepGame(a, NO_INPUT, 0.1)
      b = stepGame(b, NO_INPUT, 0.1)
    }
    expect(a.surfaceScrollZ).toBe(b.surfaceScrollZ)
    expect(a).toEqual(b)
  })
})

// --- AC5: DEATH_STAR_SURFACE is re-classified, NOT deleted --------------------

describe('Story 11-5 — DEATH_STAR_SURFACE retired, not deleted (AC5 regression guard)', () => {
  it('keeps DEATH_STAR_SURFACE in the model registry', () => {
    expect(DEATH_STAR_SURFACE).toBeDefined()
    expect(DEATH_STAR_SURFACE.vertices.length).toBeGreaterThan(0)
    expect(DEATH_STAR_SURFACE.edges.length).toBeGreaterThan(0)
  })

  it('confirms it is a y-spanning spike — which is exactly why it can NOT be the ground', () => {
    const ys = DEATH_STAR_SURFACE.vertices.map((v) => v[1])
    // Unlike the new grid (flat in y=0), the spike rises off the floor plane.
    expect(Math.max(...ys)).toBeGreaterThan(0)
  })
})
