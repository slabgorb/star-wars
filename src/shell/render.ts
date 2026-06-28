// src/shell/render.ts
//
// Paints the core's 3D state as glowing vector lines on black — the shared
// arcade visual language. The shell owns the canvas; the core owns the math.
// World-space entities run through the Math Box (perspective projection), then
// their edges are stroked with `shadowBlur` for the vector-CRT glow. The shell
// does NO game math — it only consumes positions the core already computed.

import type { GameState } from '../core/state'
import {
  TIE_FIGHTER,
  DEATH_STAR_SURFACE,
  SURFACE_TOWER,
  TRENCH,
  EXHAUST_PORT,
  type Model3D,
} from '../core/models'
import { crosshairNdc } from '../core/gameRules'
import { perspective, transform, add, rotationZ, IDENTITY, type Mat4, type Vec3 } from '../core/math3d'

const GLOW = '#00e5ff' // cockpit cyan
const TIE_GLOW = '#ff3b30' // enemy red
const TURRET_GLOW = '#ff3b30' // surface turret red
const SURFACE_GLOW = '#5a6b8c' // death star steel
const BOLT_GLOW = '#9dff00' // player laser green
const FIRE_GLOW = '#ffd60a' // enemy fireball amber
const NEAR = 1
const FAR = 5000

// Display orientation per surface model (story 8-4). The authentic object-space
// axes do not match the in-game view, so each model is rotated into place before
// it is drawn (the vertex data in core/models.ts stays untouched).
//
//   SURFACE — the cross-sections stand in the X/Y plane in object space; a -90°
//   roll about Z lays them down so the relief rises in +Y from the y=0 floor.
//   TOWER   — already authored upright (base in y=0, structure climbing +Y), so
//   it needs no reorientation.
//   TRENCH  — the floor squares, catwalk rails, and exhaust port are authored flat
//   in the y=0 plane, so like the tower they need no reorientation; the camera
//   skims just above the floor (story 8-5).
//
// NOTE: structural tests can't catch orientation/scale — these MUST be eyeballed
// in the dev server once the surface phase is reachable in play.
export const SURFACE_ORIENT: Mat4 = rotationZ(-Math.PI / 2)
export const TOWER_ORIENT: Mat4 = IDENTITY
export const TRENCH_ORIENT: Mat4 = IDENTITY

// Static trench-run placement for the first-render eyeball: the floor sits just
// below the skimming camera and recedes down −Z, with the exhaust port further
// along the run. Trench-run gameplay (scroll, approach, the bonus) is a follow-up
// (the core `stepTrench` is still a safe terminal hold).
const TRENCH_SKIM = 60
const TRENCH_FLOOR_Z = 700
const TRENCH_PORT_Z = 1200
const PORT_GLOW = '#ff9f0a' // exhaust-port target amber

// The shared arcade vector face (loaded by shell/font.ts), with the same
// 'Orbitron', monospace fallback chain tempest uses so the HUD reads even before
// the web font lands.
const HUD_FONT = "700 18px 'Vector Battle', 'Orbitron', monospace"
const BANNER_FONT = "900 48px 'Vector Battle', 'Orbitron', monospace"

export function render(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)

  const proj = perspective(Math.PI / 3, w / h, NEAR, FAR)

  if (state.phase === 'surface') {
    // The floor drops away as the ship climbs, so the surface tracks altitude.
    const floor: Vec3 = [0, -state.altitude, 0]
    drawModelAt(ctx, DEATH_STAR_SURFACE, floor, proj, w, h, SURFACE_GLOW, SURFACE_ORIENT)
    for (const tu of state.turrets) {
      // Turrets STAND on the surface, so they live in the floor's altitude frame:
      // drop them by the skim height exactly as the floor is. Drawing them at the
      // sim's world y=0 (the surface plane in core space) left them floating above
      // the floor as the ship climbed — the 8-4 placement this story reconciles.
      const base: Vec3 = [tu.pos[0], tu.pos[1] - state.altitude, tu.pos[2]]
      drawModelAt(ctx, SURFACE_TOWER, base, proj, w, h, TURRET_GLOW, TOWER_ORIENT)
    }
  } else if (state.phase === 'trench') {
    // Wave 3 — the trench run. Floor + catwalk rails ahead and below the skimming
    // camera; the exhaust port (the run's target) sits further down the channel.
    const floor: Vec3 = [0, -TRENCH_SKIM, -TRENCH_FLOOR_Z]
    drawModelAt(ctx, TRENCH, floor, proj, w, h, SURFACE_GLOW, TRENCH_ORIENT)
    const port: Vec3 = [0, -TRENCH_SKIM, -TRENCH_PORT_Z]
    drawModelAt(ctx, EXHAUST_PORT, port, proj, w, h, PORT_GLOW, TRENCH_ORIENT)
  } else {
    for (const e of state.enemies) drawModelAt(ctx, TIE_FIGHTER, e.pos, proj, w, h, TIE_GLOW)
  }
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
  orient: Mat4 = IDENTITY,
): void {
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.beginPath()
  for (const [a, b] of m.edges) {
    // Orient the model into the view, then place it at its world position.
    const pa = project(add(transform(orient, m.vertices[a]), pos), proj, w, h)
    const pb = project(add(transform(orient, m.vertices[b]), pos), proj, w, h)
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
