// src/shell/render.ts
//
// Paints the core's 3D state as glowing vector lines on black — the shared
// arcade visual language. The shell owns the canvas; the core owns the math.
// World-space entities run through the Math Box (perspective projection), then
// their edges are stroked with `shadowBlur` for the vector-CRT glow. The shell
// does NO game math — it only consumes positions the core already computed.

import { EXHAUST_PORT_DISTANCE, type GameState } from '../core/state'
import type { HighScoreTable } from '../core/highscore'
import {
  TIE_FIGHTER,
  DEATH_STAR_SURFACE,
  SURFACE_TOWER,
  TRENCH,
  EXHAUST_PORT,
} from '../core/models'
import { crosshairNdc, FOV_Y } from '../core/gameRules'
import { perspective, add, rotationZ, IDENTITY, type Mat4, type Vec3 } from '../core/math3d'
import { project, drawWireframe, GLOW_FOR, NEAR, FAR } from './wireframe'

const GLOW = '#00e5ff' // cockpit cyan
const TIE_GLOW = GLOW_FOR['TIE Fighter'] // enemy red (shared)
const TURRET_GLOW = GLOW_FOR['Surface Tower'] // surface turret red (shared)
const SURFACE_GLOW = GLOW_FOR['Death Star Surface'] // death star steel (shared)
const BOLT_GLOW = '#9dff00' // player laser green
const FIRE_GLOW = '#ffd60a' // enemy fireball amber

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

// The camera skims just above the trench floor; both the floor and the exhaust
// port are positioned from SIM STATE (see `trenchPlacement`), not static
// constants, so the port scrolls up the channel and always sits inside it.
const TRENCH_SKIM = 60
const SKIM_OFFSET: Vec3 = [0, -TRENCH_SKIM, 0] // lower the world so the camera rides above the floor
const PORT_GLOW = GLOW_FOR['Exhaust Port'] // exhaust-port target amber (shared)

/**
 * Where the shell draws the trench floor and the exhaust port — derived PURELY
 * from sim state, honouring the core/shell boundary: the core owns the port's
 * world position (`state.exhaustPort.pos`), the shell only consumes it. The
 * floor channel follows the port up the run so the port always sits inside it
 * (closing the ~244-unit float of the old static placement); with no active port
 * it rests at the spawn distance. The display skim (camera height) is applied by
 * the caller, so `port` here is the verbatim sim position.
 */
export function trenchPlacement(state: GameState): { floor: Vec3; port: Vec3 } {
  const port: Vec3 = state.exhaustPort?.pos ?? [0, 0, -EXHAUST_PORT_DISTANCE]
  return { floor: [0, 0, port[2]], port }
}

// The shared arcade vector face (loaded by shell/font.ts), with the same
// 'Orbitron', monospace fallback chain tempest uses so the HUD reads even before
// the web font lands.
const HUD_FONT = "700 18px 'Vector Battle', 'Orbitron', monospace"
const BANNER_FONT = "900 48px 'Vector Battle', 'Orbitron', monospace"
const TITLE_FONT = "900 64px 'Vector Battle', 'Orbitron', monospace"

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number,
  highScores: HighScoreTable = [],
): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)

  const proj = perspective(FOV_Y, w / h, NEAR, FAR)

  if (state.phase === 'surface') {
    // The floor drops away as the ship climbs, so the surface tracks altitude.
    const floor: Vec3 = [0, -state.altitude, 0]
    drawWireframe(ctx, DEATH_STAR_SURFACE, floor, proj, w, h, SURFACE_GLOW, SURFACE_ORIENT)
    for (const tu of state.turrets) {
      // Turrets STAND on the surface, so they live in the floor's altitude frame:
      // drop them by the skim height exactly as the floor is. Drawing them at the
      // sim's world y=0 (the surface plane in core space) left them floating above
      // the floor as the ship climbed — the 8-4 placement this story reconciles.
      const base: Vec3 = [tu.pos[0], tu.pos[1] - state.altitude, tu.pos[2]]
      drawWireframe(ctx, SURFACE_TOWER, base, proj, w, h, TURRET_GLOW, TOWER_ORIENT)
    }
  } else if (state.phase === 'trench') {
    // Wave 3 — the trench run. Floor channel and the exhaust port both come from
    // sim state, so the port scrolls up the channel and stays seated in it; the
    // camera skims just above the floor (SKIM_OFFSET).
    const { floor, port } = trenchPlacement(state)
    drawWireframe(ctx, TRENCH, add(floor, SKIM_OFFSET), proj, w, h, SURFACE_GLOW, TRENCH_ORIENT)
    if (state.exhaustPort) {
      drawWireframe(ctx, EXHAUST_PORT, add(port, SKIM_OFFSET), proj, w, h, PORT_GLOW, TRENCH_ORIENT)
    }
  } else {
    for (const e of state.enemies) drawWireframe(ctx, TIE_FIGHTER, e.pos, proj, w, h, TIE_GLOW)
  }
  for (const p of state.projectiles) drawSpark(ctx, p.pos, proj, w, h, BOLT_GLOW, 4)
  for (const s of state.enemyShots) drawSpark(ctx, s.pos, proj, w, h, FIRE_GLOW, 6)

  // The framing layer (story 8-6): the playing HUD during a run, the attract/title
  // screen at idle, the game-over board after. The 3D scene above renders behind
  // all of them (an empty starfield on the framing screens).
  if (state.mode === 'attract') {
    drawAttract(ctx, highScores, w, h)
  } else if (state.mode === 'gameover') {
    drawGameOver(ctx, state, highScores, w, h)
  } else {
    drawCrosshair(ctx, state, w, h)
    drawHud(ctx, state, w, h)
  }
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
  // Match project()'s NDC→screen mapping (which flips Y for the canvas), so the
  // reticle sits exactly where a target at the same NDC is drawn: +aimY → top.
  const cy = (-ny * 0.5 + 0.5) * h
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

