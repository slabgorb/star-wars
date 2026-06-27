// src/shell/render.ts
//
// Paints the core's 3D state as glowing vector lines on black — the shared
// arcade visual language. The shell owns the canvas; the core owns the math.
// Here we run a model through the math box (model · view · projection), then
// stroke its edges with `shadowBlur` for the vector-CRT glow.

import type { GameState } from '../core/state'
import { CUBE, type Model3D } from '../core/models'
import {
  multiply,
  perspective,
  rotationX,
  rotationY,
  transform,
  translation,
  type Mat4,
} from '../core/math3d'

const GLOW = '#00e5ff'

export function render(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)

  const proj = perspective(Math.PI / 3, w / h, 0.1, 100)
  const model: Mat4 = multiply(
    translation(0, 0, -4),
    multiply(rotationY(state.t), rotationX(state.t * 0.6)),
  )
  const mvp = multiply(proj, model)

  drawModel(ctx, CUBE, mvp, w, h)
}

function drawModel(ctx: CanvasRenderingContext2D, m: Model3D, mvp: Mat4, w: number, h: number): void {
  ctx.lineWidth = 2
  ctx.strokeStyle = GLOW
  ctx.shadowColor = GLOW
  ctx.shadowBlur = 12
  ctx.beginPath()
  for (const [a, b] of m.edges) {
    const pa = transform(mvp, m.vertices[a])
    const pb = transform(mvp, m.vertices[b])
    ctx.moveTo((pa[0] * 0.5 + 0.5) * w, (-pa[1] * 0.5 + 0.5) * h)
    ctx.lineTo((pb[0] * 0.5 + 0.5) * w, (-pb[1] * 0.5 + 0.5) * h)
  }
  ctx.stroke()
  ctx.shadowBlur = 0
}
