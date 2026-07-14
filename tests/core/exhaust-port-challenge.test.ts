// tests/core/exhaust-port-challenge.test.ts
//
// Story sw3-15 — restore a real hit challenge to the trench exhaust-port finish
// (RED phase). Bug: the finish is unmissable. Two causes, straight from the story
// title and confirmed against the ORIGINAL Atari 1983 source ("Warp Speed"):
//
//   1. PORT_HIT_RADIUS = 120 is ~2x the visible octagon (EXHAUST_PORT spans ~64,
//      reach ~70), so ANY centred bolt lands regardless of precision.
//   2. There is no approach-window gate: a bolt fired anywhere down the full trench
//      detonates the port the instant it crosses it.
//
// The authentic mechanism (WSMAIN.MAC / WSBASE.MAC / WSGUNS.MAC):
//   - The porthole (BS.PLC) is a FIXED location; the ROM torpedo is guided to it.
//     So the fix is NOT to randomise the port laterally — it stays dead-centre —
//     but to make the shot have to be ON the small port, in the right window.
//   - The hit/miss decision is made ONLY inside a narrow window at the end wall:
//       WSMAIN.MAC:1896-1917  LDD BS.ELC / SUBD M$TX / SUBD #0800 / IFLS
//       ("?ABOUT TO BASH OUR NOSE IN THE END WALL?") — the ROM's $800 window, one
//       trench-wedge spacing (WSBASE.MAC:1125 short wedge = #800). Outside it, a
//       shot cannot resolve the port; inside it, HIT if the torpedo is on target,
//       else MISS → "bash our nose" → PH$B0B "TRY TRENCH AGAIN" (the clone's
//       crash-and-respawn-a-fresh-pass is authentic).
//
// The three restore actions the story asks for map to the two describe blocks below:
//   • tighten the hit sphere toward the VISIBLE target ─┐  "the hit sphere is
//   • require aim alignment (a shot must be ON the port)┘   tightened to the target"
//   • gate the hit/miss test to the narrow $800 window  →  "the hit/miss decision
//                                                            is gated to the window"
//
// ⚠ RE-SEATED BY sw5-4. Everything above is sw3-15's history and still true OF ITS
// TIME: the "visible octagon" it tightened against (EXHAUST_PORT, ~70 reach) was an
// AUTHORED shape, because the disassembly held no vertex table for the port. The 1983
// source does (WSOBJ.MAC `.WP PORT`, ";THERMAL EXHAUST PORT"), so sw5-4 replaces the
// octagon with the real object: three concentric squares, the innermost of which —
// the ±96 `;PORTHOLE` — is the hole. sw3-15's WYSIWYG rule is UNCHANGED and still
// enforced below; only the geometry it points at moves, from the octagon to the
// porthole. The hit sphere therefore GROWS (70 → 96-136) and the finish gets easier
// by exactly that much. Full contract + difficulty call-out: exhaust-port-hit-rom.test.ts.
//
// Like the sibling suites (exhaust-port-outcome, force-bonus) these drive behaviour
// through the pure surface — stepGame(state, input, dt) and the GameState/events it
// returns — asserting observable gameplay, never internal shape, and obey the sacred
// boundary: no DOM, no time except dt, no randomness except the seeded RNG in state.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  PORT_HIT_RADIUS,
  EXHAUST_PORT_DISTANCE,
  PROJECTILE_TTL,
  STARTING_LIVES,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { EXHAUST_PORT } from '../../src/core/models'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'
import type { Vec3 } from '@arcade/shared/math3d'
import { FIRE_AT_PORT } from '../support/aim'

/** A live exhaust port at a world position — the hit-test reads `.pos`. */
const portAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

/** A fresh trench run with an explicit exhaust port. initialState seeds a live
 *  trigger (fireCooldown 0), so a `FIRE` frame spawns a real bolt immediately. */
const trench = (
  port: { pos: Vec3 } | null,
  over: Partial<GameState> = {},
  seed = 1983,
): GameState => ({ ...initialState(seed), phase: 'trench', exhaustPort: port, ...over })

