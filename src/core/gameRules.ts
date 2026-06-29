// src/core/gameRules.ts
//
// Pure rule helpers for Wave 1 — the cockpit aim and the one true hit-test.
// No DOM, no time, no randomness: safe for the deterministic core. All spatial
// math routes through the Math Box (math3d), never ad-hoc trig, so there is a
// single source of 3D truth.

import { length, sub, normalize, perspective, transform, type Vec3 } from './math3d'
import {
  SPAWN_INTERVAL,
  ENEMY_SPEED,
  ENEMY_FIRE_INTERVAL,
  type GameState,
  type Enemy,
} from './state'

/** Vertical field of view (radians) the renderer projects the scene with — the
 * single source of truth shared by the camera (shell/render.ts) and the aim
 * below, so a bolt flies toward exactly what the crosshair covers. */
export const FOV_Y = Math.PI / 3

/**
 * Unit firing direction for a given yoke position. At rest (0,0) it points
 * straight ahead, down −Z (the camera looks down −Z, OpenGL convention). The
 * yoke deflects it left/right (+aimX = right) and up/down (+aimY = up) while it
 * stays unit length.
 *
 * Crucially, the deflection is the INVERSE of the perspective projection the
 * scene is drawn under (FOV_Y, viewport `aspect` = width/height): a point down
 * this ray projects back onto the crosshair at NDC [aimX, aimY] (crosshairNdc),
 * so the bolt hits what the player aimed at. Without the f = 1/tan(FOV_Y/2) and
 * aspect terms the bolt overshoots the reticle by ~f and misses — the 8-16
 * kill-loop bug. `aspect` is a viewport property the shell supplies via Input; it
 * defaults to 1 (square), which is all the pure-core vertical-axis tests need.
 */
export function aimDirection(aimX: number, aimY: number, aspect = 1): Vec3 {
  const f = 1 / Math.tan(FOV_Y / 2)
  return normalize([(aimX * aspect) / f, aimY / f, -1])
}

/**
 * The crosshair reticle's normalised-device position. Centred ([0,0]) when the
 * yoke is at rest, tracking it on both axes — "crosshair at screen centre when
 * phase is space," then following the cursor.
 */
export function crosshairNdc(aimX: number, aimY: number): readonly [number, number] {
  return [clamp(aimX, -1, 1), clamp(aimY, -1, 1)]
}

/**
 * 3D sphere overlap: true when `a` and `b` are within `radius` of each other.
 * Distance comes from the Math Box (length∘sub) — collisions are computed in
 * world space, never in screen pixels.
 */
export function collides(a: Vec3, b: Vec3, radius: number): boolean {
  return length(sub(a, b)) <= radius
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

// --- Lock-on (story 8-14) ---------------------------------------------------
//
// The targeting reticle's green circle lights up over the TIE the player is
// aimed at. The detection is the DUAL of the firing aim: project the enemy
// through the SAME perspective the scene is drawn under and lock when its NDC
// lands within LOCK_RADIUS_NDC of the crosshair NDC [aimX, aimY]. Because
// aimDirection inverts this projection, a lock means a bolt fired now flies into
// the target — "the circle never lies". Per the sacred core boundary the test is
// in NDC, never screen pixels (which would need the canvas size); the shell scales
// the NDC radius to a pixel circle when it strokes the ring.

/**
 * Reticle lock radius in normalised-device units (NOT pixels) — the half-size of
 * the aim box the cabinet lights a target inside, and the on-screen radius the
 * shell strokes the green lock-on circle at (scaled NDC→pixels). Resolution-
 * independent so the core stays pure: no canvas size ever leaks in.
 */
export const LOCK_RADIUS_NDC = 0.12

/**
 * Is `enemyPos` under the reticle — would the next shot connect? Only targets in
 * FRONT of the camera (z < 0, looking down −Z) can lock: the perspective divide
 * flips a behind-camera point's NDC, which must not be mistaken for an on-screen
 * position near the reticle. Pure — no DOM, time, or randomness. `aspect`
 * (viewport width/height) scales the X axis exactly as the projection does and
 * defaults to 1 (square), which is all the pure vertical-axis callers need.
 */
export function isLocked(enemyPos: Vec3, aimX: number, aimY: number, aspect = 1): boolean {
  if (enemyPos[2] >= 0) return false // on or behind the camera plane — not on screen
  // near/far scale only the projected DEPTH, never the x/y NDC the reticle
  // compares, so any positive pair matches the renderer's x/y exactly (1/5000).
  const ndc = transform(perspective(FOV_Y, aspect, 1, 5000), enemyPos)
  return Math.hypot(ndc[0] - aimX, ndc[1] - aimY) <= LOCK_RADIUS_NDC
}

/**
 * The one enemy the green lock-on circle should ring: the NEAREST TIE under the
 * reticle (the first a shot reaches), or null when nothing is locked. A pure
 * derived query over `state.enemies` — no lock state is stored on GameState, so it
 * can never go stale; the render layer calls it each frame. `aspect` is threaded
 * to isLocked so the lock matches the viewport the scene is drawn in.
 */
export function lockedEnemy(state: GameState, aspect = 1): Enemy | null {
  let best: Enemy | null = null
  let bestDist = Infinity
  for (const e of state.enemies) {
    if (!isLocked(e.pos, state.aimX, state.aimY, aspect)) continue
    const d = length(e.pos) // distance from the cockpit at the origin
    if (d < bestDist) {
      bestDist = d
      best = e
    }
  }
  return best
}

// --- Difficulty ramp across waves -------------------------------------------
//
// A run escalates by WAVE: each completed run loops back harder. The ramp is a
// PURE function of the wave number (no time, no randomness) so it stays in the
// deterministic core. Mirrors tempest's `levelParams(level)`: a single `ramp`
// multiplier tightens the spawn/fire cadence (down to positive playable floors,
// so an arbitrarily deep wave never drives a cadence to zero) and speeds up the
// enemy approach. Wave 1 reproduces today's space constants EXACTLY, so wiring
// this in does not shift the Wave-1 balance the 8-3 suite depends on.

/** Difficulty knobs for a wave, consumed by the space-combat step. */
export interface WaveParams {
  /** Seconds between TIE spawns into a free slot (tightens with the wave). */
  spawnInterval: number
  /** TIE approach speed, units/second (rises with the wave). */
  enemySpeed: number
  /** Seconds between enemy fireballs (tightens with the wave). */
  enemyFireInterval: number
}

/** Each wave past the first stiffens the ramp by this fraction. */
const RAMP_PER_WAVE = 0.15
/** Spawn cadence never drops below this (seconds) however deep the run goes. */
const SPAWN_INTERVAL_FLOOR = 0.3
/** Enemy fire cadence never drops below this (seconds). */
const ENEMY_FIRE_INTERVAL_FLOOR = 0.25

export function waveParams(wave: number): WaveParams {
  const ramp = 1 + (wave - 1) * RAMP_PER_WAVE
  return {
    spawnInterval: Math.max(SPAWN_INTERVAL_FLOOR, SPAWN_INTERVAL / ramp),
    enemySpeed: ENEMY_SPEED * ramp,
    enemyFireInterval: Math.max(ENEMY_FIRE_INTERVAL_FLOOR, ENEMY_FIRE_INTERVAL / ramp),
  }
}
