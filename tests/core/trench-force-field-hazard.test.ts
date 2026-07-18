// tests/core/trench-force-field-hazard.test.ts
//
// Story sw7-19 — RED phase (Han Solo / TEA): the trench "catwalk" collision is
// re-ported as the WALL FORCE FIELD it is in the ROM (finding B-012, the
// behaviour half; the model half is trench-force-field-rom.test.ts).
//
// SUPERSEDES + INVERTS the story-14-7 suite (trench-catwalk-hazard.test.ts).
// 14-7 made the (fabricated, channel-spanning) catwalk "cost exactly one
// shield". B-012 rules that WRONG: the ROM's WSPANL contact is a GRAZE, not a
// hard `lives-1`. That file is deleted; its "a pass registers a crash over a
// real crossing" coverage is preserved below, re-seated to the graze contract.
//
// -- WHAT THE ROM ACTUALLY DOES (WSPANL.MAC:186-215, .RADIX 16) ---------------
//
//   LDD  M.X0 / SUBD M$TX+M.U1 / CMPD #1000 / IFLE      ; panel within depth
//     CMPA #TD$WFF / IFEQ                               ; a force field?
//       LDD M$TY+M.U1 / IFLE          ;?ON LEFT SIDE?   ; ← SIDE GATE (pilot side)
//         LDD M.Z0 / ADDD #200        ;TOP OF FORCE FIELD
//         SUBD M$TZ+M.U1 / IFGE       ;?FORCE FIELD ABOVE PLAYER?
//           SUBD #400 / IFLE          ;?BUT NOT TOO FAR? ← VERTICAL BAND ($400)
//             LDD M.X0 / SUBD M$TX+M.U1 / SUBD #400
//             IFLS                    ;?WITHIN FIRST HALF OF FORCE FIELD? ← DEPTH ($400)
//               LDA #TD$WFG           ;THEN A HIT, CHANGE THE PICTURE TO BRITE
//               JSR BG1GLW            ;GLOW the ship        (deferred A-018)
//               JSR AUDCR             ;CRASH sound          → 'terrain-crash'
//               STA S.ROL             ;ROLL the ship ±78    (deferred A-018)
//
// Three gates, then a GRAZE — glow + crash sound + roll, and NOTHING ELSE. There
// is no `lives-1` here: the shield ACCOUNTING rides WSGLOW (score-shields / S-016
// scope, a later story). Of the graze's three cues, only the crash sound (AUDCR
// → our 'terrain-crash') is modelled today; the ship glow and roll are the
// explicitly-deferred A-018 (state.ts glow field doc). So this story's whole
// observable is: the contact GRAZES (fires 'terrain-crash') and costs NO shield.
//
// -- THE SIDE GATE, AND WHY THE OLD TEST CAN'T SEE IT -------------------------
//
// The pilot is clamped to ±TRENCH_VIEW_HALF_W (±511) inside walls at
// ±TRENCH_HALF_W (±1024), so he is ALWAYS ≥ 513 units from a wall. The old
// collision is a CATWALK_HIT_RADIUS(=240) sphere around the obstacle's point, so
// a WALL-MOUNTED field is simply unreachable by it — the old collision only ever
// bit a CENTRED (x≈0) girder. The ROM gate is not a sphere: `IFLE ;?ON LEFT
// SIDE?` blocks the WHOLE half-channel on the field's side (at its height slot
// and depth), with no lateral-distance test. So the dodge is lateral (steer to
// the OPPOSITE wall) or vertical (a different height slot) — never "hug centre".
//
// -- REPRESENTATION CONTRACT (defined here; Dev's grid-derived spawning meets it)
//
// A force-field hazard is a trench obstacle whose mounted wall is the SIGN of
// pos[0] (negative = left wall, positive = right wall; magnitude ≈ TRENCH_HALF_W).
// The collision fires only when the pilot's lateral trenchView[0] is on that
// same side, within the field's vertical band and depth window; the contact is a
// graze ('terrain-crash', no shield). The EXACT band ($200 top offset, $400
// height) and depth ($400) coordinates, and the grid slot→world-height mapping,
// are Dev's to derive from the sw7-6 wedge grid (WSPANL.MAC:196-210) — this suite
// pins the OBSERVABLE (which side/height grazes vs clears), not those literals.

import { describe, it, expect } from 'vitest'
import { initialState, type GameState, type TrenchObstacle } from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import {
  TRENCH_HALF_W,
  TRENCH_EYE_SEAT,
  TRENCH_EYE_MIN,
  TRENCH_EYE_MAX,
} from '../../src/core/trench-channel'
import type { Vec3 } from '@arcade/shared/math3d'

/**
 * An isolated trench holding ONLY the given force-field hazard(s) and no exhaust
 * port, seated at the given pilot viewpoint. No port ⇒ the force-field contact is
 * the only thing that can touch a shield, so the count is clean.
 */
function trenchWith(obstacles: TrenchObstacle[], view: Vec3): GameState {
  return {
    ...enterPhase(initialState(), 'trench'),
    mode: 'playing',
    exhaustPort: null,
    projectiles: [],
    trenchObstacles: obstacles.map((o) => ({ kind: o.kind, pos: [...o.pos] as Vec3 })),
    trenchView: [...view] as Vec3,
  }
}

/** A wall force field: mounted on `wall` (±TRENCH_HALF_W), height slot `y`, depth `z`. */
const forceField = (wall: number, y: number, z: number): TrenchObstacle => ({ kind: 'catwalk', pos: [wall, y, z] })