/** A hand-placed bolt at rest (unit -Z velocity, micro-tick friendly) — used where
 *  the geometry is pinned dead-on and real-speed flight is irrelevant. */
const bolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })

/** One real 60fps frame. */
const FRAME = 1 / 60

/** Trigger held, aim dead-centre, square aspect: the sim spawns a bolt at the
 *  cockpit with velocity aimDirection(0,0,1) * PROJECTILE_SPEED = [0,0,-5000]. */
// sw5-6: RE-SEATED — see tests/support/aim.ts. `aimY: 0` now points at empty sky, not the port.
const FIRE: Input = FIRE_AT_PORT

/** A world Z near the cockpit — deep inside ANY plausible approach window, so tests
 *  that want the RADIUS or the AIM (not the window) to decide the outcome can seat
 *  the port here and know the window never confounds them. Matches the -300 the
 *  sibling suites use for their in-range port kills. */
const IN_WINDOW_Z = -300

/**
 * The visible target's outer reach — the geometry sw3-15's WYSIWYG bound is pinned
 * against. RE-SEATED BY sw5-4: this used to be the authored octagon's ~69.5, read in
 * the XZ plane the octagon lay flat in. EXHAUST_PORT is now the ROM's `PORT` object —
 * three concentric squares (96 / 160 / 256), flat in the z=0 plane, facing the pilot —
 * so the reach is read in the x/y plane it actually occupies, and it is measured over
 * the PORTHOLE (the innermost square, the one `.WGD PORT`'s red `;PORTHOLE` pen
 * closes) rather than the whole plate. The berm and base are the lip and the Death
 * Star surface around the shaft; a torpedo into them has missed.
 *
 * sw3-15's rule is unchanged — "you may only HIT what you can SEE" — it is simply
 * pointed at the real hole instead of a fabricated octagon. See
 * exhaust-port-hit-rom.test.ts for the full AC-4 contract and the difficulty call-out.
 */
const PORTHOLE_HALF_WIDTH = 96 // `.PH 0C,0C,0` × .S=8 — the hole
const BERM_HALF_WIDTH = 160 //    `.PH 14,14,0` × .S=8 — the lip
const BASE_HALF_WIDTH = 256 //    `.PH 20,20,0` × .S=8 — Death Star surface
/** The porthole's corner reach — the WYSIWYG ceiling. ~135.8. */
const PORTHOLE_REACH = Math.hypot(PORTHOLE_HALF_WIDTH, PORTHOLE_HALF_WIDTH)

/** What the port model ACTUALLY ships. Checked against the ROM constants above by the
 *  guard test — never used in their place, so a re-authored port cannot quietly
 *  satisfy a bound by shrinking the yardstick along with the target. */
const MODEL_RINGS = [...new Set(EXHAUST_PORT.vertices.map((v) => Math.abs(v[0])))].sort(
  (a, b) => a - b,
)

/**
 * Fire ONE real bolt down the trench, then coast at a true 60fps, collecting the
 * event stream every frame (events are fresh per step). Stops when the run leaves
 * the trench (a hit warps to space) or the frame budget runs out — so `frames`
 * doubles as a witness for "did the run warp out early?".
 */
function fireAndFollowPort(
  s0: GameState,
  maxFrames = 120,
): { state: GameState; events: GameEvent[]; frames: number } {
  const events: GameEvent[] = []
  let s = stepGame(s0, FIRE, FRAME) // frame 1: the bolt spawns at the cockpit
  events.push(...s.events)
  let frames = 1
  while (s.phase === 'trench' && frames < maxFrames) {
    s = stepGame(s, NO_INPUT, FRAME) // release the trigger and let the bolt fly
    events.push(...s.events)
    frames++
  }
  return { state: s, events, frames }
}

const hit = (events: GameEvent[]): boolean => events.some((e) => e.type === 'death-star-destroyed')
const missed = (events: GameEvent[]): boolean => events.some((e) => e.type === 'exhaust-port-missed')

// ---------------------------------------------------------------------------
// tighten the hit sphere to the VISIBLE target + require aim alignment
// (sw5-4: the visible target is now the ROM porthole, not the authored octagon)
// ---------------------------------------------------------------------------

