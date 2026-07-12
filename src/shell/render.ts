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
  ENEMY_SHOT_HIT_RADIUS,
  SPAWN_DISTANCE,
  SPACE_WAVE_QUOTA,
  STARTING_LIVES,
  PORT_AHEAD_RANGE,
  FORCE_BONUS,
  TIE_DEATH_SECONDS,
  TIE_DEATH_SPREAD,
  type GameState,
} from '../core/state'
import type { HighScoreTable } from '@arcade/shared/highscore'
import { formatScore, formatLives, formatWave } from '../core/hud'
import {
  TIE_FIGHTER,
  TIE_WING_FRAG_1,
  TIE_WING_FRAG_2,
  TIE_WING_FRAG_3,
  DEATH_STAR_SURFACE,
  DEATH_STAR,
  SURFACE_TOWER,
  TOWER_CAP,
  SURFACE_BUNKER,
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
import { layoutText, CELL_H } from './font'
import { glowPolyline } from './glow'

const GLOW = '#00e5ff' // cockpit cyan
const TIE_GLOW = GLOW_FOR['TIE Fighter'] // enemy green (shared)
const TURRET_GLOW = GLOW_FOR['Surface Tower'] // vector red (shared) — trench turrets + bunkers
// The GDVIEW surface palette (sw3-11, WSGRND.MAC): the tower column strokes
// VGCYLW yellow, its cap/hat "SPECIAL WHITE" (VGCWHT), and lone undamaged
// bunkers VGCRED — which is exactly the shared 'Surface Tower' red above.
const TOWER_GLOW = '#ffd60a' // tower yellow column (VGCYLW; the sw2-3 cabinet yellow)
const CAP_GLOW = '#f4f4ff' // tower white cap (VGCWHT, faint vector-blue cast)
const SURFACE_GLOW = GLOW_FOR['Death Star Surface'] // death star steel (shared)
const DEATH_STAR_GLOW = GLOW_FOR['Death Star'] // death star body hull (shared)
const BOLT_GLOW = '#9dff00' // player laser green
const FIRE_GLOW = '#ffd60a' // enemy muzzle-flash amber (the firing tell)
const FIREBALL_GLOW = '#ff3b30' // enemy fireball red — VGCRED, the cabinet vector red

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
  // The trench eye rides the fixed skim PLUS the pilotable viewpoint offset (story
  // sw3-2): steering pans/dives the camera so the dodge the sim computes is what the
  // player sees. `trenchView` is a collision-world offset (z unused); added onto the
  // display skim, kept separate from it.
  if (state.phase === 'trench')
    return viewMatrix([state.trenchView[0], TRENCH_SKIM + state.trenchView[1], state.trenchView[2]], IDENTITY)
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

// HUD / framing type (SH2-5). The shared ROM stroke-vector face
// (@arcade/shared/font via ./font) replaces the retired vendored TTF; these are
// cap heights in screen px — the 24-unit glyph cell (CELL_H) scales onto each.
// The face is CAPS-ONLY; glowText uppercases defensively.
const HUD_TEXT_PX = 18
const BANNER_TEXT_PX = 48
const TITLE_TEXT_PX = 64

// Inter-glyph tracking for the thin caps-only face — it reads cramped at zero.
// glowText's old canvas tracking was 0.1em (0.1 × the font px: 1.80/4.80/6.40px
// at 18/48/64). A CONSTANT tracking in glyph-cell units (0.1 × CELL_H) reproduces
// that screen tracking at every size, because each run scales the cell by
// sizePx/CELL_H and layoutText's letterSpacing opt is in the same cell units.
const HUD_TRACKING_EM = 0.1
const GLYPH_TRACKING = HUD_TRACKING_EM * CELL_H

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number,
  highScores: HighScoreTable<'wave'> = [],
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
      // Ground objects stand on the surface at their TRUE world Y (base ≈ 0).
      // The camera lifts floor and objects together, so they sit ON the floor as
      // the ship climbs — the per-turret altitude drop (the 8-4 reconcile) is
      // gone, the camera owns it. The GDVIEW palette (sw3-11): towers are the
      // tall YELLOW column wearing the WHITE cap — the tower's gun, where its
      // fireballs erupt — and bunker-kind sites are the squat RED shorty.
      // Column and cap share the tower's placement transform.
      const towerMat = multiply(view, modelMatrix(tu.pos, TOWER_ORIENT))
      if (tu.kind === 'bunker') {
        drawWireframe(ctx, SURFACE_BUNKER, towerMat, proj, w, h, TURRET_GLOW)
      } else {
        drawWireframe(ctx, SURFACE_TOWER, towerMat, proj, w, h, TOWER_GLOW)
        drawWireframe(ctx, TOWER_CAP, towerMat, proj, w, h, CAP_GLOW)
      }
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
    // A destroyed TIE breaks into its three exploded wing fragments (story sw3-8),
    // flying apart over TIE_DEATH_SECONDS before the sim drops the cue. The split
    // direction/scale are a render-only tell (eyeball tunables), oriented like the
    // fighter (TIE_ORIENT) so the pieces read as the ship coming apart.
    for (const d of state.dyingTies) {
      const f = TIE_DEATH_SECONDS > 0 ? Math.min(1, d.age / TIE_DEATH_SECONDS) : 1
      const s = f * TIE_DEATH_SPREAD
      const at = (dx: number, dy: number, dz: number): Mat4 =>
        multiply(view, modelMatrix([d.pos[0] + dx, d.pos[1] + dy, d.pos[2] + dz], TIE_ORIENT))
      drawWireframe(ctx, TIE_WING_FRAG_1, at(-s, 0, 0), proj, w, h, TIE_GLOW)
      drawWireframe(ctx, TIE_WING_FRAG_2, at(s, 0, 0), proj, w, h, TIE_GLOW)
      drawWireframe(ctx, TIE_WING_FRAG_3, at(0, 0, s), proj, w, h, TIE_GLOW)
    }
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
    // The Death-Star explosion beat (sw2-4), derived purely from the sim stamp —
    // no shell-side effect state, like the flashes above. Screen-space and centred
    // so it plays through the warp to space the port kill triggers this frame.
    if (state.deathStarDestroyedAt !== null) {
      const boom = state.t - state.deathStarDestroyedAt
      if (boom <= DEATH_STAR_BOOM_SECONDS) drawDeathStarBoom(ctx, boom / DEATH_STAR_BOOM_SECONDS, w, h)
    }
  }
  // Bolts and fireballs ride the same camera as the models (transform through the
  // view), so they stay seated in the scene when the eye is lifted (surface/trench).
  for (const s of state.enemyShots) drawFireball(ctx, transform(view, s.pos), proj, w, h, s.ttl)

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

