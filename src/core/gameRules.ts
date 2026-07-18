// src/core/gameRules.ts
//
// Pure rule helpers for Wave 1 — the cockpit aim and the one true hit-test.
// No DOM, no time, no randomness: safe for the deterministic core. All spatial
// math routes through the Math Box (math3d), never ad-hoc trig, so there is a
// single source of 3D truth.

import { length, sub, add, scale, dot, normalize, type Vec3 } from '@arcade/shared/math3d'
import {
  SPAWN_INTERVAL,
  ENEMY_SPEED,
  ENEMY_FIRE_INTERVAL,
  FIRE_MASK,
  FIRE_THRESHOLD,
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

/**
 * NO PRODUCTION CALLER (sw7-17 / R11b). This existed to stop a 12,000 u/s bolt stepping clean over
 * the exhaust port between two frames; the player's gun is now a hitscan ray, and an exact ray
 * cannot tunnel, so the last caller went with the projectile it was chasing. Retained for
 * `swept-port-collision.test.ts`, which still pins the dt-independence guarantee it protected.
 * Deleting it is a follow-up on sw7-17.
 *
 * Swept 3D sphere overlap: true when the SEGMENT `a`→`b` passes within `radius`
 * of `center`. This is the anti-tunnelling twin of `collides` — a fast target
 * that steps clean over a small sphere between two frames still registers,
 * because we test the whole path it swept this frame rather than only its end
 * point. Decouples anti-tunnelling from the hit radius (sw4-4): the sphere stays
 * exactly `radius`; only the query widens from a point to the frame's segment.
 * Degenerates to a point test when the segment has zero length. Pure Math-Box
 * math (dot/sub/add/scale/length) — no ad-hoc trig, safe for the core.
 */
export function sweptCollides(center: Vec3, a: Vec3, b: Vec3, radius: number): boolean {
  const ab = sub(b, a)
  const abLen2 = dot(ab, ab)
  if (abLen2 === 0) return collides(center, a, radius) // still segment → point test
  // Closest point on the segment to `center`: project, clamped to [a, b].
  const t = clamp(dot(sub(center, a), ab) / abLen2, 0, 1)
  const closest = add(a, scale(ab, t))
  return length(sub(center, closest)) <= radius
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

// --- The laser beam (story sw7-17 / R11b) -----------------------------------
//
// The player's laser is HITSCAN: the ROM draws it gun-ports → site each frame (VWLAZ) and
// resolves collision INSTANTLY against the nearest object under the site — CLSLZ picks
// min(CL.GDS, CL.ADS) in space, CLGLZ on the ground, CLBLZ in the trench. There is no
// travelling player shot and no lifetime anywhere in WSLAZR.MAC.
//
// "Under the site" is recorded during the object DRAW: each object tests the site against its
// own projected size and keeps the nearest (WSGUNS.MAC:938-948 — a box test, then `LDD TMPSIZ /
// LSRD / ADDD TMPSIZ ;MAKE 1.5 FOR OCTAGON`, then `LDD M.XT ;THEN SEE IF WE ARE THE CLOSEST
// ALIEN / CMPD CL.GDS / IFLO / STD CL.GDS`).
//
// Screen-space is the cabinet's way of saying a world-space thing, and we say it directly: an
// object is under the site exactly when the AIM RAY passes within its hit radius. That is the
// same predicate — a cone through the object's projected size IS a ray within its radius at that
// depth — and it keeps the test in world space, where this core does all its collision. It also
// reuses the hit radii the game already has (TIE_HIT_RADIUS &c.) instead of inventing a reticle
// size, so the beam and the sphere can never disagree about how big a target is.

/**
 * How far along the beam it strikes a sphere at `pos`, or `null` if it misses.
 *
 * `eye` is the ship point the beam is cast from and `dir` its unit aim direction. Returns the
 * distance along the beam to the target's closest approach — the ROM's `M.XT`, the number
 * CL.GDS/CL.ADS rank on — so callers can pick the nearest. Targets behind the gun never hit
 * (the perspective divide would otherwise fold them onto the reticle), and `maxRange` is the
 * beam's far endpoint: infinite in space and on the ground, but $7000 = 28,672 in the trench,
 * where CLBLZ builds the beam against a fixed forward line (`LDD #7000 ;FARTHEST FORWARD
 * POINT`, WSLAZR.MAC:417).
 *
 * Pure Math Box (dot/sub/add/scale/length) — no ad-hoc trig, no screen pixels.
 */
export function beamHit(
  eye: Vec3,
  dir: Vec3,
  pos: Vec3,
  radius: number,
  maxRange = Infinity,
): number | null {
  const along = dot(sub(pos, eye), dir)
  if (along <= 0) return null // behind the gun — never under the site
  if (along > maxRange) return null // past the beam's far endpoint
  const closest = add(eye, scale(dir, along))
  return length(sub(pos, closest)) <= radius ? along : null
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
  /** How many TIE fireballs may share the sky at once — the RE'd per-wave
   * concurrency cap (story 9-5). Climbs 1 → 6 with the wave and saturates at the
   * authentic 6-slot fireball pool; the space step gates per-TIE fire on it, so the
   * ROM-faithful wave 1 keeps a single fireball aloft while late waves fill it. */
  maxConcurrentShots: number
  /** TGPROB cadence-window mask for this wave (state.ts `FIRE_MASK`, WSCPU.MAC:736).
   * The §6 fire gate opens a window when `(state.frame & fireMask) === 0`. Tightens
   * with the wave (0F → 07 → 03: a window every 16 → 8 → 4 game frames). */
  fireMask: number
  /** TGPROB probability threshold for this wave (state.ts `FIRE_THRESHOLD`,
   * WSCPU.MAC:736). Inside an open window a TIE fires when `nextInt(rng, 256) >
   * fireThreshold`; P(fire | window) = (255 − fireThreshold)/256. */
  fireThreshold: number
}

/** Each wave past the first stiffens the ramp by this fraction. */
const RAMP_PER_WAVE = 0.15
/** Spawn cadence never drops below this (seconds) however deep the run goes. */
const SPAWN_INTERVAL_FLOOR = 0.3
/** Enemy fire cadence never drops below this (seconds). */
const ENEMY_FIRE_INTERVAL_FLOOR = 0.25

// --- TIE fire aggression: the RE'd per-wave TGPROB row (story 9-5; sw7 Task 5) --
//
// The 1983 cabinet escalates TIE aggression with the `TGPROB` fire-parameter table
// (WSCPU.MAC:736; the disassembly's ROM:8D71) — a per-wave `[mask, threshold, guns]`
// row indexed by min(mission + DIP, 15). All THREE columns are now ported and drive
// the §6 fire gate (sim.ts's decision tick):
//   * GUNS  → `maxConcurrentShots` (the SIMULTANEOUS-FIREBALL cap; `FIRE_CONCURRENCY`
//     below). Climbs 1 → 6 and saturates at the authentic 6-slot fireball pool.
//   * MASK  → `fireMask` (state.ts `FIRE_MASK`) — the cadence window `(frame & mask)==0`.
//   * THRESHOLD → `fireThreshold` (state.ts `FIRE_THRESHOLD`) — the PRNG roll.
// The cadence columns are NO LONGER "unported": the cabinet game-frame tick IS pinned
// (state.ts `TICK_HZ`, audit T-007), so the frame-mask ports faithfully as a discrete
// per-game-frame gate on `state.frame` rather than an invented seconds cadence — see
// docs/tie-flight-ai-model.md §5.3 / §6 and the sw7 design (docs 4c93855) §3. The
// legacy scalar `enemyFireInterval` below stays only as a wave-difficulty knob
// (pinned by difficulty.test.ts / tie-wave-ramp.test.ts); the space fire path no
// longer consumes it — the §6 gate replaced it.
//
// Clone `wave` is 1-based and the cabinet's first space wave is mission 0, so the
// fire index is min((wave - 1) + DIP, 15). The clone has no DIP switches → DIP = 0.

/** Per-index simultaneous-fireball cap — the TGPROB GUNS column (WSCPU.MAC:736).
 * Length 16 (the index saturates at 15); the value tops out at the 6-slot pool
 * from index 6 on. `FIRE_MASK`/`FIRE_THRESHOLD` (state.ts) are the same table's
 * other two columns, addressed by the same fire-index below. */
const FIRE_CONCURRENCY: readonly number[] = [1, 1, 2, 3, 4, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]

export function waveParams(wave: number): WaveParams {
  const ramp = 1 + (wave - 1) * RAMP_PER_WAVE
  // Fire-aggression index into TGPROB: min((wave - 1) + DIP, 15), DIP = 0. One index
  // addresses all three columns (guns / mask / threshold), which share the length-16 shape.
  const fireIndex = Math.max(0, Math.min(wave - 1, FIRE_CONCURRENCY.length - 1))
  return {
    spawnInterval: Math.max(SPAWN_INTERVAL_FLOOR, SPAWN_INTERVAL / ramp),
    enemySpeed: ENEMY_SPEED * ramp,
    enemyFireInterval: Math.max(ENEMY_FIRE_INTERVAL_FLOOR, ENEMY_FIRE_INTERVAL / ramp),
    maxConcurrentShots: FIRE_CONCURRENCY[fireIndex],
    fireMask: FIRE_MASK[fireIndex],
    fireThreshold: FIRE_THRESHOLD[fireIndex],
  }
}
