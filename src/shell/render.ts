// src/shell/render.ts
//
// Paints the core's 3D state as glowing vector lines on black — the shared
// arcade visual language. The shell owns the canvas; the core owns the math.
// World-space entities run through the Math Box (perspective projection), then
// their edges are stroked with `shadowBlur` for the vector-CRT glow. The shell
// does NO game math — it only consumes positions the core already computed.

import type { GameState } from '../core/state'
import { TIE_FIGHTER, type Model3D } from '../core/models'
import { crosshairNdc } from '../core/gameRules'
import { perspective, transform, add, type Mat4, type Vec3 } from '../core/math3d'

const GLOW = '#00e5ff' // cockpit cyan
const TIE_GLOW = '#ff3b30' // enemy red
const BOLT_GLOW = '#9dff00' // player laser green
const FIRE_GLOW = '#ffd60a' // enemy fireball amber
const NEAR = 1
const FAR = 5000

// The shared arcade vector face (loaded by shell/font.ts), with the same
// 'Orbitron', monospace fallback chain tempest uses so the HUD reads even before
// the web font lands.
const HUD_FONT = "700 18px 'Vector Battle', 'Orbitron', monospace"
const BANNER_FONT = "900 48px 'Vector Battle', 'Orbitron', monospace"

export function render(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)

  const proj = perspective(Math.PI / 3, w / h, NEAR, FAR)

  for (const e of state.enemies) drawModelAt(ctx, TIE_FIGHTER, e.pos, proj, w, h, TIE_GLOW)
  for (const p of state.projectiles) drawSpark(ctx, p.pos, proj, w, h, BOLT_GLOW, 4)
  for (const s of state.enemyShots) drawSpark(ctx, s.pos, proj, w, h, FIRE_GLOW, 6)

  drawCrosshair(ctx, state, w, h)
  drawHud(ctx, state, w, h)
}

/** Project a world point to screen pixels, or null if it is behind the camera. */
function project(p: Vec3, proj: Mat4, w: number, h: number): [number, number] | null {
  if (p[2] >= -NEAR) return null // at or behind the cockpit
  const ndc = transform(proj, p)
  return [(ndc[0] * 0.5 + 0.5) * w, (-ndc[1] * 0.5 + 0.5) * h]
}

function drawModelAt(
  ctx: CanvasRenderingContext2D,
  m: Model3D,
  pos: Vec3,
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
    const pa = project(add(m.vertices[a], pos), proj, w, h)
    const pb = project(add(m.vertices[b], pos), proj, w, h)
    if (!pa || !pb) continue
    ctx.moveTo(pa[0], pa[1])
    ctx.lineTo(pb[0], pb[1])
  }
  ctx.stroke()
  ctx.shadowBlur = 0
}

/** A small glowing '+' for a bolt in flight. */
function drawSpark(
  ctx: CanvasRenderingContext2D,
  pos: Vec3,
  proj: Mat4,
  w: number,
  h: number,
  color: string,
  size: number,
): void {
  const p = project(pos, proj, w, h)
  if (!p) return
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.moveTo(p[0] - size, p[1])
  ctx.lineTo(p[0] + size, p[1])
  ctx.moveTo(p[0], p[1] - size)
  ctx.lineTo(p[0], p[1] + size)
  ctx.stroke()
  ctx.shadowBlur = 0
}

/** The cockpit reticle, tracking the yoke (core-computed via crosshairNdc). */
function drawCrosshair(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  const [nx, ny] = crosshairNdc(state.aimX, state.aimY)
  const cx = (nx * 0.5 + 0.5) * w
  const cy = (ny * 0.5 + 0.5) * h
  const r = 16
  ctx.lineWidth = 2
  ctx.strokeStyle = GLOW
  ctx.shadowColor = GLOW
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.moveTo(cx - r, cy)
  ctx.lineTo(cx - 5, cy)
  ctx.moveTo(cx + 5, cy)
  ctx.lineTo(cx + r, cy)
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx, cy - 5)
  ctx.moveTo(cx, cy + 5)
  ctx.lineTo(cx, cy + r)
  ctx.stroke()
  ctx.shadowBlur = 0
}

/** Shields, score, and the game-over banner — glowing Vector Battle text. */
function drawHud(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.textBaseline = 'alphabetic'

  ctx.font = HUD_FONT
  ctx.textAlign = 'left'
  glowText(ctx, `SHIELDS ${state.lives}`, 24, 36, GLOW, 10)

  ctx.textAlign = 'right'
  glowText(ctx, `SCORE ${state.score}`, w - 24, 36, GLOW, 10)

  if (state.gameOver) {
    ctx.font = BANNER_FONT
    ctx.textAlign = 'center'
    glowText(ctx, 'GAME OVER', w / 2, h / 2, TIE_GLOW, 24)
  }

  // Reset shared text state so nothing leaks into the next frame.
  ctx.textAlign = 'left'
  ctx.letterSpacing = '0px'
  ctx.shadowBlur = 0
}

// Glowing vector-style text (caps): a wide bloom plus a tighter inner glow under
// a crisp core, mirroring tempest's HUD so both games light their thin caps the
// same way. Respects the caller's current font and textAlign.
function glowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  blur: number,
): void {
  // ~0.1em tracking, derived from the current font's px size, for an airy
  // arcade-marquee feel that also helps the thin vector caps read.
  const px = /(\d+(?:\.\d+)?)px/.exec(ctx.font)
  ctx.letterSpacing = `${((px ? parseFloat(px[1]) : 16) * 0.1).toFixed(2)}px`
  const caps = text.toUpperCase() // Vector Battle is caps-only
  ctx.fillStyle = color
  ctx.shadowColor = color
  if (blur > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.shadowBlur = blur * 1.5
    ctx.fillText(caps, x, y)
    ctx.shadowBlur = blur * 0.8
    ctx.fillText(caps, x, y)
    ctx.restore()
  }
  ctx.shadowBlur = 0
  ctx.fillText(caps, x, y)
}
