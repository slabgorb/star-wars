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

// --- The trench, pinned from WSBASE.MAC (story sw5-6) -----------------------
//
// These two anchors sat PROVISIONAL for four stories on the belief that the ROM offered
// "two conflicting candidates and no ROM-unit↔our-unit conversion to arbitrate them". It
// offers neither. WSBASE.MAC § VIEW STARBASE draws the trench, and `TBSBL` ("BASE BOTTOM
// LINES") IS the cross-section — each row a (lateral, height) pair:
//
//     .WORD -400,0          ;TOP LEFT PANEL
//     .WORD  400,0          ;TOP OF RIGHT PANEL
//     .WORD -400,-1000      ;FAR LEFT BOTTOM
//     .WORD -200,-1000      ;LEFT THIRD
//     .WORD  200,-1000      ;RIGHT THIRD
//     .WORD  400,-1000      ;FAR RIGHT BOTTOM
//
// Corroborated by `BSVSID` (`LDD #-400 ;LEFT SIDE` / `LDD #400 ;RIGHT SIDE`) and `BSVSDW`
// (`LDD #-1000 ;BOTTOM EDGE`, `;LIMIT TO BOTTOM`). So: walls at ±$400, top at height 0,
// floor at -$1000.
//
// ⚠ THE LITERALS ARE HEX. WSBASE.MAC is `.RADIX 16` and carries no `.RADIX` line to warn
// you — the same trap that bit sw3-11 and sw5-5. The file proves itself twice from the
// inside: DOFAR's `;PAINFUL MATH -- 8000 WRAPAROUND HANDLER` (only 0x8000 is the signed-16
// wrap point) and `CMPD #7000`, the same far cull the disassembly independently reports as
// $7000. Read as decimal the trench comes out wider than it is tall — a ditch. It is a
// CANYON: 2048 across, 4096 deep.
//
// The old ±256 came from `Obj_Trench_Squares` — trench FURNITURE sitting ON the floor, not
// the trench. That it coincides with the exhaust port's own base half-width (also 256) is
// a coincidence of two unrelated objects, and sw5-4 mistook it for corroboration.
//
// FRAME: we keep the FLOOR at y = 0 and let the walls rise to +TRENCH_WALL_H. That is the
// ROM's frame with the origin slid to the floor — relative geometry, which is what fidelity
// means, is preserved exactly, and it agrees with what trenchChannel, spawnPort and the
// surface phase already do.

/** Half the channel width — the floor rails and both side walls sit at x = ±this.
 *  ROM: `$400` (WSBASE.MAC `TBSBL`; `BSVSID` `LDD #-400 ;LEFT SIDE`). */
export const TRENCH_HALF_W = 0x400 // 1024
/** Height the side walls rise from the y=0 floor to the top rails.
 *  ROM: `$1000` — `TBSBL`'s bottom lines sit that far below its top rails, and `BSVSDW`
 *  clamps the wall's vertical run to `#-1000` (";LIMIT TO BOTTOM"). */
export const TRENCH_WALL_H = 0x1000 // 4096
/** Spacing between the lateral ribs (floor + wall rungs) — also the scroll period.
 *  ROM: the SHORT wedge is `#800` (WSBASE.MAC `DOFAR`/`NWFAR`/`BSVSID`), the unit the
 *  cabinet builds its trench out of. This was already derived as "2× the wall half-width";
 *  with the half-width pinned at $400 that ratio now lands on the ROM's own $800. */
export const RIB_Z = 0x800 // 2048
/** Far cutoff: the channel recedes to z ≈ −TRENCH_FAR.
 *  ROM: `#7000` — the distance past which BSVBOT/BSVFAR/BSVPORT stop drawing ("?CLOSE ENUF
 *  TO SEE?"). Also already derived as "28× the wall half-width"; pinning the half-width
 *  lands it on the ROM's own $7000. */
export const TRENCH_FAR = 0x7000 // 28672

