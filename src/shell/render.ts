// src/shell/render.ts
//
// Paints the core's 3D state as glowing vector lines on black — the shared
// arcade visual language. The shell owns the canvas; the core owns the math.
// World-space entities run through the Math Box (perspective projection), then
// their edges are stroked with `shadowBlur` for the vector-CRT glow. The shell
// does NO game math — it only consumes positions the core already computed.

import {
  EXHAUST_PORT_DISTANCE,
  PROJECTILE_TTL,
  ENEMY_SHOT_TTL,
  SPAWN_DISTANCE,
  SPACE_WAVE_QUOTA,
  STARTING_LIVES,
  PORT_AHEAD_RANGE,
  FORCE_BONUS,
  type GameState,
} from '../core/state'
import type { HighScoreTable } from '../core/highscore'
import { formatScore, formatLives, formatWave } from '../core/hud'
import {
  TIE_FIGHTER,
  DEATH_STAR_SURFACE,
  DEATH_STAR,
  SURFACE_TOWER,
  EXHAUST_PORT,
  TRENCH_TURRET,
  TRENCH_SQUARE,
  TRENCH_CATWALK,
} from '../core/models'
import { surfaceGrid } from '../core/surface-grid'
import { trenchChannel } from '../core/trench-channel'
import { trenchWallDetail } from '../core/trench-detail'
import { crosshairNdc, lockedEnemy, LOCK_RADIUS_NDC, FOV_Y } from '../core/gameRules'
import {
  perspective,
  multiply,
  rotationZ,
  translation,
  scaling,
  viewMatrix,
  transform,
  IDENTITY,
  type Mat4,
  type Vec3,
} from '@arcade/shared/math3d'
import { project, drawWireframe, GLOW_FOR, NEAR, FAR } from './wireframe'

const GLOW = '#00e5ff' // cockpit cyan
const TIE_GLOW = GLOW_FOR['TIE Fighter'] // enemy green (shared)
const TURRET_GLOW = GLOW_FOR['Surface Tower'] // surface turret red (shared)
const SURFACE_GLOW = GLOW_FOR['Death Star Surface'] // death star steel (shared)
const DEATH_STAR_GLOW = GLOW_FOR['Death Star'] // death star body hull (shared)
const BOLT_GLOW = '#9dff00' // player laser green
const FIRE_GLOW = '#ffd60a' // enemy fireball amber

/**
 * Trench wireframe glow (fidelity epic, task 5) — findings ## Colors &
 * intensities: every trench-pass opcode (`$6270` floor side A, `$6250` floor
 * side B, `$6260` wall walk, `$6280` exhaust-port-adjacent pass) shares STAT
 * colour register 2 at varying intensity — "the trench reads green in the
 * cabinet." Replaces `SURFACE_GLOW` (death star steel) on the trench channel
 * + wall-detail strokes ONLY; the surface phase keeps SURFACE_GLOW. The
 * register is pinned by the opcodes above; a real cabinet screenshot (task-5
 * report) confirms the hue directly (a saturated, no-blue green, sampled
 * ~#00e600/#1cdd00 off the HUD's own green text and the shield gauge) — the
 * value below is picked to match that sample, not literally quoted from the
 * ROM (no colour LUT survives there, only the register index).
 */
const TRENCH_GLOW = '#22e600' // PROVISIONAL(findings ## Colors & intensities) — register pinned, hex matched to a cabinet screenshot

// How long after a bolt is fired its cannon-tip laser beams stay lit — a brief
// muzzle flash ("pew"), not a line trailing the bolt for its whole flight.
const LASER_FLASH_SECONDS = 0.12

// How long a TIE's muzzle starburst stays lit after it looses a fireball — the
// enemy-fire "tell". Mirrors LASER_FLASH_SECONDS: a brief flash at the firing
// point, then gone, not a glow trailing the bolt down its whole 6s flight.
const ENEMY_MUZZLE_FLASH_SECONDS = 0.1

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

