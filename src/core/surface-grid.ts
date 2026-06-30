// src/core/surface-grid.ts
//
// Story 11-5 — the Death Star surface as a procedural, receding ground grid.
//
// DEATH_STAR_SURFACE (Object_8) is a narrow 3-fin spike, never a ground: seated
// 600 units from the eye it balloons off every screen edge and collapses to a
// triangle at the crosshair (docs/adr/0002-scene-geometry-surface-and-trench.md
// part A). This replaces it — for the surface SCENE only; the model stays in the
// registry, re-classified — with a wide grid on the y=0 floor that recedes to a
// horizon and scrolls toward the cockpit.
//
// PURE core, exactly like Tempest's tube geometry: deterministic, no DOM/time/
// randomness, so the boundary holds and the geometry is unit-tested (segment
// counts, ±X symmetry, width/length envelope, scroll recycling). The shell only
// strokes the returned Model3D through drawWireframe and lifts the camera.

import type { Vec3 } from './math3d'
import type { Model3D } from './models'

/** Lateral spacing between the longitudinal (parallel-to-−Z) lines. */
export const GRID_X = 400
/** Spacing between the lateral (across-X) lines — also the scroll period. */
export const GRID_Z = 500
/** Half the grid's total width: the outermost longitudinal lines sit at ±this,
 *  wide enough to run off-screen at the horizon (ADR 0002 part A: ≈ 3000–4000). */
export const GRID_HALF_WIDTH = 3600
/** Far cutoff: the grid recedes from the cockpit out to z ≈ −GRID_FAR (the horizon). */
export const GRID_FAR = 6000

/**
 * A wide ground grid on the y=0 plane, scrolled toward the cockpit by `scroll`.
 *
 * - Longitudinal lines parallel to −Z at x = ±k·GRID_X out to ±GRID_HALF_WIDTH —
 *   the receding "ground". They are static under z-scroll (sliding a line along
 *   its own −Z direction looks identical), so only the laterals move.
 * - Lateral lines across X every GRID_Z, from the cockpit (z≈0) out to −GRID_FAR,
 *   advanced toward the camera by `scroll mod GRID_Z` so the ground rushes past
 *   and recycles every GRID_Z (surfaceGrid(s) ≡ surfaceGrid(s + GRID_Z)).
 */
export function surfaceGrid(scroll: number): Model3D {
  const vertices: Vec3[] = []
  const edges: [number, number][] = []

  // Longitudinal lines (parallel to −Z), each spanning cockpit → horizon.
  const halfCount = Math.round(GRID_HALF_WIDTH / GRID_X)
  for (let k = -halfCount; k <= halfCount; k++) {
    const x = k * GRID_X
    const near = vertices.push([x, 0, 0]) - 1
    const far = vertices.push([x, 0, -GRID_FAR]) - 1
    edges.push([near, far])
  }

  // Lateral lines (across X), recycling toward the camera every GRID_Z. The
  // modulo keeps `offset` in [0, GRID_Z) for any scroll (incl. negative).
  const offset = ((scroll % GRID_Z) + GRID_Z) % GRID_Z
  const farCount = Math.round(GRID_FAR / GRID_Z)
  for (let k = 0; k <= farCount; k++) {
    const z = -k * GRID_Z + offset
    const left = vertices.push([-GRID_HALF_WIDTH, 0, z]) - 1
    const right = vertices.push([GRID_HALF_WIDTH, 0, z]) - 1
    edges.push([left, right])
  }

  return { name: 'Surface Grid', vertices, edges }
}