const LEFT_WALL = -TRENCH_HALF_W // -1024
const RIGHT_WALL = TRENCH_HALF_W //  1024
const DT = 1 / 60

/** Drive a hands-off pilot until the hazard clears (or a cap), reporting whether
 *  a crash EVER fired and the net shields spent. NO_INPUT holds trenchView fixed. */
function flyThrough(s0: GameState): { crashSeen: boolean; shieldsLost: number } {
  let s = s0
  const lives0 = s.lives
  let crashSeen = false
  for (let i = 0; i < 120 && s.trenchObstacles.length > 0; i++) {
    s = stepGame(s, NO_INPUT, DT)
    if (s.events.some((e) => e.type === 'terrain-crash')) crashSeen = true
  }
  return { crashSeen, shieldsLost: lives0 - s.lives }
}

describe('sw7-19 / B-012 — the wall force field is a GRAZE, not a shield-costing bar', () => {
  it('grazes a same-side pilot: fires terrain-crash but costs NO shield (inverts 14-7)', () => {
    // Left-wall field at the pilot's seat height, just downrange; pilot on the
    // left half. RED today: the CATWALK_HIT_RADIUS sphere never reaches a wall
    // field, so no crash fires at all — `crashSeen` is false. Once side-gated it
    // grazes, and the graze must NOT spend a shield (the 14-7 contract, inverted).
    const s0 = trenchWith([forceField(LEFT_WALL, TRENCH_EYE_SEAT, -1)], [-300, TRENCH_EYE_SEAT, 0])
    const { crashSeen, shieldsLost } = flyThrough(s0)
    expect(crashSeen, 'the force field grazes the same-side pilot').toBe(true)
    expect(shieldsLost, 'a graze costs no shield (WSGLOW/S-016 scope, not this story)').toBe(0)
  })

  it('is side-gated: it grazes a same-side pilot but a pilot on the OPPOSITE wall flies clear', () => {
    // The ROM `IFLE ;?ON LEFT SIDE?` mirror. Same left-wall field; move only the
    // pilot's side. Both halves in one test so neither can pass alone: a coin/
    // full-width bar would hit (or miss) both sides identically.
    const field = () => [forceField(LEFT_WALL, TRENCH_EYE_SEAT, -1)]
    const sameSide = flyThrough(trenchWith(field(), [-300, TRENCH_EYE_SEAT, 0]))
    const oppositeSide = flyThrough(trenchWith(field(), [300, TRENCH_EYE_SEAT, 0]))

    expect(sameSide.crashSeen, 'same-side pilot grazes').toBe(true)
    expect(oppositeSide.crashSeen, 'opposite-wall pilot flies clear').toBe(false)
    expect(oppositeSide.shieldsLost, 'no contact ⇒ no shield').toBe(0)
  })

  it('a right-wall field mirrors it — grazes a right pilot, clears a left pilot', () => {
    // The complementary wall, so a hardcoded "always left" gate cannot pass this
    // suite. sign(pos[0]) selects the wall.
    const field = () => [forceField(RIGHT_WALL, TRENCH_EYE_SEAT, -1)]
    const rightPilot = flyThrough(trenchWith(field(), [300, TRENCH_EYE_SEAT, 0]))
    const leftPilot = flyThrough(trenchWith(field(), [-300, TRENCH_EYE_SEAT, 0]))

    expect(rightPilot.crashSeen, 'same-side (right) pilot grazes').toBe(true)
    expect(leftPilot.crashSeen, 'opposite (left) pilot flies clear').toBe(false)
  })

  it('the vertical dodge survives: a same-side pilot far from the field height flies clear', () => {
    // A LOW field (seated at the dive floor) and a pilot climbed to the ceiling —
    // separated in height by far more than any ROM band ($400) — must NOT graze,
    // even though both are on the left. Robust to the exact band size (which Dev
    // derives from the grid slot heights): the extreme is unambiguous.
    const lowField = [forceField(LEFT_WALL, TRENCH_EYE_MIN, -1)]
    const climbed = flyThrough(trenchWith(lowField, [-300, TRENCH_EYE_MAX, 0]))
    expect(climbed.crashSeen, 'a pilot a full channel above a low field is clear').toBe(false)
    expect(climbed.shieldsLost).toBe(0)
  })

  it('does NOT graze while the field is still far downrange (guards an over-eager depth gate)', () => {
    // One frame with the field parked deep in the channel: no sane depth gate
    // (within the field's first $400) should register a hit this far out.
    const s0 = trenchWith([forceField(LEFT_WALL, TRENCH_EYE_SEAT, -8000)], [-300, TRENCH_EYE_SEAT, 0])
    const s1 = stepGame(s0, NO_INPUT, DT)
    expect(s1.events.some((e) => e.type === 'terrain-crash')).toBe(false)
    expect(s1.lives).toBe(s0.lives)
    expect(s1.trenchObstacles).toHaveLength(1) // still ahead, still airborne
  })

  it('the channel-spanning bar is gone: holding the opposite wall clears a single-wall field, no shield', () => {
    // The headline of B-012 — our old bar could only be dodged by diving; the
    // wall field is dodged by flying the OTHER wall. A pilot who holds the right
    // wall past a left-wall field never crashes and never loses a shield.
    const s0 = trenchWith([forceField(LEFT_WALL, TRENCH_EYE_SEAT, -1)], [400, TRENCH_EYE_SEAT, 0])
    const { crashSeen, shieldsLost } = flyThrough(s0)
    expect(crashSeen, 'opposite-wall run is clean').toBe(false)
    expect(shieldsLost).toBe(0)
  })
})