describe('sw3-15 — the exhaust-port hit sphere is tightened to the visible target (a shot must be ON the port)', () => {
  it('the port we draw IS the ROM plate, and its porthole reaches ~136 (guards the bound below)', () => {
    // Sanity on the geometry the contract is pinned against. RE-SEATED BY sw5-4: this
    // used to read the authored octagon's ~69.5. The hole the player now SEES is the
    // ROM's ±96 porthole, reaching ~135.8 at its corners. If the model is re-ported
    // again this fires first, so the bound below can be re-read rather than silently
    // rotting — which is exactly what it did when the octagon was replaced.
    expect(MODEL_RINGS, 'the port model is the ROM plate').toEqual([
      PORTHOLE_HALF_WIDTH,
      BERM_HALF_WIDTH,
      BASE_HALF_WIDTH,
    ])
    expect(PORTHOLE_REACH).toBeGreaterThan(130)
    expect(PORTHOLE_REACH).toBeLessThan(140)
  })

  it('the hit sphere is no larger than the porthole you can see — never out onto the berm', () => {
    // WYSIWYG: you may only HIT what you can SEE. sw3-15 removed a 120 sphere that was
    // ~2x the (fabricated) octagon and forgave any centred bolt. The rule survives
    // sw5-4 intact; only its reference moves, to the real hole. Note the sting: 120 is
    // now TIGHTER than the porthole, so the old literal ceiling would forbid a correct
    // radius. The honest ceiling is the porthole's own reach.
    expect(PORT_HIT_RADIUS).toBeLessThanOrEqual(Math.ceil(PORTHOLE_REACH))
    expect(PORT_HIT_RADIUS, 'the lip is not the hole').toBeLessThan(BERM_HALF_WIDTH)
  })

  it('a bolt offset past the porthole (out on the support berm) does not detonate the port', () => {
    // The "require aim alignment" pin, RE-SEATED BY sw5-4. GAP_OFFSET must sit in the
    // band the tightening removes: genuinely off the hole the player sees, yet still on
    // the plate — a near-miss on the structure, not a wild shot. It used to be 96,
    // which was "past the octagon"; against the ROM object 96 is ON the porthole rim
    // and now legitimately SCORES (exhaust-port-hit-rom.test.ts pins that as the
    // difficulty change). Moving it out onto the berm preserves this test's actual
    // intent — an unaligned shot must miss the small target — under the real geometry.
    const GAP_OFFSET = BERM_HALF_WIDTH // 160: on the lip, off the hole
    expect(GAP_OFFSET).toBeGreaterThan(PORTHOLE_REACH) // genuinely off the visible hole
    const base = trench(portAt([0, 0, IN_WINDOW_Z]), { trenchShotsFired: 2 })
    const s1 = stepGame({ ...base, projectiles: [bolt([GAP_OFFSET, 0, IN_WINDOW_Z])] }, NO_INPUT, 0.001)
    expect(hit(s1.events)).toBe(false)
    expect(s1.exhaustPort).not.toBeNull() // still standing — the shot wasn't on target
  })

  it('a dead-centre bolt on the in-window port still detonates it (you CAN hit when aimed)', () => {
    // The tightening must not make the port unhittable — a shot actually ON the
    // hole still wins. Guards against over-shrinking the sphere.
    const base = trench(portAt([0, 0, IN_WINDOW_Z]), { trenchShotsFired: 2 })
    const s1 = stepGame({ ...base, projectiles: [bolt([0, 0, IN_WINDOW_Z])] }, NO_INPUT, 0.001)
    expect(hit(s1.events)).toBe(true)
    expect(s1.exhaustPort).toBeNull()
  })

  it('a REAL torpedo fired with the yoke hard over veers off-axis and does NOT detonate the dead-centre port', () => {
    // Fire-path coverage for "aim alignment": a bolt inherits the yoke deflection
    // (aimDirection(aimX,…)), so a shot fired while steering hard away flies wide of
    // the centred port and cannot win. (Not RED — a hard-over bolt misses even the old
    // 120 sphere — but it keeps a sneaky GREEN from special-casing hand-placed bolts.)
    const HARD_OVER: Input = { aimX: 0.9, aimY: 0, fire: true, aspect: 1 }
    const events: GameEvent[] = []
    let s = stepGame(trench(portAt([0, 0, -600])), HARD_OVER, FRAME)
    events.push(...s.events)
    for (let i = 0; i < 30 && s.phase === 'trench'; i++) {
      s = stepGame(s, NO_INPUT, FRAME)
      events.push(...s.events)
    }
    expect(hit(events)).toBe(false)
    expect(s.phase).toBe('trench') // never cleared the run
  })
})