/** In-run HUD: shields (left), the wave indicator (centre), score (right). */
function drawHud(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.textBaseline = 'alphabetic'
  ctx.font = HUD_FONT

  ctx.textAlign = 'left'
  glowText(ctx, `SHIELDS ${state.lives}`, 24, 36, GLOW, 10)

  ctx.textAlign = 'center'
  glowText(ctx, `WAVE ${state.wave}`, w / 2, 36, GLOW, 10)

  ctx.textAlign = 'right'
  glowText(ctx, `SCORE ${state.score}`, w - 24, 36, GLOW, 10)

  // Reset shared text state so nothing leaks into the next frame.
  ctx.textAlign = 'left'
  ctx.letterSpacing = '0px'
  ctx.shadowBlur = 0
}

/** The attract/title screen: the marquee, a start prompt, and the high-score board. */
function drawAttract(
  ctx: CanvasRenderingContext2D,
  highScores: HighScoreTable,
  w: number,
  h: number,
): void {
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'

  ctx.font = TITLE_FONT
  glowText(ctx, 'STAR WARS', w / 2, h * 0.26, GLOW, 28)

  ctx.font = HUD_FONT
  glowText(ctx, 'PRESS START', w / 2, h * 0.38, BOLT_GLOW, 12)

  drawHighScoreBoard(ctx, highScores, w, h)

  ctx.textAlign = 'left'
  ctx.letterSpacing = '0px'
  ctx.shadowBlur = 0
}

/** The game-over screen: the banner, the run's final score, and the board. */
function drawGameOver(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  highScores: HighScoreTable,
  w: number,
  h: number,
): void {
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'

  ctx.font = BANNER_FONT
  glowText(ctx, 'GAME OVER', w / 2, h * 0.24, TIE_GLOW, 24)

  ctx.font = HUD_FONT
  glowText(ctx, `SCORE ${state.score}`, w / 2, h * 0.33, GLOW, 12)
  glowText(ctx, 'PRESS START', w / 2, h * 0.39, BOLT_GLOW, 12)

  drawHighScoreBoard(ctx, highScores, w, h)

  ctx.textAlign = 'left'
  ctx.letterSpacing = '0px'
  ctx.shadowBlur = 0
}

/** The local high-score ladder (descending), shared by the framing screens. */
function drawHighScoreBoard(
  ctx: CanvasRenderingContext2D,
  highScores: HighScoreTable,
  w: number,
  h: number,
): void {
  ctx.textAlign = 'center'
  ctx.font = HUD_FONT
  glowText(ctx, 'HIGH SCORES', w / 2, h * 0.5, GLOW, 10)

  let y = h * 0.5 + 30
  if (highScores.length === 0) {
    glowText(ctx, 'NO SCORES YET', w / 2, y, GLOW, 6)
    return
  }
  for (let i = 0; i < highScores.length; i++) {
    const e = highScores[i]
    const rank = String(i + 1).padStart(2, ' ')
    const pts = String(e.score).padStart(6, ' ')
    glowText(ctx, `${rank}  ${e.name}  ${pts}  WAVE ${e.wave}`, w / 2, y, GLOW, 6)
    y += 24
  }
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
