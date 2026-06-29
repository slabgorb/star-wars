// src/shell/wireframe.ts
//
// Shared wireframe draw routine + per-model glow config, extracted from
// render.ts so the in-game renderer AND the model contact sheet
// (tools/contactSheet.ts) stroke geometry through the SAME code — the preview
// can never drift from how a model actually reads in play.
//
// Render/shell-only (touches a canvas context). The pure core never imports it.

import type { Model3D } from '../core/models'
import { transform, type Mat4, type Vec3 } from '../core/math3d'

// Camera clip planes — shared by project() and any perspective() the caller builds.
// FAR encompasses the farthest spawn: TIEs now appear at TIE_SPAWN_DISTANCE (5000,
// story 9-7), so the far plane sits beyond that + the model's extent. (There is no
// far-plane cull today — only x/y are painted — but the frustum should still
// contain the scene for any future depth work.)
export const NEAR = 1
export const FAR = 6000

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
 * Carry a model's edges through `modelView` into eye space, near-plane-clip them,
 * project, and stroke them with the vector-CRT glow. `modelView` is the composed
 * `view × model` matrix (the V·M of `MVP = projection × view × model`): it places
 * the model in the world via its model matrix `translation ∘ rotation ∘ scale`
 * and then into eye space via the camera's view matrix, so each vertex lands in
 * the camera frame the near-plane clip and `proj` expect.
 */
export function drawWireframe(
  ctx: CanvasRenderingContext2D,
  m: Model3D,
  modelView: Mat4,
  proj: Mat4,
  w: number,
  h: number,
  color: string,
): void {
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.beginPath()
  for (const [a, b] of m.edges) {
    const ea = transform(modelView, m.vertices[a])
    const eb = transform(modelView, m.vertices[b])
    // In EYE space (post-view) a vertex is in front of (or on) the near plane when
    // its Z <= -NEAR; a larger Z is too close / behind the cockpit and is clipped.
    const aFront = ea[2] <= NEAR_Z
    const bFront = eb[2] <= NEAR_Z
    if (!aFront && !bFront) continue // whole edge is behind the near plane — drop it
    // Clip each behind-plane endpoint to the crossing instead of dropping the edge.
    const sa = toScreen(aFront ? ea : clipToNear(ea, eb), proj, w, h)
    const sb = toScreen(bFront ? eb : clipToNear(eb, ea), proj, w, h)
    ctx.moveTo(sa[0], sa[1])
    ctx.lineTo(sb[0], sb[1])
  }
  ctx.stroke()
  ctx.shadowBlur = 0
}