// The Death-Star explosion burst (sw2-4): concentric rings + a ray starburst,
// SCREEN-SPACE and centred so it survives the same-frame warp to space that a
// port kill triggers (the trench and its port are gone by the next frame, so a
// world-anchored effect would vanish instantly). `progress` runs 0 → 1 across
// DEATH_STAR_BOOM_SECONDS: the rings expand outward while the glow fades, so the
// blast flares then dissipates — the vector-arcade "it blew up" idiom.
const BOOM_RINGS = 3
const BOOM_RAYS = 16
function drawDeathStarBoom(ctx: CanvasRenderingContext2D, progress: number, w: number, h: number): void {
  const cx = w / 2
  const cy = h / 2
  const life = 1 - progress // 1 at the blast → 0 as it clears
  const maxR = Math.min(w, h) * 0.42
  ctx.strokeStyle = '#ffdd66'
  ctx.shadowColor = '#ffdd66'
  ctx.shadowBlur = 20 * life
  ctx.lineWidth = 2
  // Expanding concentric rings, each trailing the leading edge slightly.
  for (let i = 0; i < BOOM_RINGS; i++) {
    const r = maxR * progress * (1 - i * 0.22)
    if (r <= 0) continue
    ctx.globalAlpha = life * (1 - i * 0.25)
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  // A ray starburst that flares out with the leading ring.
  ctx.globalAlpha = life
  ctx.beginPath()
  const inner = maxR * 0.12
  const outer = maxR * (0.3 + 0.7 * progress)
  for (let i = 0; i < BOOM_RAYS; i++) {
    const a = (i / BOOM_RAYS) * Math.PI * 2
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer)
  }
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

// The authentic enemy fireball is a RED radial SPARKLE that FLICKERS across four
// frames with fuse-ball tips — the ROM's gunshot picture (WSVROM.MAC `.SBTTLE
// GUNSHOT PICTURES`, "GUN SHOTS -- SPARKLES WITH FUSE BALLS"). Each frame draws ~8
// spikes radiating FROM the centre (`CXY 0,0`, then `AON 0,0` → `AON dx,dy`) in the
// vector-generator red, aspect-rounded. `GNB0-3` are four DISTINCT spike tables the
// cabinet cycles as an animation; these are each frame's spike deltas (the `AON`
// after every `AON 0,0` return-to-centre), re-expressed in a nominal ±18 space and
// scaled to the projected body radius. Hand-irregular on purpose — an evenly-spaced
// asterisk reads mechanical, not like a sparkle. Story sw3-11 added the flicker +
// fuse tips that sw3-9 shipped without (it drew GNB0 alone, frozen).
const FIREBALL_FRAMES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // GNB0
  [[2, 16], [15, 8], [16, -6], [6, -10], [-6, -16], [-12, -8], [-16, 2], [-6, 8]],
  // GNB1
  [[3, 12], [16, 6], [14, -10], [0, -16], [-10, -15], [-16, -4], [-16, 6], [-6, 12]],
  // GNB2
  [[2, 12], [12, 10], [17, 2], [14, -8], [-2, -14], [-14, -12], [-18, -2], [-12, 12]],
  // GNB3
  [[3, -17], [12, -10], [17, -2], [14, 10], [-3, 14], [-14, 10], [-17, 0], [-12, -12]],
]
const FIREBALL_SPIKE_NOM = 18 // the ±nominal radius the spike deltas are authored in