// The cockpit skims just above the trench floor. This is now the CAMERA's height
// (see `cameraView`) — the eye rides above the y=0 floor — not a world-shift
// constant. The floor and port keep their true sim-state world positions; the
// camera lifts the view, so the port still scrolls up the channel inside it.
const TRENCH_SKIM = 60
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
 * Where the shell seats the Death Star surface floor: the static forward seat in
 * Z so the relief reads as a skimmable floor ahead of the cockpit instead of
 * straddling it at the origin (the 8-11 bug). The altitude-skim framing — the
 * floor dropping away as the ship climbs — is no longer baked here; it lives in
 * the CAMERA (`cameraView`), which lifts the eye to the ship's altitude. The floor
 * keeps its true world Y = 0 (the surface plane), so it and the turrets (also at
 * y ≈ 0) share one frame and the camera lifts them together.
 */
export function surfacePlacement(): { floor: Vec3 } {
  return { floor: [0, 0, -Z_SURFACE_PLACEMENT] }
}

// Where the shell seats the Death Star BODY during the space phase (story 11-7).
// FAR sits behind the TIE spawn band (TIE_SPAWN_DISTANCE 8000) yet inside the FAR
// clip plane (wireframe.ts FAR 9000); NEAR is the closest it looms by the dive.
const DEATH_STAR_Z_FAR = -8500
const DEATH_STAR_Z_NEAR = -3500
const DEATH_STAR_SCALE_FAR = 1
const DEATH_STAR_SCALE_NEAR = 2.4

/**
 * Where the shell seats the Death Star body — derived PURELY from sim state,
 * honouring the core/shell boundary like `surfacePlacement`/`trenchPlacement`:
 * the core owns the geometry, the shell derives the seat from `state.phaseKills`.
 * As the player racks up TIE kills toward the space quota they CLOSE on the body,
 * so it slides nearer (|z| ↓) AND scales up — its apparent size grows monotonically
 * across the phase. Pure: reads state, mutates nothing; the body never enters the
 * sim, so it cannot touch determinism or TIE hit-tests.
 */
export function deathStarPlacement(state: GameState): { pos: Vec3; scale: number } {
  const p = SPACE_WAVE_QUOTA > 0 ? Math.min(1, Math.max(0, state.phaseKills / SPACE_WAVE_QUOTA)) : 0
  const z = DEATH_STAR_Z_FAR + (DEATH_STAR_Z_NEAR - DEATH_STAR_Z_FAR) * p
  const scale = DEATH_STAR_SCALE_FAR + (DEATH_STAR_SCALE_NEAR - DEATH_STAR_SCALE_FAR) * p
  return { pos: [0, 0, z], scale }
}

/**
 * The camera (view matrix) derived PURELY from sim state — the cockpit IS the
 * camera. Space looks from the origin down −Z; the surface and trench lift the eye
 * to the cockpit's skim height (the ship's altitude over the surface, a fixed skim
 * over the trench floor) so the floor reads below it. This replaces the retired
 * world-shift constants (`SKIM_OFFSET` and the per-entity altitude drops): instead
 * of shoving the world down, we raise the camera. Pure core math; the boundary holds.
 */
export function cameraView(state: GameState): Mat4 {
  if (state.phase === 'surface') return viewMatrix([0, state.altitude, 0], IDENTITY)
  if (state.phase === 'trench') return viewMatrix([0, TRENCH_SKIM, 0], IDENTITY)
  return IDENTITY // space: the camera sits at the origin looking down −Z
}

/**
 * A per-entity model matrix `translation ∘ rotation ∘ scale` — object space to
 * world. `orient` is the display rotation (it may be a composed matrix); `s` is a
 * uniform world scale (default 1). Compose with the camera as `view × model` and
 * hand the result to `drawWireframe`.
 */