// --- The pilotable viewpoint band (stories sw3-2, re-framed by sw5-6) -------
//
// sw3-2 transcribed the ROM's clamp in the ROM's frame — where the trench TOP is height 0
// and the floor is below it — as a NEGATIVE, dive-only band. That collided head-on with the
// channel above, which builds the floor at y=0: render.ts added the two together and flew
// the camera to y = −3268, thousands of units UNDER the trench. sw5-6 re-frames the band as
// a HEIGHT ABOVE THE FLOOR, which is the same physical band with the origin at the floor.
//
//   WSMAIN.MAC `S1MVBS` — lateral: `CMPD #1FF` / `CMPD #-1FF`.
//   WSMAIN.MAC `SMVG1B` — the ground→trench entry, in the ROM's own words:
//       CMPD #-0E00+100      ;JUST ABOVE BOTTOM OF TRENCH
//       IFGT
//       SUBD #100
//       STD M$TZ+M.S1        ;DROP PLAYER INTO TRENCH
//   so the down limit is −$E00 and the up limit −$100, inside a $1000-deep trench. The
//   disassembly's −257…−3583 (sub_703B) is exactly that band read exclusively.
//
// The pilot flies the band BOTH ways. The old `Math.min(0, …)` clamp let him only sink.

/** Lateral half-travel of the eye about the centreline. ROM: `$1FF` (WSMAIN.MAC `S1MVBS`).
 *  Note this is strictly INSIDE the walls: ±511 in a ±1024 trench leaves 513 units of side
 *  clearance, so the cabinet's pilot can never CRASH a wall. Wall furniture is shoot-only —
 *  except the force-field "catwalk" (TD$WFF, B-012), which is SIDE-GATED: it blocks only the
 *  half-channel on the wall it is mounted on, at its height slot (see FORCE_FIELD_* below). */
export const TRENCH_VIEW_HALF_W = 0x1ff // 511
/** The eye's lowest height above the trench floor — the ROM's minimum ground clearance.
 *  `$1000 − $E00`. The surface phase enforces the same number (WSMAIN.MAC `GD$MNT == 200`):
 *  the cabinet never lets the ship closer than 512 units to the ground, in either phase. */
export const TRENCH_EYE_MIN = TRENCH_WALL_H - 0xe00 // 512
/** The eye's highest height above the trench floor. `$1000 − $100`. */
export const TRENCH_EYE_MAX = TRENCH_WALL_H - 0x100 // 3840
/** Where the eye seats on trench entry. `SMVG1B` drops the pilot until he is at or below
 *  −$E00+$100 — "JUST ABOVE BOTTOM OF TRENCH" — so he enters riding LOW in the channel and
 *  must CLIMB to see over anything. He does not start halfway up the wall. */
export const TRENCH_EYE_SEAT = TRENCH_WALL_H - (0xe00 - 0x100) // 768
/** Yoke → viewpoint velocity (world units/second). Chosen to sweep the lateral band in
 *  ~0.4s and cross the full vertical band in ~2.8s — snappy enough to dodge a catwalk
 *  mid-crossing. No symbolic ROM rate recovered; PROVISIONAL. */
export const TRENCH_VIEW_RATE = 1200

// --- The wall force field ("catwalk") collision — WSPANL.MAC:186-215 (B-012) --
//
// The ROM "catwalk" is a WALL FORCE FIELD (TD$WFF), not a channel-spanning bar. Its
// contact (WSPANL) fires only when the pilot is on the field's wall SIDE, within a
// vertical band about the field's height, AND within the field's first half of depth —
// then it GRAZES: glow + crash sound + roll, costing NO shield (the shield accounting
// rides WSGLOW, score-shields scope). In our frame lateral = eye x, height = eye y,
// depth = the obstacle z. A field is mounted on the LEFT wall when its x < 0, the RIGHT
// when x > 0; the graze fires for a same-side pilot only, so the dodge is the opposite
// wall or a different height slot.

/** Half-height of a force field's vertical hit band about its seated height. ROM: `$200`
 *  — the hit spans `[M.Z0 − $200, M.Z0 + $200]` (fieldTop = M.Z0+$200, hit within `$400`
 *  below it). A pilot more than this above/below the field's height flies clear of it. */
export const FORCE_FIELD_BAND_HALF = 0x200 // 512

/** How near (in −z) a force field must scroll before its graze can fire — the ROM's "first
 *  `$400` of the field's depth" (`SUBD #400 ;HALF OF FF DEPTH, MORE THAN MAX SPEED`). Wide
 *  enough to catch the field on the frame it crosses the cockpit at the ROM scroll speed
 *  (B-008), so a field can't leap the plane between two frames un-grazed. */
export const FORCE_FIELD_DEPTH = 0x400 // 1024

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