// The tip fuse ball (`GNT0-3`, the `FUSE` macro → `JSRL VRGNT`): a small three-spoke
// cluster the cabinet draws AT each spike's outer tip, itself rotating across the
// four frames. Each is one frame's `AON dx,dy` spokes, authored in a nominal ±6 and
// drawn SMALL relative to the sparkle so it reads as a fuse ball at the tip, not a
// second spike.
const FIREBALL_FUSE_FRAMES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, 2], [4, -2], [-4, -2]], // GNT0
  [[-2, 0], [2, 4], [2, -4]], // GNT1
  [[0, -2], [-4, 2], [4, 2]], // GNT2
  [[2, 0], [-2, -4], [-2, 4]], // GNT3
]
const FIREBALL_FUSE_NOM = 6 // the ±nominal the fuse spokes are authored in
const FIREBALL_FUSE_SCALE = 0.22 // fuse-ball spoke length as a fraction of the sparkle radius
// The gunshot flickers through its four frames; ~0.05 s/frame reads as a live
// sparkle rather than a frozen star. The frame is derived from the shot's own age
// (ENEMY_SHOT_TTL - ttl) — deterministic, shell-side, no effect state — the same
// "elapsed vs TTL" rule the muzzle flash and player laser already use.
const FIREBALL_FRAME_SECONDS = 0.05

/**
 * An enemy fireball as the authentic RED sparkle (story sw3-9), animated across the
 * ROM's four gunshot frames with fuse-ball tips (story sw3-11). Billboarded and
 * sized in WORLD units by the same ENEMY_SHOT_HIT_RADIUS the sim uses to shoot it
 * down — what you see is what you shoot — so it projects like any 3D body (`camPos`
 * is already view-space): a near fireball swells, a distant one shrinks.
 *
 * The frame is picked from the shot's age (`ttl` in, elapsed = ENEMY_SHOT_TTL - ttl)
 * so the flicker is deterministic and lives entirely in the shell — the sim never
 * knows about it. The spikes radiate FROM the projected centre (matching the ROM's
 * GNB sparkle), so — unlike sw2-2's perimeter ring — they overlap the muzzle
 * starburst (story 9-6). The two are kept apart by COLOUR, not geometry: the
 * fireball is red (FIREBALL_GLOW / VGCRED), the muzzle flash stays amber (FIRE_GLOW).
 */
