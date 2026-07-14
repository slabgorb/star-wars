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

import { EXHAUST_PORT_DISTANCE } from '../../src/core/state'
import { TRENCH_EYE_SEAT } from '../../src/core/trench-channel'
import { FOV_Y } from '../../src/core/gameRules'
import type { Input } from '../../src/core/input'

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
