// src/core/trench-detail.ts
//
// Fidelity epic — recessed panel/window detail on the trench walls, the surface
// texture the bare 11-6 rail-and-rib cage lacks (see the arcade reference:
// docs/star-wars-1983-source-findings.md ## Trench geometry & limits).
// PURE core, mirrors trench-channel.ts: deterministic, no DOM/time/random. A
// SEPARATE Model3D from trenchChannel so the 11-6 full-height-rung contract
// stays intact; the shell strokes both with the same glow.

import type { Vec3 } from '@arcade/shared/math3d'
import type { Model3D } from './models'
import { TRENCH_HALF_W, TRENCH_WALL_H, TRENCH_FAR } from './trench-channel'

// True-up (docs/star-wars-1983-source-findings.md ## Trench geometry & limits):
// no fixed panel/window grid is pinned in the ROM. The wall's actual detail is
// the PRNG-picked `off_7CC0` → `off_7Bxx` per-section shape script — procedural
// catwalk/turret shape blobs of varying size, not uniform rectangles — so there
// is no single (width, height, spacing) to true these constants against. Kept
// provisional; logged in ## Open follow-ups for a future full geometry pass.

// sw5-6: the two VERTICAL constants are re-anchored to the pinned TRENCH_WALL_H. They were
// absolute (80 / 120) against the old 320-tall wall; left alone against the ROM's 4096-deep
// trench they would paint a thin strip of detail along the wall's foot and leave four
// thousand units of it bare — the exact "bare cage" defect story 11-6 was written to
// remove. They keep the proportions of the wall they always had (1/4 up, 3/8 tall, so the
// band still tops out at 5/8 of the wall). Still PROVISIONAL: there is no ROM grid to pin
// them to, so this re-anchors them rather than pretending to pin them.

/** Panel spacing down −Z — also the detail's scroll-recycle period. */
export const PANEL_Z = 800 // PROVISIONAL(findings ## Trench geometry & limits) — not pinned, see Open follow-ups
/** Panel width along Z — the recessed window rectangle's downrange extent. */
export const PANEL_W = 240 // PROVISIONAL(findings ## Trench geometry & limits) — not pinned, see Open follow-ups
/** Panel height along Y — 3/8 of the wall, as on the old 320 wall. */
export const PANEL_H = (TRENCH_WALL_H * 3) / 8 // 1536 — PROVISIONAL: re-anchored, not pinned
/** Panel bottom edge's height above the floor — 1/4 of the wall, as on the old 320 wall. */
export const PANEL_INSET_Y = TRENCH_WALL_H / 4 // 1024 — PROVISIONAL: re-anchored, not pinned

/** Rectangular wall panels at each PANEL_Z station on BOTH walls, scrolled
 *  toward the cockpit by `scroll` (same modulo idiom as trenchChannel). */
export function trenchWallDetail(scroll: number): Model3D {
  const vertices: Vec3[] = []
  const edges: [number, number][] = []
  const offset = ((scroll % PANEL_Z) + PANEL_Z) % PANEL_Z
  const count = Math.round(TRENCH_FAR / PANEL_Z)
  const y0 = PANEL_INSET_Y
  const y1 = Math.min(PANEL_INSET_Y + PANEL_H, TRENCH_WALL_H - 1)
  for (let k = 0; k <= count; k++) {
    const zNear = -k * PANEL_Z + offset
    const zFar = zNear - PANEL_W
    for (const x of [-TRENCH_HALF_W, TRENCH_HALF_W]) {
      const a = vertices.push([x, y0, zNear]) - 1
      const b = vertices.push([x, y1, zNear]) - 1
      const c = vertices.push([x, y1, zFar]) - 1
      const d = vertices.push([x, y0, zFar]) - 1
      edges.push([a, b], [b, c], [c, d], [d, a])
    }
  }
  return { name: 'Trench Wall Detail', vertices, edges }
}
