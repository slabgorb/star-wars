// src/shell/wireframe.ts
//
// Shared wireframe draw routine + per-model glow config, extracted from
// render.ts so the in-game renderer AND the model contact sheet
// (tools/contactSheet.ts) stroke geometry through the SAME code — the preview
// can never drift from how a model actually reads in play.
//
// Render/shell-only (touches a canvas context). The pure core never imports it.

import type { Model3D } from '../core/models'
import { transform, add, IDENTITY, type Mat4, type Vec3 } from '../core/math3d'

// Camera clip planes — shared by project() and any perspective() the caller builds.
export const NEAR = 1
export const FAR = 5000

// Per-model gameplay glow colour: the single source of truth for both the game
// renderer and the contact sheet. Keyed by Model3D.name.
export const GLOW_FOR: Record<string, string> = {
  'TIE Fighter': '#30d158', // enemy green (cabinet colour)
  'Darth Vader TIE': '#30d158', // boss TIE, enemy green (cabinet colour)
  'Death Star Surface': '#5a6b8c', // death star steel
  'Surface Tower': '#ff3b30', // surface turret red
  'Trench': '#5a6b8c', // death star steel
  'Exhaust Port': '#ff9f0a', // target amber
}

// Neutral fallback for a model not listed above.
export const DEFAULT_GLOW = '#00e5ff'

// The near plane the camera clips against, in world Z (looking down -Z).
const NEAR_Z = -NEAR

/** Map a world point to screen pixels (no visibility guard). Shared by project()
 * and the near-plane clip, which must project a cut point sitting exactly on
 * z=-NEAR — a Z that project() itself rejects. */
function toScreen(p: Vec3, proj: Mat4, w: number, h: number): [number, number] {
  const ndc = transform(proj, p)
  return [(ndc[0] * 0.5 + 0.5) * w, (-ndc[1] * 0.5 + 0.5) * h]
}

/** Lerp the segment p→q to its crossing of the near plane (z=-NEAR), pinning the
 * result's Z to the plane exactly. Assumes the segment actually crosses (one
 * endpoint in front, one behind), so q[2] !== p[2]. */
function clipToNear(p: Vec3, q: Vec3): Vec3 {
  const t = (NEAR_Z - p[2]) / (q[2] - p[2])
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, NEAR_Z]
}

/** Project a world point to screen pixels, or null if it is behind the camera. */
export function project(p: Vec3, proj: Mat4, w: number, h: number): [number, number] | null {
  if (p[2] >= -NEAR) return null // at or behind the cockpit
  return toScreen(p, proj, w, h)
}

/**
 * Orient a model, place it at `pos`, project its edges, and stroke them with the
 * vector-CRT glow. `orient` is applied to each vertex BEFORE translation, so the
 * caller may pass a composed matrix (e.g. spin ∘ display-orient ∘ recentre).
 */
export function drawWireframe(
  ctx: CanvasRenderingContext2D,
  m: Model3D,
  pos: Vec3,
  proj: Mat4,
  w: number,
  h: number,
  color: string,
  orient: Mat4 = IDENTITY,
): void {
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.beginPath()
  for (const [a, b] of m.edges) {
    const wa = add(transform(orient, m.vertices[a]), pos)
    const wb = add(transform(orient, m.vertices[b]), pos)
    // A vertex is in front of (or on) the near plane when its world Z <= -NEAR;
    // a larger Z is too close / behind the cockpit and must be clipped away.
    const aFront = wa[2] <= NEAR_Z
    const bFront = wb[2] <= NEAR_Z
    if (!aFront && !bFront) continue // whole edge is behind the near plane — drop it
    // Clip each behind-plane endpoint to the crossing instead of dropping the edge.
    const sa = toScreen(aFront ? wa : clipToNear(wa, wb), proj, w, h)
    const sb = toScreen(bFront ? wb : clipToNear(wb, wa), proj, w, h)
    ctx.moveTo(sa[0], sa[1])
    ctx.lineTo(sb[0], sb[1])
  }
  ctx.stroke()
  ctx.shadowBlur = 0
}
