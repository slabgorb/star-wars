// src/shell/render.ts
//
// Paints the core's 3D state as glowing vector lines on black — the shared
// arcade visual language. The shell owns the canvas; the core owns the math.
// World-space entities run through the Math Box (perspective projection), then
// their edges are stroked with `shadowBlur` for the vector-CRT glow. The shell
// does NO game math — it only consumes positions the core already computed.

import { EXHAUST_PORT_DISTANCE, PROJECTILE_TTL, SPAWN_DISTANCE, type GameState } from '../core/state'
import type { HighScoreTable } from '../core/highscore'
import {
  TIE_FIGHTER,
  DEATH_STAR_SURFACE,
  SURFACE_TOWER,
  TRENCH,
  EXHAUST_PORT,
} from '../core/models'
import { crosshairNdc, FOV_Y } from '../core/gameRules'
import { perspective, add, multiply, rotationZ, IDENTITY, type Mat4, type Vec3 } from '../core/math3d'
import { project, drawWireframe, GLOW_FOR, NEAR, FAR } from './wireframe'

const GLOW = '#00e5ff' // cockpit cyan
const TIE_GLOW = GLOW_FOR['TIE Fighter'] // enemy red (shared)
const TURRET_GLOW = GLOW_FOR['Surface Tower'] // surface turret red (shared)
const SURFACE_GLOW = GLOW_FOR['Death Star Surface'] // death star steel (shared)
const BOLT_GLOW = '#9dff00' // player laser green
const FIRE_GLOW = '#ffd60a' // enemy fireball amber

// How long after a bolt is fired its cannon-tip laser beams stay lit — a brief
// muzzle flash ("pew"), not a line trailing the bolt for its whole flight.
const LASER_FLASH_SECONDS = 0.12

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

// TIE display correction (story 8-13). The authentic model stacks its two
// hexagonal solar panels along the object-space Y axis (panels at y=±208, lying
// flat in X/Z) — a TIE on its side. A +90° roll about Z stands them upright so
// they sit left/right of the cockpit pod, with the model's depth axis on +Z.
// This FIXED correction is composed with each enemy's DYNAMIC look-at-cockpit
// `orient` (computed in core) so the upright TIE then banks at the player.
//
// NOTE: like the surface orients, the exact correction escapes structural tests
// (the render guard only asserts `orient` is APPLIED) and MUST be eyeballed in
// the dev server (port 5274) — confirm the panels read upright and the ship
// faces the cockpit before sign-off.
export const TIE_ORIENT: Mat4 = rotationZ(Math.PI / 2)

// The camera skims just above the trench floor; both the floor and the exhaust
// port are positioned from SIM STATE (see `trenchPlacement`), not static
// constants, so the port scrolls up the channel and always sits inside it.
const TRENCH_SKIM = 60
const SKIM_OFFSET: Vec3 = [0, -TRENCH_SKIM, 0] // lower the world so the camera rides above the floor
const PORT_GLOW = GLOW_FOR['Exhaust Port'] // exhaust-port target amber (shared)

// Where the shell seats the Death Star surface in Z (story 8-11). The relief is
// DEEP (object Z spans ~ -3840..+6720) and SURFACE_ORIENT only ROLLS it about Z,
// so its near end stays at +6720 in world Z. Drawn at Z=0 (the old bug) that near
// end fell BEHIND the cockpit and was clipped by the near plane, leaving the
// floor invisible while only a far speck survived ahead of the turrets. We shift
// the whole relief forward so its near ring sits just inside the turret band
// (turrets spawn at -SPAWN_DISTANCE and scroll in) and the rest recedes ahead to
// the horizon — derived from the model so it tracks the geometry, not a literal.
const SURFACE_NEAR_EXTENT = Math.max(...DEATH_STAR_SURFACE.vertices.map((v) => v[2]))
const Z_SURFACE_PLACEMENT = SURFACE_NEAR_EXTENT + SPAWN_DISTANCE / 2

/**
 * Where the shell draws the Death Star surface floor — derived PURELY from sim
 * state, mirroring `trenchPlacement` and honouring the core/shell boundary. The
 * floor tracks the ship's altitude in Y (it drops away as the ship climbs) and
 * sits a fixed distance ahead in Z so the relief reads as a skimmable floor in
 * front of the cockpit instead of straddling it at the origin (the 8-11 bug).
 */
export function surfacePlacement(state: GameState): { floor: Vec3 } {
  return { floor: [0, -state.altitude, -Z_SURFACE_PLACEMENT] }
}

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
    // The floor drops away as the ship climbs (Y) and sits ahead of the cockpit
    // (Z) so the relief actually reads — both come from surfacePlacement (8-11).
    const { floor } = surfacePlacement(state)
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
    // Each TIE banks at the player: its per-enemy look-at `orient` (core) turned
    // upright by the fixed TIE_ORIENT display correction (display first, then
    // look => multiply(orient, TIE_ORIENT)).
    for (const e of state.enemies)
      drawWireframe(ctx, TIE_FIGHTER, e.pos, proj, w, h, TIE_GLOW, multiply(e.orient, TIE_ORIENT))
  }
  // The player laser is a brief "pew" flash from the cannon tips at the moment of
  // firing — NOT a line that trails the bolt for its whole 2s flight (that builds
  // a static cyan web under rapid fire). Draw it only for freshly-fired bolts, and
  // only during an active run so it never bleeds onto the attract/game-over screens
  // (the sim freezes in-flight bolts there).
  if (state.mode === 'playing') {
    for (const p of state.projectiles)
      if (PROJECTILE_TTL - p.ttl <= LASER_FLASH_SECONDS) drawPlayerLaser(ctx, p.pos, proj, w, h)
  }
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

/**
 * The player's shot as cabinet-style converging laser beams — the "pew pew".
 * Four cyan lines fire from the cannon tips at the screen corners and meet at the
 * bolt's projected position, replacing the old '+' spark placeholder. The cannon
 * tips are a fixed SCREEN-space frame (the cockpit guns), so they don't move with
 * the 3D camera; only the convergence point (the projected bolt) tracks the shot.
 * Off-screen/behind-camera bolts (no projection) simply draw nothing.
 */
function drawPlayerLaser(
  ctx: CanvasRenderingContext2D,
  pos: Vec3,
  proj: Mat4,
  w: number,
  h: number,
): void {
  const tip = project(pos, proj, w, h)
  if (!tip) return
  const cannons: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ]
  ctx.lineWidth = 2
  ctx.strokeStyle = GLOW
  ctx.shadowColor = GLOW
  ctx.shadowBlur = 12
  ctx.beginPath()
  for (const [cx, cy] of cannons) {
    ctx.moveTo(cx, cy)
    ctx.lineTo(tip[0], tip[1])
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