export function modelMatrix(pos: Vec3, orient: Mat4 = IDENTITY, s = 1): Mat4 {
  return multiply(translation(pos[0], pos[1], pos[2]), multiply(orient, scaling(s, s, s)))
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
  // The cockpit IS the camera (story 11-2): one view matrix from sim state places
  // every model via MVP = projection × view × model, retiring the per-entity
  // world-shift glue. Space → origin; surface/trench → eye lifted to skim height.
  const view = cameraView(state)

  if (state.phase === 'surface') {
    // Story 11-5: the surface is a procedural receding ground grid (ADR 0002 part
    // A) — the DEATH_STAR_SURFACE spike was never a ground and is retired from this
    // scene (kept in the registry, re-classified). The grid is authored in world
    // space on the y=0 floor and scrolls toward the cockpit via surfaceScrollZ; the
    // camera (lifted to the ship's altitude) is the only transform.
    drawWireframe(ctx, surfaceGrid(state.surfaceScrollZ), view, proj, w, h, SURFACE_GLOW)
    for (const tu of state.turrets) {
      // Turrets stand on the surface at their TRUE world Y (≈ 0). The camera lifts
      // floor and turrets together, so they sit ON the floor as the ship climbs —
      // the per-turret altitude drop (the 8-4 reconcile) is gone, the camera owns it.
      drawWireframe(ctx, SURFACE_TOWER, multiply(view, modelMatrix(tu.pos, TOWER_ORIENT)), proj, w, h, TURRET_GLOW)
    }
  } else if (state.phase === 'trench') {
    // Story 11-6 — the trench is a procedural WALLED channel (ADR 0002 part B):
    // floor rails, lateral floor ribs, two vertical ribbed side walls, and top
    // rails, authored in world space on the y=0 floor and scrolled toward the
    // cockpit via trenchScrollZ. The flat TRENCH tile (a ~224×4px sliver) is
    // retired from this scene (kept in the registry, re-classified). The camera
    // (skimming just above the floor) is the only transform — like the surface grid.
    drawWireframe(ctx, trenchChannel(state.trenchScrollZ), view, proj, w, h, TRENCH_GLOW)
    // Fidelity epic (task 2) — recessed wall panels/windows, a SEPARATE model from
    // trenchChannel (see src/core/trench-detail.ts) so the 11-6 full-height-rung
    // contract stays intact; scrolls in lockstep with the channel.
    drawWireframe(ctx, trenchWallDetail(state.trenchScrollZ), view, proj, w, h, TRENCH_GLOW)
    // Fidelity epic (task 3) — wall turrets/squares (shootable) and catwalk
    // hazards, each riding its own sim-state world position (trenchObstacles
    // scrolls in lockstep with the channel/port in stepTrench).
    for (const o of state.trenchObstacles) {
      const model =
        o.kind === 'turret' ? TRENCH_TURRET : o.kind === 'square' ? TRENCH_SQUARE : TRENCH_CATWALK
      drawWireframe(ctx, model, multiply(view, modelMatrix(o.pos, TRENCH_ORIENT)), proj, w, h, TURRET_GLOW)
    }
    // The exhaust port still rides up the channel at its true sim world position.
    const { port } = trenchPlacement(state)
    if (state.exhaustPort) {
      drawWireframe(ctx, EXHAUST_PORT, multiply(view, modelMatrix(port, TRENCH_ORIENT)), proj, w, h, PORT_GLOW)
    }
  } else {
    // Wave 1 — the space phase. The Death Star body looms far down −Z and grows as
    // the player closes on it (deathStarPlacement). Draw it FIRST so it sits BEHIND
    // the TIEs (painter's order) and never intrudes on a fighter's hit-test.
    const body = deathStarPlacement(state)
    drawWireframe(ctx, DEATH_STAR, multiply(view, modelMatrix(body.pos, IDENTITY, body.scale)), proj, w, h, DEATH_STAR_GLOW)
    // Each TIE banks at the player: its per-enemy look-at `orient` (core) turned
    // upright by the fixed TIE_ORIENT display correction (display first, then look
    // => multiply(orient, TIE_ORIENT)), placed in the world by its model matrix.
    for (const e of state.enemies)
      drawWireframe(ctx, TIE_FIGHTER, multiply(view, modelMatrix(e.pos, multiply(e.orient, TIE_ORIENT))), proj, w, h, TIE_GLOW)
  }
  // The player laser is a brief "pew" flash from the cannon tips at the moment of
  // firing — NOT a line that trails the bolt for its whole 2s flight (that builds
  // a static cyan web under rapid fire). Draw it only for freshly-fired bolts, and
  // only during an active run so it never bleeds onto the attract/game-over screens
  // (the sim freezes in-flight bolts there).
  if (state.mode === 'playing') {
    for (const p of state.projectiles)
      if (PROJECTILE_TTL - p.ttl <= LASER_FLASH_SECONDS)
        drawPlayerLaser(ctx, transform(view, p.pos), proj, w, h)
    // A TIE's muzzle starburst at the instant of firing — the enemy-fire tell.
    // Like the player laser it is derived purely from elapsed flight vs TTL (no
    // shell-side effect state) and gated to a live run, so a fireball frozen by
    // the sim on the framing screens can't keep flashing. `life` fades 1 → 0
    // across the brief window so the burst shrinks out instead of popping off.
    for (const s of state.enemyShots) {
      const elapsed = ENEMY_SHOT_TTL - s.ttl
      if (elapsed <= ENEMY_MUZZLE_FLASH_SECONDS)
        drawMuzzleFlash(ctx, transform(view, s.pos), 1 - elapsed / ENEMY_MUZZLE_FLASH_SECONDS, proj, w, h)
    }
  }
  // Bolts and fireballs ride the same camera as the models (transform through the
  // view), so they stay seated in the scene when the eye is lifted (surface/trench).
  for (const s of state.enemyShots) drawSpark(ctx, transform(view, s.pos), proj, w, h, FIRE_GLOW, 6)

  // The framing layer (story 8-6): the playing HUD during a run, the attract/title
  // screen at idle, the game-over board after. The 3D scene above renders behind
  // all of them (an empty starfield on the framing screens).
  if (state.mode === 'attract') {
    drawAttract(ctx, highScores, w, h)
  } else if (state.mode === 'gameover') {
    drawGameOver(ctx, state, highScores, w, h)
  } else {
    // The green lock-on ring sits UNDER the cyan reticle so the crosshair always
    // reads on top of it; both composite over the 3D scene (drawn above).
    drawLockOn(ctx, state, proj, w, h)
    drawCrosshair(ctx, state, w, h)
    drawHudHeader(ctx, state, w, h)
    drawTrenchBanners(ctx, state, w, h)
  }
}

