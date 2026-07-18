// src/core/tie-status.ts
//
// Task 1 of the TIE-VM-wiring plan (sw7, docs 4c93855) — computeStatus: the
// status-word computer for the 6 GATED bits of a TIE's live A$CHST
// (WSCPU.MAC:16-38) that the choreography VM (tie-vm.ts) tests via .CIF/
// .CUNTIL — the ones the VM engine itself does not (and should not) know how
// to derive, since it only interprets the bytecode against whatever status
// word its caller hands it. The other 5 A$CHST bits (C_AD, C_AV, C_PS, C_PV,
// C_PM) are relative to the PLAYER's aim/view rather than a lone TIE's own
// geometry and are out of this task's scope.
//
// PURE src/core: no DOM, no wall clock, no Math.random — every random bit
// comes from the Rng the caller threads through the sim (the same discipline
// sim.ts is held to). UNWIRED: nothing in sim.ts calls this yet — wiring it
// into stepGame's per-frame enemy update is a later task in this plan — so
// today this is exercised only by tests/core/tie-status.test.ts.

import { Status } from './tie-vm'
import type { Enemy, GameState } from './state'
import { nextInt, type Rng } from '@arcade/shared/rng'
import { length, normalize, dot, sub, type Vec3 } from '@arcade/shared/math3d'

const COCKPIT: Vec3 = [0, 0, 0]

/**
 * C_AS's fire-cone half-angle, as a cosine threshold. The ROM's own C$AS gate
 * (WSCPU.MAC:604-620: `CHSET C$AS` once the alien's math-box view of the
 * player — M.YPS+M.ZPS after the M$PSB2 view transform — falls inside a
 * narrow projected-space window, "AIMING NEAR SHIP") is a SCREEN-SPACE test
 * in per-shape math-box units, not a world-space half-angle — there is no
 * direct unit conversion to a cosine threshold. TODO(playtest): this 12° is
 * INFERRED (the design spec's §6 gives only "bit $10 set", not the angle);
 * retune once the VM is wired and firing is observable.
 */
export const FIRE_CONE_COS = Math.cos((12 * Math.PI) / 180)

/**
 * C_PN's range threshold. The ROM sets C$PN from a squared math-box-VIEW
 * distance (WSMAIN.MAC:3776-3787: `M.XPS+M.YPS+M.ZPS`, `CMPU #100`) — units
 * post-projection in a per-shape scale, not raw world units — so, per this
 * task's scope, that threshold is not ported directly (no further ROM dig
 * here). TODO(playtest): ~40% of TIE_SPAWN_DISTANCE (0x7c00 = 31744) as a
 * defensible "close enough to react to the player" band; retune in playtest.
 */
export const PLAYER_NEAR_RANGE = 0x7c00 * 0.4 // 12697.6

/**
 * OR together the 6 status bits this task owns. Pure: identical (e, state,
 * rng.seed) yields identical bits, modulo the Rng's own documented mutation
 * (nextInt advances `rng.seed`).
 */
export function computeStatus(e: Enemy, state: GameState, rng: Rng): number {
  let status = 0

  // C_AS (0x04) — "ALIEN HAS PLAYER IN SITES" (WSCPU.MAC:29,604-620). The
  // TIE's nose axis — model +Z mapped through e.orient, the same column
  // lookRotation writes forward into (math3d.ts:171-186) — dotted with the
  // unit direction from the TIE to the cockpit (origin) clears the cone.
  const nose: Vec3 = [e.orient[2], e.orient[6], e.orient[10]]
  const toCockpit = normalize(sub(COCKPIT, e.pos))
  if (dot(nose, toCockpit) >= FIRE_CONE_COS) status |= Status.C_AS

  // C_PN (0x400) — "PLAYER IS NEAR THE ALIEN" (WSCPU.MAC:35; CHSET C$PN at
  // WSMAIN.MAC:3787). The TIE is within PLAYER_NEAR_RANGE of the cockpit.
  if (length(e.pos) <= PLAYER_NEAR_RANGE) status |= Status.C_PN

  // C_AG (0x40) — "ALIEN HAS FIRED A GUN" (WSCPU.MAC:33,658: `CHSET C$AG` in
  // the gun-fire handler). Read-only here — a later task's fire step sets
  // `e.firedGun` on the frame this TIE actually fires; computeStatus just
  // reports it.
  if (e.firedGun ?? false) status |= Status.C_AG

  // C_AH (0x01) — "NEARBY ALIEN HAS BEEN HIT" (WSCPU.MAC:27,357: `CHSET C$AH`
  // in the damage handler). TODO: a later task threads the hit resolver's
  // per-step result through `state` (or a per-step arg) so squadmates react
  // to a nearby kill; for now this always reads false. `state` is accepted
  // (and the signature kept stable) precisely so that wiring needs no
  // signature change later.
  void state // read once wired; unused today

  // C_R1 / C_R2 (0x10 / 0x20) — two independent "random bit" event gates
  // (WSCPU.MAC:31-32). The ROM draws ONE random byte and masks both bits at
  // once (`LDB P.RND1 / ANDB #C$R1+C$R2`, WSCPU.MAC:534-535); each bit of a
  // uniform byte is itself uniform and independent, so two separate
  // nextInt(rng, 2) draws off the seeded core Rng are the same distribution.
  if (nextInt(rng, 2) === 1) status |= Status.C_R1
  if (nextInt(rng, 2) === 1) status |= Status.C_R2

  return status
}
