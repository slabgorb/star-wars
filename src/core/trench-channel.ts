// src/core/trench-channel.ts
//
// Story 11-6 — the Death Star trench as a procedural, receding WALLED channel.
//
// The trench phase drew a single flat 512×384 floor tile (the TRENCH model).
// Seated at the port's depth it reprojects to a ~224px-wide, ~4px-tall sliver —
// no walls, no length (docs/adr/0002-scene-geometry-surface-and-trench.md part
// B). This replaces it — for the trench SCENE only; the TRENCH model stays in the
// registry, re-classified — with a long corridor: floor rails, lateral floor
// ribs, two vertical ribbed side walls, and top rails, receding to a far cutoff
// and scrolling toward the cockpit.
//
// PURE core, exactly like the surface grid (story 11-5) it mirrors: deterministic,
// no DOM/time/randomness, so the boundary holds and the geometry is unit-tested
// (wall height, ±X symmetry, width/length envelope, rib counts, scroll recycling).
// The shell only strokes the returned Model3D through drawWireframe; the camera
// skims just above the floor.

import type { Vec3 } from '@arcade/shared/math3d'
import type { Model3D } from './models'

/** Half the channel width: the floor rails and the two side walls sit at
 *  x = ±this. Narrow — a corridor you fly down, not the open surface.
 *  findings (docs/star-wars-1983-source-findings.md ## Trench geometry &
 *  limits): two conflicting ROM candidates and no documented ROM-unit↔our-unit
 *  conversion to arbitrate them (`Obj_Trench_Squares` outer ring ±$100=256 vs
 *  `sub_8735`'s left/right wall pass MReg3D=±$400=1024) — kept as our existing
 *  world-scale anchor; RIB_Z/TRENCH_FAR below are scaled off it using the ROM's
 *  OWN ratios. See ## Open follow-ups. */
export const TRENCH_HALF_W = 256 // PROVISIONAL(findings ## Trench geometry & limits) — not pinned, see Open follow-ups
/** Height the side walls rise from the y=0 floor to the top rails — taller than
 *  the cockpit skim (render TRENCH_SKIM) so the walls tower into a trench.
 *  findings: not pinned — `sub_703B`'s vertical viewpoint clamp (−257…−3583) is
 *  the camera's travel range inside the trench, not the walls' static height.
 *  Kept provisional; see ## Open follow-ups. */
export const TRENCH_WALL_H = 320 // PROVISIONAL(findings ## Trench geometry & limits) — not pinned, see Open follow-ups
/** Spacing between the lateral ribs (floor + wall rungs) — also the scroll period.
 *  findings: `sub_87CB` (the side-wall vertical-line recursion) clamps its Z
 *  window to $800 (2048) — 2× the wall half-width $400 (1024) from `sub_8735`'s
 *  left/right wall pass. Applying that 2:1 ratio to our TRENCH_HALF_W anchor. */
export const RIB_Z = 512
/** Far cutoff: the channel recedes from the cockpit out to z ≈ −TRENCH_FAR (the
 *  vanishing point), well beyond the exhaust port's spawn (EXHAUST_PORT_DISTANCE)
 *  and inside the render far-clip plane.
 *  findings: `sub_87CB` culls the side-wall vertical-line recursion past
 *  camera + $7000 (28672) — 28× the wall half-width $400 (1024) from
 *  `sub_8735`. Applying that 28:1 ratio to our TRENCH_HALF_W anchor. */
export const TRENCH_FAR = 7168

/**
 * A long walled trench channel on the y=0 floor, scrolled toward the cockpit by
 * `scroll`.
 *
 * - Four longitudinal RAILS at x = ±TRENCH_HALF_W — a floor rail (y=0) and a top
 *   rail (y=TRENCH_WALL_H) on each wall — spanning cockpit → far cutoff. They are
 *   static under z-scroll (sliding a line along its own −Z direction looks
 *   identical), so only the ribs move.
 * - At each RIB_Z station, recycling toward the camera: a lateral FLOOR rib across
 *   the channel (y=0) and a VERTICAL rib up each wall (0 → TRENCH_WALL_H). The
 *   `offset` advances them by `scroll mod RIB_Z` so the corridor rushes past and
 *   recycles every RIB_Z (trenchChannel(s) ≡ trenchChannel(s + RIB_Z)).
 */
export function trenchChannel(scroll: number): Model3D {
  const vertices: Vec3[] = []
  const edges: [number, number][] = []

  // Longitudinal rails: floor + top on each wall, each spanning cockpit → far.
  for (const x of [-TRENCH_HALF_W, TRENCH_HALF_W]) {
    for (const y of [0, TRENCH_WALL_H]) {
      const near = vertices.push([x, y, 0]) - 1
      const far = vertices.push([x, y, -TRENCH_FAR]) - 1
      edges.push([near, far])
    }
  }

  // Lateral ribs, recycling toward the camera every RIB_Z. The modulo keeps
  // `offset` in [0, RIB_Z) for any scroll (incl. negative).
  const offset = ((scroll % RIB_Z) + RIB_Z) % RIB_Z
  const farCount = Math.round(TRENCH_FAR / RIB_Z)
  for (let k = 0; k <= farCount; k++) {
    const z = -k * RIB_Z + offset
    // Floor rib across the channel (y=0).
    const fl = vertices.push([-TRENCH_HALF_W, 0, z]) - 1
    const fr = vertices.push([TRENCH_HALF_W, 0, z]) - 1
    edges.push([fl, fr])
    // Vertical wall ribs (floor rail → top rail) at the same station, one per wall.
    const tl = vertices.push([-TRENCH_HALF_W, TRENCH_WALL_H, z]) - 1
    const tr = vertices.push([TRENCH_HALF_W, TRENCH_WALL_H, z]) - 1
    edges.push([fl, tl])
    edges.push([fr, tr])
  }

  return { name: 'Trench Channel', vertices, edges }
}