/**
 * The green lock-on ring (story 8-14). The core decides WHICH enemy is under the
 * reticle — `lockedEnemy` returns the nearest TIE a shot would hit — and the shell
 * only rings it, honouring the boundary. Drawn at the target's projected screen
 * position with the lock radius scaled NDC→pixels (LOCK_RADIUS_NDC spans the NDC
 * half-height, i.e. h/2 px). Nothing is drawn when no target is locked, so the
 * ring is the player's "your next shot connects" confirmation. Naturally limited
 * to the space phase: surface/trench carry no `enemies`, so nothing locks there.
 */
function drawLockOn(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  proj: Mat4,
  w: number,
  h: number,
): void {
  const target = lockedEnemy(state, w / h)
  if (!target) return
  const c = project(target.pos, proj, w, h)
  if (!c) return
  const r = LOCK_RADIUS_NDC * (h / 2)
  ctx.lineWidth = 2
  ctx.strokeStyle = BOLT_GLOW
  ctx.shadowColor = BOLT_GLOW
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.arc(c[0], c[1], r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.shadowBlur = 0
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

// Muzzle-flash geometry: a ring of short rays fanning out from the firing point.
// Eight reads as a clean starburst; MAX_LEN is the full-brightness ray length in
// screen pixels (faded by `life`). Tuned to sit just outside the 6px fireball
// spark so the burst frames the bolt rather than hiding inside it.
const MUZZLE_RAYS = 8
const MUZZLE_MAX_LEN = 14

/**
 * A brief starburst at an enemy fireball's muzzle: `MUZZLE_RAYS` amber rays
 * radiating from the firing point, their length and glow scaled by `life`
 * (1 at the instant of firing → 0 as the flash fades) so it flares then vanishes.
 * Anchored to the bolt's projected point like the player laser; an off-screen or
 * behind-camera shot (no projection) simply draws nothing.
 */
function drawMuzzleFlash(
  ctx: CanvasRenderingContext2D,
  pos: Vec3,
  life: number,
  proj: Mat4,
  w: number,
  h: number,
): void {
  const p = project(pos, proj, w, h)
  if (!p) return
  const len = MUZZLE_MAX_LEN * life
  ctx.lineWidth = 2
  ctx.strokeStyle = FIRE_GLOW
  ctx.shadowColor = FIRE_GLOW
  ctx.shadowBlur = 12 * life
  ctx.beginPath()
  for (let i = 0; i < MUZZLE_RAYS; i++) {
    const a = (i / MUZZLE_RAYS) * Math.PI * 2
    ctx.moveTo(p[0], p[1])
    ctx.lineTo(p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len)
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

/**
 * The cockpit reticle, tracking the yoke (core-computed via crosshairNdc): a
 * centre cross for the precise aim point, framed by four cabinet chevrons at the
 * cardinals — inward-pointing arrowheads converging on the centre (story 8-14).
 * The chevrons are static screen geometry (no game logic), drawn in the same cyan
 * glow as the cross.
 */
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
  // Centre cross with a gap at the aim point.
  ctx.moveTo(cx - r, cy)
  ctx.lineTo(cx - 5, cy)
  ctx.moveTo(cx + 5, cy)
  ctx.lineTo(cx + r, cy)
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx, cy - 5)
  ctx.moveTo(cx, cy + 5)
  ctx.lineTo(cx, cy + r)
  // Four converging chevrons: each apex points inward toward the centre, set just
  // outside the cross (GAP > r) with arms of length CHEV.
  const GAP = 22
  const CHEV = 7
  // top — apex below its arms (points down)
  ctx.moveTo(cx - CHEV, cy - GAP - CHEV)
  ctx.lineTo(cx, cy - GAP)
  ctx.lineTo(cx + CHEV, cy - GAP - CHEV)
  // bottom — apex above its arms (points up)
  ctx.moveTo(cx - CHEV, cy + GAP + CHEV)
  ctx.lineTo(cx, cy + GAP)
  ctx.lineTo(cx + CHEV, cy + GAP + CHEV)
  // left — apex right of its arms (points right)
  ctx.moveTo(cx - GAP - CHEV, cy - CHEV)
  ctx.lineTo(cx - GAP, cy)
  ctx.lineTo(cx - GAP - CHEV, cy + CHEV)
  // right — apex left of its arms (points left)
  ctx.moveTo(cx + GAP + CHEV, cy - CHEV)
  ctx.lineTo(cx + GAP, cy)
  ctx.lineTo(cx + GAP + CHEV, cy + CHEV)
  ctx.stroke()
  ctx.shadowBlur = 0
}

// HUD header geometry (story 8-17; reworked fidelity epic task 5). Side inset
// and the gauge width scale with the viewport width so the header reflows
// instead of clipping; the vertical offsets are small top-anchored constants,
// the cabinet's top status strip. HUD_FRAME_BOTTOM_Y sits below the shield
// gauge's numeral + SHIELD label stack (the tallest column) so the frame
// brackets never collide with it — see the geometry note on `drawShieldMeter`.
const HUD_MARGIN_FRAC = 0.025 // side inset as a fraction of width
const HUD_ROW1_Y = 34 // SCORE label / WAVE row baseline (top row)
const HUD_ROW2_Y = 58 // SCORE value baseline (second left-column row)
const HUD_METER_Y = 42 // shield-gauge top
const HUD_METER_H = 24 // shield-gauge frame height
const HUD_FRAME_TOP_Y = 10 // top bracket line, clear above the text row
const HUD_FRAME_BOTTOM_Y = 112 // bottom bracket line, clear below the shield gauge's numeral/label

/**
 * Palette (fidelity epic, task 5) — findings ## HUD & framing / ## Colors &
 * intensities identify a single colour ($6280, STAT register 2) for the
 * SCORE panel, but that undersells it: a real cabinet screenshot (task-5
 * report has the source URLs + pixel sampling) shows the panel uses TWO
 * colours — the static "SCORE"/"WAVE" words are RED, the live digits (score,
 * wave number) are GREEN, matching the same green the shield gauge and
 * trench walls use. HUD_LABEL_COLOR/HUD_VALUE_COLOR split what the findings
 * doc described as one opcode; the register-2 green is pinned by the doc,
 * the exact hexes are matched to the screenshot sample (~#e60001 red,
 * ~#1cdd00/#00e600 green — no colour LUT survives in the ROM itself).
 */
const HUD_LABEL_COLOR = '#ff2222' // PROVISIONAL — hex matched to a cabinet screenshot; register not identified in findings
const HUD_VALUE_COLOR = '#22e600' // PROVISIONAL(findings ## HUD & framing, ## Colors & intensities) — register pinned, hex matched to a cabinet screenshot

/**
 * Shield-gauge colour — findings ## HUD & framing: `word_96B6` "Shield colour
 * table" draws a HEALTHY gauge (≥5 shields remaining — the common case at
 * STARTING_LIVES=6) in `$6280`, the same register-2 green as the score panel
 * and the trench walls (confirmed green, not red, by the same cabinet
 * screenshot — the whole gauge INCLUDING its "SHIELD" label is green, unlike
 * SCORE/WAVE's red label). The table's low-shield ramp ($6480/$6680
 * amber-ish, $6080 at empty) is real ROM behaviour this single-colour gauge
 * does not reproduce — an unimplemented nuance already tracked in Open
 * follow-ups #7.
 */
const HUD_SHIELD_COLOR = '#22e600' // PROVISIONAL(findings ## HUD & framing, ## Colors & intensities) — register pinned (healthy tier only), hex matched to a cabinet screenshot

/**
 * In-run HUD header (story 8-17; reworked fidelity epic task 5 to the arcade
 * layout): SCORE label-over-value (left), the wireframe SHIELD gauge
 * (centre), and WAVE value-then-label on one line (right) — matching a real
 * cabinet screenshot's asymmetric layout (task-5 report) — bracketed by two
 * glowing frame lines, the closest approximation this renderer has of the
 * ROM's 4-corner-dot HUD frame (findings ## HUD & framing, `sub_6112`; a true
 * corner-dot frame is tracked in Open follow-ups #7). All text is the shared
 * Vector Battle face via glowText; every value is formatted by the pure core
 * (`core/hud.ts`) so the shell only lays out what the core computed — the
 * boundary holds.
 */
function drawHudHeader(ctx: CanvasRenderingContext2D, state: GameState, w: number, _h: number): void {
  const margin = Math.round(w * HUD_MARGIN_FRAC)

  ctx.textBaseline = 'alphabetic'
  ctx.font = HUD_FONT

  // Left: SCORE label (red) over the value (green) — two short lines.
  ctx.textAlign = 'left'
  glowText(ctx, 'SCORE', margin, HUD_ROW1_Y, HUD_LABEL_COLOR, 10)
  glowText(ctx, formatScore(state.score), margin, HUD_ROW2_Y, HUD_VALUE_COLOR, 10)

  // Right: WAVE — one line, value then label, each its own colour (a real
  // cabinet screenshot shows this asymmetric layout: SCORE stacks label over
  // value, WAVE runs value-then-label on a single row). No `ctx.measureText`
  // here — render() is exercised by many shell tests against a minimal stub
  // context (see render.trench-channel.test.ts's `makeCtx`) that doesn't
  // implement it, so the label sits a fixed, eyeball-tuned gap to the right
  // of the numeral rather than one measured off the label's rendered width.
  ctx.textAlign = 'right'
  const waveLabelGap = 56 // ~width of "WAVE" at HUD_FONT + tracking, tuned by eyeball
  glowText(ctx, 'WAVE', w - margin, HUD_ROW1_Y, HUD_LABEL_COLOR, 10)
  glowText(ctx, formatWave(state.wave), w - margin - waveLabelGap, HUD_ROW1_Y, HUD_VALUE_COLOR, 10)

  // Centre: the wireframe shield gauge with its numeral + label.
  drawShieldMeter(ctx, state, w)

  // Frame: top and bottom glowing brackets spanning the inset width.
  glowLine(ctx, margin, HUD_FRAME_TOP_Y, w - margin, HUD_FRAME_TOP_Y, GLOW)
  glowLine(ctx, margin, HUD_FRAME_BOTTOM_Y, w - margin, HUD_FRAME_BOTTOM_Y, GLOW)

  // Reset shared text state so nothing leaks into the next frame.
  ctx.textAlign = 'left'
  ctx.letterSpacing = '0px'
  ctx.shadowBlur = 0
}

// How long the "Use the Force" banner stays lit after the award (fidelity epic,
// task 4). Not a ROM-recovered dwell time — findings ## HUD & framing has no
// on-screen timing for it, so this is a tuned UX choice, like LASER_FLASH_SECONDS.
const FORCE_BANNER_SECONDS = 3

/**
 * Trench banners (fidelity epic, task 4): "EXHAUST PORT AHEAD" while the port
 * is within PORT_AHEAD_RANGE, and the "Use the Force" bonus banner for a few
 * seconds after a clean port kill — both authentic HUD strings (findings
 * ## HUD & framing / Open follow-ups #7). The force banner reads
 * `state.forceBonusAwardedAt` (stamped by `stepTrench`'s port-hit path and
 * re-stamped across the wave transition by `clearRun`), so it keeps showing
 * into the next wave's space phase, not just while still in the trench.
 */
function drawTrenchBanners(ctx: CanvasRenderingContext2D, state: GameState, w: number, h: number): void {
  ctx.font = BANNER_FONT
  ctx.textAlign = 'center'
  if (
    state.phase === 'trench' &&
    state.exhaustPort &&
    -state.exhaustPort.pos[2] <= PORT_AHEAD_RANGE
  ) {
    glowText(ctx, 'EXHAUST PORT AHEAD', w / 2, h * 0.22, '#dddddd', 14)
  }
  if (state.forceBonusAwardedAt !== null && state.t - state.forceBonusAwardedAt <= FORCE_BANNER_SECONDS) {
    // "<amount> FOR USING THE FORCE" is the confirmed authentic cabinet banner
    // wording — findings ## HUD & framing / Open follow-ups #7 cites a real
    // cabinet screenshot reading "5,000 FOR USING THE FORCE"
    // (docs/star-wars-1983-source-findings.md:655); the plain "USE THE FORCE"
    // string listed earlier in the same item is a shorter ROM string-table
    // fragment, not the full banner text.
    glowText(ctx, `${FORCE_BONUS.toLocaleString('en-US')} FOR USING THE FORCE`, w / 2, h * 0.16, '#dddddd', 12)
  }
  ctx.textAlign = 'left'
}

// Shield-gauge width as a fraction of the viewport — findings ## HUD & framing
// names the ROM's `word_96CA` "Shield vector table" ring graphic but gives no
// screen extent; measured directly off a real cabinet screenshot instead
// (task-5 report), where the gauge spans ~36% of the 640-wide frame, centred.
const HUD_GAUGE_FRAC = 0.36

/**
 * The centre shield gauge (fidelity epic, task 5): a wireframe trapezoid — a
 * top edge and two vertical side edges with NO bottom edge, closed instead by
 * a centre-peaked chevron running bottom-left → top-centre apex → bottom-right
 * — echoing the ROM's `word_96CA` "Shield vector table" ring graphic (findings
 * ## HUD & framing). This shape (not a row of segmented boxes) is traced
 * directly off a real cabinet screenshot (task-5 report has the source +
 * pixel measurements); findings gives the concept and colour register, the
 * screenshot gives the silhouette. `STARTING_LIVES - 1` tick marks gradate
 * the top edge like a ruler, one per shield above the first; a tick stays lit
 * only while its shield is still held, so the scale reads down as shields are
 * lost (the ROM's `sub_9558` depletion animation is real but unrecovered in
 * detail — this is our best-effort mapping of "remaining shields" onto the
 * gauge, not a traced animation). The live count and the SHIELD label sit
 * beneath, both through the pure `formatLives` (no raw shell formatting) —
 * the screenshot shows the whole gauge, numeral included, in the one green.
 *
 * Geometry note: HUD_FRAME_BOTTOM_Y is sized to clear this stack's label
 * baseline (`yBot + 34`) — grow the gauge's vertical footprint and the
 * frame's bottom bracket must move down with it.
 */
function drawShieldMeter(ctx: CanvasRenderingContext2D, state: GameState, w: number): void {
  const gaugeW = Math.round(w * HUD_GAUGE_FRAC)
  const x0 = Math.round(w / 2 - gaugeW / 2)
  const x1 = x0 + gaugeW
  const apexX = w / 2
  const yTop = HUD_METER_Y
  const yBot = yTop + HUD_METER_H
  const tickLen = 8

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = HUD_SHIELD_COLOR
  ctx.shadowColor = HUD_SHIELD_COLOR
  ctx.shadowBlur = 8
  ctx.lineWidth = 1.5
  ctx.beginPath()
  // Top edge + the two vertical sides (no bottom edge).
  ctx.moveTo(x0, yTop)
  ctx.lineTo(x1, yTop)
  ctx.moveTo(x0, yTop)
  ctx.lineTo(x0, yBot)
  ctx.moveTo(x1, yTop)
  ctx.lineTo(x1, yBot)
  // The centre chevron: bottom-left corner up to the apex (on the top edge,
  // dead centre) and back down to the bottom-right corner.
  ctx.moveTo(x0, yBot)
  ctx.lineTo(apexX, yTop)
  ctx.lineTo(x1, yBot)
  // Tick marks: one gradation per shield above the first, lit only while that
  // shield is still held.
  for (let i = 1; i < STARTING_LIVES; i++) {
    if (i >= state.lives) continue
    const tx = x0 + (gaugeW / STARTING_LIVES) * i
    ctx.moveTo(tx, yTop)
    ctx.lineTo(tx, yTop + tickLen)
  }
  ctx.stroke()
  ctx.restore()

  ctx.font = HUD_FONT
  ctx.textAlign = 'center'
  glowText(ctx, formatLives(state.lives), w / 2, yBot + 16, HUD_SHIELD_COLOR, 8)
  glowText(ctx, 'SHIELD', w / 2, yBot + 34, HUD_SHIELD_COLOR, 8)
  ctx.shadowBlur = 0
}

/** A single glowing frame line — the HUD header's top/bottom brackets. */
function glowLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 8
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.restore()
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