// ---------------------------------------------------------------------------
// gate the hit/miss test to the ROM's narrow approach window (the $800 window)
// ---------------------------------------------------------------------------

describe('sw3-15 — the hit/miss decision is gated to the narrow approach window (ROM $800)', () => {
  it('a single centred torpedo fired at TRENCH ENTRY no longer wins — the finish is not unmissable', () => {
    // THE headline defect. Today one centred bolt fired down the full trench (port at
    // -EXHAUST_PORT_DISTANCE) detonates the port and clears the run — it never fails.
    // The ROM resolves the hit/miss only inside the narrow end-wall window; a shot
    // fired at entry crosses the port far outside it, so it must NOT count, and the
    // port slips through to a REAL miss that costs a shield.
    const { state, events, frames } = fireAndFollowPort(trench(portAt([0, 0, -EXHAUST_PORT_DISTANCE])), 320)
    expect(hit(events)).toBe(false) // the early shot did not land
    expect(state.phase).toBe('trench') // it never warped the run out to space
    expect(missed(events)).toBe(true) // the port slipped past → a distinct miss cue
    expect(state.lives).toBeLessThan(STARTING_LIVES) // ...and missing costs a shield (real stakes)
    expect(frames).toBe(320) // no early warp-out — the run played on to the miss
  })

  it('a centred torpedo that meets the port INSIDE the near-cockpit window still detonates it', () => {
    // The gate must restore challenge without making the port impossible: a well-timed
    // shot that meets the port in the approach window still wins, cleanly.
    const { state, events } = fireAndFollowPort(trench(portAt([0, 0, IN_WINDOW_Z])))
    expect(hit(events)).toBe(true)
    expect(state.phase).toBe('space') // the winning shot cleared the run
    expect(state.lives).toBe(STARTING_LIVES) // a clean win costs no shield
  })
})

// ---------------------------------------------------------------------------
// the tightened / windowed outcome stays a pure, deterministic core
// ---------------------------------------------------------------------------

describe('sw3-15 — the restored challenge preserves core purity & determinism', () => {
  it('the same seed + inputs yields an identical run (no ad-hoc randomness in the port)', () => {
    // The port stays dead-centre (the ROM porthole is a FIXED location) — the fix adds
    // no RNG. A naive entry-shot run must resolve bit-identically twice over. A wall
    // clock or Math.random in the new gate would diverge the terminal state here.
    const mk = (): GameState => trench(portAt([0, 0, -EXHAUST_PORT_DISTANCE]), {}, 7)
    const a = fireAndFollowPort(mk(), 320)
    const b = fireAndFollowPort(mk(), 320)
    expect(a.events).toEqual(b.events)
    expect(a.state).toEqual(b.state)
  })

  it('resolving the outcome never mutates the input state', () => {
    const s0: GameState = {
      ...trench(portAt([0, 0, IN_WINDOW_Z]), { trenchShotsFired: 2 }),
      projectiles: [bolt([0, 0, IN_WINDOW_Z])],
    }
    const beforePort: Vec3 | null = s0.exhaustPort ? ([...s0.exhaustPort.pos] as Vec3) : null
    const beforeLives = s0.lives
    stepGame(s0, NO_INPUT, 0.001)
    expect(s0.exhaustPort ? s0.exhaustPort.pos : null).toEqual(beforePort) // input untouched
    expect(s0.lives).toBe(beforeLives)
  })
})
