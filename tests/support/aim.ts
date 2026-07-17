// tests/support/aim.ts
//
// Shared yoke helpers for the trench suites (story sw5-6).
//
// WHY THIS EXISTS. Until sw5-6 the pilot's eye sat 60 units above the trench floor and the
// exhaust port sat AT it, so "fire straight ahead" (`aimY: 0`) hit the port and every port suite
// in the repo was written that way. sw5-6 pinned the trench from the ROM: the pilot now flies
// 768 above the floor and the port lies IN the floor. A centred crosshair points at the
// vanishing point — at NOTHING — and a pilot who wants the port must aim DOWN at it.
//
// So the old `FIRE = { aimX: 0, aimY: 0, fire: true }` no longer means "shoot the port"; it means
// "shoot the sky". These helpers say what they mean, and keep the suites honest when the geometry
// moves again.

import { EXHAUST_PORT_DISTANCE, type GameState } from '../../src/core/state'
import { TRENCH_EYE_SEAT } from '../../src/core/trench-channel'
import { FOV_Y } from '../../src/core/gameRules'
import type { Input } from '../../src/core/input'
import { transform, type Vec3 } from '@arcade/shared/math3d'
import * as RenderModule from '../../src/shell/render'

/**
 * THE EYE THE SHELL ACTUALLY BUILDS, recovered from `render.ts cameraView` (story sw7-16).
 *
 * Never hand-write `[0, altitude, 0]` (or `trenchView`) in a test to stand in for the camera. Round
 * 1 of sw7-16 did exactly that, and it made "the muzzle is on the camera eye" a comparison between
 * the muzzle and a constant typed twice in the same file — it would have sat green through any
 * drift in render.ts. Going through `cameraView` binds the assertion to the shell's real camera,
 * across the boundary. (Tests may import the shell; only `src/core/**` may not.)
 *
 * Every phase's view matrix is IDENTITY-oriented, so it is a pure translation by −eye and the eye
 * falls straight out of the world origin's image: transform(view, [0,0,0]) = −eye.
 * (`+ 0` normalises −0, which `toEqual` reports as a difference from 0.)
 */
export function eyeOf(s: GameState): Vec3 {
  const originInView = transform(RenderModule.cameraView(s), [0, 0, 0])
  return [-originInView[0] + 0, -originInView[1] + 0, -originInView[2] + 0]
}

/**
 * The yoke position that puts the crosshair ON a world point, seen from `eye`. This inverts the
 * SAME projection the crosshair is drawn under (`gameRules.aimDirection` / `crosshairNdc`), so
 * "aim at it" is literal, not approximate.
 *
 * Returns raw NDC — it is NOT clamped, deliberately: a magnitude > 1 means the yoke physically
 * cannot point there, and a caller that silently clamped it away would be hiding exactly the
 * defect this helper exists to expose (see tests/core/trench-aim-wysiwyg.test.ts).
 */
export function aimAt(
  target: readonly [number, number, number],
  eye: readonly [number, number, number],
  aspect = 1,
): { aimX: number; aimY: number; reachable: boolean } {
  const f = 1 / Math.tan(FOV_Y / 2)
  const depth = -(target[2] - eye[2])
  const aimX = (f * (target[0] - eye[0])) / depth / aspect
  const aimY = (f * (target[1] - eye[1])) / depth
  return { aimX, aimY, reachable: Math.abs(aimX) <= 1 && Math.abs(aimY) <= 1 }
}

/**
 * THE YOKE THAT SHOOTS `target`, from the eye `s` is actually seen through (story sw7-17 / R11b).
 *
 * WHY THIS EXISTS. Until sw7-17 the player's gun threw a 12,000 u/s projectile, so a test could
 * say "the player shot this thing" by hand-placing a bolt on top of it:
 *
 *     projectiles: [{ pos: target, vel: [0, 0, -1], ttl: PROJECTILE_TTL }]
 *
 * and stepping once with the trigger up. That fixture is now unbuildable in play — the laser is
 * HITSCAN and nothing the player fires ever exists as an object (audit G-004). The honest
 * replacement is not a different fixture but a different sentence: AIM AT IT AND PULL THE TRIGGER.
 * That is what this returns, and it is strictly stronger than the old bolt — it goes through the
 * real aim, the real ship point and the real resolve, so it fails if any of them break.
 *
 * The trigger is EDGE-triggered (G-012): the state must carry `firePrev: false` for this to fire
 * at all, and `fireCooldown <= 0`. Holding this input for a second frame fires NOTHING — that is
 * the point of it. Use `release()` to keep flying with the trigger up.
 */
export function fireAt(s: GameState, target: readonly [number, number, number], aspect = 1): Input {
  const { aimX, aimY } = aimAt(target, eyeOf(s), aspect)
  return { aimX, aimY, fire: true, aspect }
}

/** The same aim with the trigger released — one pull is one shot, so coasting needs this. */
export function release(input: Input): Input {
  return { ...input, fire: false }
}

/**
 * Hold the trigger with the crosshair on the exhaust port, from the seated pilot's eye at the
 * port's spawn distance (~17.7° down — comfortably inside the 30° cone the 60° FOV allows).
 *
 * This is what the old centred `FIRE` was *trying* to be: "the player shoots at the target".
 */
export const FIRE_AT_PORT: Input = (() => {
  const { aimX, aimY } = aimAt([0, 0, -EXHAUST_PORT_DISTANCE], [0, TRENCH_EYE_SEAT, 0], 1)
  return { aimX, aimY, fire: true, aspect: 1 }
})()

/** The same aim, trigger released — for suites that need to stop firing but keep flying level. */
export const HOLD_AT_PORT: Input = { ...FIRE_AT_PORT, fire: false }