function drawFireball(
  ctx: CanvasRenderingContext2D,
  camPos: Vec3,
  proj: Mat4,
  w: number,
  h: number,
  ttl: number,
): void {
  const c = project(camPos, proj, w, h)
  if (!c) return
  // Screen radius: project a point one body-radius to the side in view space, so
  // the sparkle scales with depth under the same perspective the whole scene uses.
  const edge = project([camPos[0] + ENEMY_SHOT_HIT_RADIUS, camPos[1], camPos[2]], proj, w, h)
  if (!edge) return
  const projR = Math.hypot(edge[0] - c[0], edge[1] - c[1])
  const k = projR / FIREBALL_SPIKE_NOM
  const fuseK = (projR * FIREBALL_FUSE_SCALE) / FIREBALL_FUSE_NOM
  const frame = Math.floor(Math.max(0, ENEMY_SHOT_TTL - ttl) / FIREBALL_FRAME_SECONDS) % FIREBALL_FRAMES.length
  const spikes = FIREBALL_FRAMES[frame]
  const fuse = FIREBALL_FUSE_FRAMES[frame]
  ctx.lineWidth = 2
  ctx.strokeStyle = FIREBALL_GLOW
  ctx.shadowColor = FIREBALL_GLOW
  ctx.shadowBlur = 12
  ctx.beginPath()
  for (const [dx, dy] of spikes) {
    const tx = c[0] + dx * k
    const ty = c[1] + dy * k
    // The spike radiates FROM the projected centre outward — the mark of the sparkle
    // (a ring would lie on its perimeter with nothing at the centre).
    ctx.moveTo(c[0], c[1])
    ctx.lineTo(tx, ty)
    // Its fuse ball — a small rotating cluster AT the tip, short and off the centre.
    for (const [fx, fy] of fuse) {
      ctx.moveTo(tx, ty)
      ctx.lineTo(tx + fx * fuseK, ty + fy * fuseK)
    }
  }
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
const HUD_ROW3_Y = 80 // bonus/extra-life flash row baseline (beneath the score value)
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
// The flashing bonus/extra-life row (byte_4B2C, sw3-6) — the amber/yellow the
// cabinet screenshot shows directly under the score value. PROVISIONAL hex.
const HUD_BONUS_COLOR = '#ffcc00'

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
 * ROM stroke-vector face via glowText; every value is formatted by the pure
 * core (`core/hud.ts`) so the shell only lays out what the core computed — the
 * boundary holds.
 */
function drawHudHeader(ctx: CanvasRenderingContext2D, state: GameState, w: number, _h: number): void {
  const margin = Math.round(w * HUD_MARGIN_FRAC)

  // Left: SCORE label (red) over the value (green) — two short lines.
  glowText(ctx, 'SCORE', margin, HUD_ROW1_Y, HUD_TEXT_PX, 'left', HUD_LABEL_COLOR, 10)
  glowText(ctx, formatScore(state.score), margin, HUD_ROW2_Y, HUD_TEXT_PX, 'left', HUD_VALUE_COLOR, 10)

  // Bonus/extra-life flash row (byte_4B2C, sw3-6): while the core's `bonusFlash`
  // is live (re-armed on any score change, decaying to 0), echo the score in amber
  // directly beneath it — the cabinet's "score changed, redraw HUD" flash. Absent
  // once the flash has fully decayed.
  if (state.bonusFlash > 0) {
    glowText(ctx, formatScore(state.score), margin, HUD_ROW3_Y, HUD_TEXT_PX, 'left', HUD_BONUS_COLOR, 10)
  }

  // Right: WAVE — one line, value then label, each its own colour (a real
  // cabinet screenshot shows this asymmetric layout: SCORE stacks label over
  // value, WAVE runs value-then-label on a single row). The gap is MEASURED off
  // the label's laid-out width (layoutText is pure — no ctx.measureText needed),
  // not a fixed px constant: the old TTF-tuned 56 put the numeral inside the
  // wider stroke-face label (SH2-5 review [HIGH]). +8px of air between them.
  const waveLabelGap =
    layoutText('WAVE', { letterSpacing: GLYPH_TRACKING }).width * (HUD_TEXT_PX / CELL_H) + 8
  glowText(ctx, 'WAVE', w - margin, HUD_ROW1_Y, HUD_TEXT_PX, 'right', HUD_LABEL_COLOR, 10)
  glowText(ctx, formatWave(state.wave), w - margin - waveLabelGap, HUD_ROW1_Y, HUD_TEXT_PX, 'right', HUD_VALUE_COLOR, 10)

  // Centre: the wireframe shield gauge with its numeral + label.
  drawShieldMeter(ctx, state, w)

  // Frame: top and bottom glowing brackets spanning the inset width.
  glowLine(ctx, margin, HUD_FRAME_TOP_Y, w - margin, HUD_FRAME_TOP_Y, GLOW)
  glowLine(ctx, margin, HUD_FRAME_BOTTOM_Y, w - margin, HUD_FRAME_BOTTOM_Y, GLOW)

  // Reset shared glow state so nothing leaks into the next frame.
  ctx.shadowBlur = 0
}

// How long the "Use the Force" banner stays lit after the award (fidelity epic,
// task 4). Not a ROM-recovered dwell time — findings ## HUD & framing has no
// on-screen timing for it, so this is a tuned UX choice, like LASER_FLASH_SECONDS.
const FORCE_BANNER_SECONDS = 3

// How long the Death-Star explosion beat (flash + "DESTROYED" banner) plays after
// a port kill, and how long the "MISSED" banner shows after a slipped-past port
// (sw2-4). Tuned UX dwell times like FORCE_BANNER_SECONDS — no ROM timing exists.
const DEATH_STAR_BOOM_SECONDS = 2.5
const MISS_BANNER_SECONDS = 2

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
  if (
    state.phase === 'trench' &&
    state.exhaustPort &&
    -state.exhaustPort.pos[2] <= PORT_AHEAD_RANGE
  ) {
    glowText(ctx, 'EXHAUST PORT AHEAD', w / 2, h * 0.22, BANNER_TEXT_PX, 'center', '#dddddd', 14)
  }
  if (state.forceBonusAwardedAt !== null && state.t - state.forceBonusAwardedAt <= FORCE_BANNER_SECONDS) {
    // "<amount> FOR USING THE FORCE" is the confirmed authentic cabinet banner
    // wording — findings ## HUD & framing / Open follow-ups #7 cites a real
    // cabinet screenshot reading "5,000 FOR USING THE FORCE"
    // (docs/star-wars-1983-source-findings.md:655); the plain "USE THE FORCE"
    // string listed earlier in the same item is a shorter ROM string-table
    // fragment, not the full banner text.
    glowText(ctx, `${FORCE_BONUS.toLocaleString('en-US')} FOR USING THE FORCE`, w / 2, h * 0.16, BANNER_TEXT_PX, 'center', '#dddddd', 12)
  }
  // The winning shot's payoff (sw2-4): a bold "DEATH STAR DESTROYED" callout that
  // rides across the warp into the next wave's space phase (deathStarDestroyedAt
  // is re-stamped by clearRun), pairing with the explosion flash below.
  if (
    state.deathStarDestroyedAt !== null &&
    state.t - state.deathStarDestroyedAt <= DEATH_STAR_BOOM_SECONDS
  ) {
    glowText(ctx, 'DEATH STAR DESTROYED', w / 2, h * 0.45, BANNER_TEXT_PX, 'center', '#ffffff', 18)
  }
  // The run's failure tell (sw2-4): a clear "EXHAUST PORT MISSED", so a slipped
  // port no longer reads as a nondescript scrape.
  if (
    state.exhaustPortMissedAt !== null &&
    state.t - state.exhaustPortMissedAt <= MISS_BANNER_SECONDS
  ) {
    glowText(ctx, 'EXHAUST PORT MISSED', w / 2, h * 0.45, BANNER_TEXT_PX, 'center', '#ff5555', 16)
  }
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

  glowText(ctx, formatLives(state.lives), w / 2, yBot + 16, HUD_TEXT_PX, 'center', HUD_SHIELD_COLOR, 8)
  glowText(ctx, 'SHIELD', w / 2, yBot + 34, HUD_TEXT_PX, 'center', HUD_SHIELD_COLOR, 8)
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
  // The cabinet's additive-glow envelope ('lighter') stays here, per-cabinet; the
  // line itself strokes through the shared primitive. glowPolyline resets shadowBlur
  // inside the save scope, so the explicit reset after restore preserves the original
  // no-leak behaviour (restore brings back the pre-save shadowBlur).
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  glowPolyline(ctx, [[x0, y0], [x1, y1]], { stroke: color, width: 1.5, blur: 8 })
  ctx.restore()
  ctx.shadowBlur = 0
}

