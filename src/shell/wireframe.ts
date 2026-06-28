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
  'TIE Fighter': '#ff3b30', // enemy red
  'Darth Vader TIE': '#ff3b30', // boss TIE, enemy red
  'Death Star Surface': '#5a6b8c', // death star steel
  'Surface Tower': '#ff3b30', // surface turret red
  'Trench': '#5a6b8c', // death star steel
  'Exhaust Port': '#ff9f0a', // target amber
}

// Neutral fallback for a model not listed above.
export const DEFAULT_GLOW = '#00e5ff'

/** Project a world point to screen pixels, or null if it is behind the camera. */
export function project(p: Vec3, proj: Mat4, w: number, h: number): [number, number] | null {
  if (p[2] >= -NEAR) return null // at or behind the cockpit
  const ndc = transform(proj, p)
  return [(ndc[0] * 0.5 + 0.5) * w, (-ndc[1] * 0.5 + 0.5) * h]
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
    const pa = project(add(transform(orient, m.vertices[a]), pos), proj, w, h)
    const pb = project(add(transform(orient, m.vertices[b]), pos), proj, w, h)
    if (!pa || !pb) continue
    ctx.moveTo(pa[0], pa[1])
    ctx.lineTo(pb[0], pb[1])
  }
  ctx.stroke()
  ctx.shadowBlur = 0
}