/** The attract/title screen: the marquee, a start prompt, and the high-score board. */
function drawAttract(
  ctx: CanvasRenderingContext2D,
  highScores: HighScoreTable<'wave'>,
  w: number,
  h: number,
): void {
  glowText(ctx, 'STAR WARS', w / 2, h * 0.26, TITLE_TEXT_PX, 'center', GLOW, 28)
  glowText(ctx, 'PRESS START', w / 2, h * 0.38, HUD_TEXT_PX, 'center', BOLT_GLOW, 12)

  drawHighScoreBoard(ctx, highScores, w, h)

  ctx.shadowBlur = 0
}

/** The game-over screen: the banner, the run's final score, and the board. */
function drawGameOver(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  highScores: HighScoreTable<'wave'>,
  w: number,
  h: number,
): void {
  glowText(ctx, 'GAME OVER', w / 2, h * 0.24, BANNER_TEXT_PX, 'center', TIE_GLOW, 24)
  glowText(ctx, `SCORE ${state.score}`, w / 2, h * 0.33, HUD_TEXT_PX, 'center', GLOW, 12)

  if (state.entry !== null) {
    // SH2-13: the armed initials entry — the typed buffer with a cursor slot
    // while the 3-char convention still has room. The board waits until the
    // commit lands so the screen reads as one question.
    glowText(ctx, 'ENTER YOUR INITIALS', w / 2, h * 0.42, HUD_TEXT_PX, 'center', BOLT_GLOW, 12)
    const buf = state.entry.initials
    glowText(ctx, buf.length < 3 ? `${buf}_` : buf, w / 2, h * 0.52, BANNER_TEXT_PX, 'center', GLOW, 18)
    glowText(ctx, 'TYPE A-Z  BACKSPACE FIXES  START CONFIRMS', w / 2, h * 0.62, HUD_TEXT_PX, 'center', GLOW, 6)
  } else {
    glowText(ctx, 'PRESS START', w / 2, h * 0.39, HUD_TEXT_PX, 'center', BOLT_GLOW, 12)
    drawHighScoreBoard(ctx, highScores, w, h)
  }

  ctx.shadowBlur = 0
}

/** The local high-score ladder (descending), shared by the framing screens. */
function drawHighScoreBoard(
  ctx: CanvasRenderingContext2D,
  highScores: HighScoreTable<'wave'>,
  w: number,
  h: number,
): void {
  glowText(ctx, 'HIGH SCORES', w / 2, h * 0.5, HUD_TEXT_PX, 'center', GLOW, 10)

  let y = h * 0.5 + 30
  if (highScores.length === 0) {
    glowText(ctx, 'NO SCORES YET', w / 2, y, HUD_TEXT_PX, 'center', GLOW, 6)
    return
  }
  for (let i = 0; i < highScores.length; i++) {
    const e = highScores[i]
    const rank = String(i + 1).padStart(2, ' ')
    const pts = String(e.score).padStart(6, ' ')
    glowText(ctx, `${rank}  ${e.name}  ${pts}  WAVE ${e.wave}`, w / 2, y, HUD_TEXT_PX, 'center', GLOW, 6)
    y += 24
  }
}

// Glowing vector-style text (caps): a wide bloom plus a tighter inner glow under
// a crisp core, mirroring tempest's HUD so both games light their thin caps the
// same way. SH2-5: glyphs are STROKED from the shared ROM vector font
// (layoutText geometry via ./font), not drawn through the canvas text API —
// text lights up exactly like the wireframes it flies over. `sizePx` is the cap
// height the 24-unit glyph cell scales onto; `align` anchors the text box on x
// (the old ctx.textAlign contract, now explicit); y stays the baseline.
function glowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  sizePx: number,
  align: 'left' | 'center' | 'right',
  color: string,
  blur: number,
): void {
  const caps = text.toUpperCase() // the shared VGMSGA face is caps-only
  const scale = sizePx / CELL_H
  const { strokes, width } = layoutText(caps, { letterSpacing: GLYPH_TRACKING })
  const w = width * scale
  const ox = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  const trace = (): void => {
    ctx.beginPath()
    for (const s of strokes) {
      // Glyph space is y-up with the baseline at 0; map to screen (y grows down).
      s.points.forEach((p, i) => {
        const sx = ox + p.x * scale
        const sy = y - p.y * scale
        if (i === 0) ctx.moveTo(sx, sy)
        else ctx.lineTo(sx, sy)
      })
    }
    ctx.stroke()
  }
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.lineWidth = 1.5
  if (blur > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.shadowBlur = blur * 1.5
    trace()
    ctx.shadowBlur = blur * 0.8
    trace()
    ctx.restore()
  }
  ctx.shadowBlur = 0
  trace()
}
