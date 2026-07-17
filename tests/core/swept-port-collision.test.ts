// tests/core/swept-port-collision.test.ts
//
// Story sw4-4 — swept/substepped bolt-vs-port collision.
//
// ⚠⚠ THE PREMISE OF THIS FILE IS GONE (story sw7-17 / R11b). Read this before anything else.
//
// -- WHAT THIS SUITE WAS FOR --------------------------------------------------
//
// sw4-4 existed to kill a TUNNELLING bug. The port hit test was a per-frame POINT-in-sphere
// snapshot of the player's bolt — `collides(port, bolt.pos, PORT_HIT_RADIUS)` — and sw4-1 had
// restored that bolt to 12,000 u/s = 200 units per 60fps frame, against a hit sphere only ~216
// units across. A fast bolt could leap CLEAN OVER the sphere between two consecutive samples:
// in front of it one frame, past it the next, never touching it. The finish became unwinnable at
// speed. sw4-4's answer was `sweptCollides` — test the bolt's per-frame PATH against the sphere,
// never its endpoint alone, and never by inflating the radius.
//
// -- WHY IT IS GONE -----------------------------------------------------------
//
// sw7-17 replaced the player's travelling bolt with the cabinet's HITSCAN beam (audit G-004).
// There is no player projectile any more: the ROM draws the laser gun-ports → site every frame
// and resolves it INSTANTLY against the nearest object under the site, and WSLAZR.MAC contains
// no player shot and no lifetime anywhere. The port's arming test moved with it — it is now the
// ROM's own, `LDA PT.LZF / IFGT ;?LAZAR GOT CLOSE ENUF TO FIRE PROTON TORPS? / JSR FRPTGN`
// (WSLAZR.MAC:406-411) — and `sweptCollides` is no longer called from `stepTrench` at all.
//
// A HITSCAN BEAM CANNOT TUNNEL. It is not a point integrated forward through time; it is an
// exact ray, and it tests the WHOLE line at once. There is no "between two frames" for it to
// step over the port in, at any speed, at any dt. The property sw4-4 fought for is now free —
// it falls out of the model instead of being defended by a sweep.
//
// So this file is NOT deleted, and it is NOT left asserting nothing. It is re-pointed at the
// guarantee sw4-4 was actually protecting, which OUTLIVES the mechanism that protected it:
//
//     THE OUTCOME OF A SHOT MUST NOT DEPEND ON THE FRAME RATE, OR ON HOW FAR DOWN THE TRENCH
//     THE TARGET IS. The same aim wins the same run whether it is sampled once or a thousand
//     times, and it reaches the port at any range the cabinet allows.
//
// That is the same sentence sw4-4 wrote; only its enemy changed, from a bolt that skipped over
// the sphere to a beam that might have been range- or dt-limited and is not.
//
// -- WHICH TESTS BELOW STILL DISCRIMINATE, AND WHICH ARE NOW COVERAGE ----------
//
// Said plainly, because a green suite that proves nothing is worse than a red one:
//
//   • "arms at any range inside the clip" (the it.each) — COVERAGE. It is the direct heir of the
//     old 2×/4×/7×-diameter tunnel cases, but nothing can tunnel now, so it no longer catches a
//     class of bug: it exercises the beam across the reachable band and would only fire on a
//     range-dependent regression. Kept for that, and honest about it.
//   • "not one unit past the $7000 clip" — DISCRIMINATES, and it is new teeth. `TRENCH_FAR` is
//     the ROM's own forward line (CLBLZ `LDD #7000 ;FARTHEST FORWARD POINT`), the thing that has
//     replaced "how far can a shot get" now that flight time is gone. Nothing else in the repo
//     pins it against the port.
//   • "resolves on the trigger frame" — DISCRIMINATES. It is red the instant anyone gives the
//     player's shot travel time again; it cannot pass for any bolt speed whatsoever.
//   • "frame-rate independent" — DISCRIMINATES, and is the guarantee this file exists to keep.
//     It is the direct successor of the old coarse-vs-fine `flyAcross` pair, which was the
//     truest statement of the tunnelling bug (the outcome flipped with the frame rate).
//   • the radius/WYSIWYG bounds — UNCHANGED and still load-bearing. "Fix it by SWEEPING, not by
//     WIDENING" becomes "resolve it by RAY, not by WIDENING": the temptation to paper a miss
//     over with a fatter sphere survives the rewrite intact, so its guard does too.
//
// Everything here still drives behaviour through the pure surface — `stepGame(state, input, dt)`
// and the GameState/events it returns — asserting observable gameplay, never internal shape, and
// obeys the sacred boundary: no DOM, no time except dt, no randomness except the seeded RNG.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  PORT_HIT_RADIUS,
  PORT_APPROACH_WINDOW,
  EXHAUST_PORT_DISTANCE,
  STARTING_LIVES,
  type GameState,
} from '../../src/core/state'
import { EXHAUST_PORT } from '../../src/core/models'
import { TRENCH_FAR } from '../../src/core/trench-channel'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'
import type { Vec3 } from '@arcade/shared/math3d'
import { aimAt, eyeOf, fireAt } from '../support/aim'

/** A live exhaust port at a world position — the hit-test reads `.pos`. */
const portAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

/** A fresh trench run with an explicit exhaust port. `initialState` seats the pilot inside the
 *  ROM band (TRENCH_EYE_SEAT) with a live trigger — `fireCooldown: 0`, `firePrev: false` — so a
 *  `fireAt` frame really pulls it. Under the edge-triggered gun (G-012) that `firePrev` matters:
 *  a state carrying `firePrev: true` would fire NOTHING and every test here would be a lie. */
const trench = (
  port: { pos: Vec3 } | null,
  over: Partial<GameState> = {},
  seed = 1983,
): GameState => ({ ...initialState(seed), phase: 'trench', exhaustPort: port, ...over })

/** One real 60fps frame. */
const FRAME = 1 / 60

/**
 * The visible target's reach. RE-SEATED BY sw5-4: EXHAUST_PORT was an authored octagon
 * lying flat in the XZ plane (reach ~69.5); it is now the ROM's `PORT` — three
 * concentric squares whose third coordinate is the ROM's HEIGHT axis, so the plate lies FLAT IN
 * THE TRENCH FLOOR (sw5-6 corrected sw5-4, which read that third zero as depth and stood the plate
 * on its edge). The hole the player shoots is the
 * innermost (`.WGD PORT`'s red `;PORTHOLE` pen); the berm and base are the lip and the
 * Death Star surface around the shaft. Derived from the model so this contract cannot
 * rot if it is ever re-ported again.
 */
const PORTHOLE_HALF_WIDTH = 96 // `.PH 0C,0C,0` × .S=8 — the hole
const BERM_HALF_WIDTH = 160 //    `.PH 14,14,0` × .S=8 — the lip
const BASE_HALF_WIDTH = 256 //    `.PH 20,20,0` × .S=8 — Death Star surface
/** The porthole's corner reach — the WYSIWYG ceiling. ~135.8. */
const PORTHOLE_REACH = Math.hypot(PORTHOLE_HALF_WIDTH, PORTHOLE_HALF_WIDTH)

/** What the port model ACTUALLY ships, read in the plane the ROM plate lies in.
 *  Checked against the ROM constants above by the guard test — never used in their
 *  place, so a shrunken or re-authored port can never quietly satisfy the bounds. */
const MODEL_RINGS = [...new Set(EXHAUST_PORT.vertices.map((v) => Math.abs(v[0])))].sort(
  (a, b) => a - b,
)

const hit = (events: GameEvent[]): boolean => events.some((e) => e.type === 'death-star-destroyed')

/**
 * Aim the crosshair at a port `range` units downrange and pull the trigger ONCE, returning the
 * state one step later. This is the whole shot: the beam resolves inside that single step.
 *
 * ANTI-VACUOUS, and it matters more than it looks. `aimAt` deliberately does not clamp, so a
 * caller can ask the yoke to point somewhere it physically cannot (|NDC| > 1) and get a
 * confident-looking direction back that no player could ever produce. Every range this file
 * shoots at is therefore asserted REACHABLE first: the pilot flies TRENCH_EYE_SEAT = 768 above a
 * porthole lying in the floor, so a near port is STEEPLY below him and only ranges past
 * f·768 ≈ 1,330 are inside the 60° FOV's cone at all. (That is also why nothing here shoots the
 * -300/-500 ports the bolt-era version of this file used: from the seat those are 68° down.)
 */
function fireAtRange(range: number, dt = FRAME): GameState {
  const s0 = trench(portAt([0, 0, -range]), { trenchShotsFired: 2 })
  const target: Vec3 = [0, 0, -range]
  expect(aimAt(target, eyeOf(s0)).reachable, `the yoke can actually point at a port ${range} out`).toBe(true)
  return stepGame(s0, fireAt(s0, target), dt)
}

/**
 * Fly one whole run at a given step size: pull the trigger on the port at its spawn distance,
 * then coast with the trigger UP (one pull is one shot — G-012) until the run leaves the trench
 * or the sim-time budget runs out. Same physical shot, different sampling granularity — the
 * essence of frame-rate independence, and the direct heir of the old `flyAcross`.
 */
function flyTheRun(dt: number): { state: GameState; events: GameEvent[] } {
  const s0 = trench(portAt([0, 0, -EXHAUST_PORT_DISTANCE]), { trenchShotsFired: 2 })
  let s = stepGame(s0, fireAt(s0, [0, 0, -EXHAUST_PORT_DISTANCE]), dt)
  const events: GameEvent[] = [...s.events]
  const budget = Math.ceil(8 / dt) // 8 sim-seconds — the port needs 3.2s to scroll to the window
  for (let i = 0; i < budget && s.phase === 'trench'; i++) {
    s = stepGame(s, NO_INPUT, dt)
    events.push(...s.events)
  }
  return { state: s, events }
}

// ---------------------------------------------------------------------------
// The core defect, re-pointed: the beam reaches the port at any range inside the
// ROM's forward clip — and cannot tunnel, because it is a ray and not a point.
// ---------------------------------------------------------------------------

describe('sw4-4 → sw7-17 — the beam arms the port at any range inside the clip (nothing left to tunnel)', () => {
  it.each([2000, 2400, 6000, 12000, 24000])(
    'a beam aimed at a port %s units downrange arms the torpedo — one ray, no flight, no gap',
    (range) => {
      // COVERAGE, not discrimination — see the header. The old 2×/4×/7×-diameter cases lived here
      // and each one was a genuine tunnel: two sampled bolt positions straddling the sphere with
      // neither inside it. A ray has no sampled positions to straddle with, so what is left to
      // exercise is reach: the same aim connects from the trench mouth to nearly the clip.
      //
      // The near case is 2,000, not the old 1,400: the aim is computed on the port's SIGHTED
      // position and resolved one frame later, after the ROM scroll (B-008) has carried it ~262
      // units closer, so a very near port slides off the 108-unit porthole between sighting and
      // resolution. 2,000 keeps the whole band comfortably inside that one-frame reach — the same
      // "aim connects" claim, just honest about a target that now moves 31× faster.
      expect(range).toBeLessThan(TRENCH_FAR) // inside the ROM's forward line — see the next test
      const s1 = fireAtRange(range)
      expect(s1.portTorpedoArmed, 'the laser got close enuf — the torpedo launched').toBe(true)
      // ...and the ROM's own tell that it happened, so this cannot pass off a stale latch as a hit.
      expect(s1.events).toContainEqual({ type: 'tune', tune: 'deathKnell' })
    },
  )

  it('...but NOT one unit past the ROM clip — $7000 = 28,672 is the FARTHEST FORWARD POINT (CLBLZ)', () => {
    // DISCRIMINATES, and it is the new tooth in this file. With flight time gone, the only thing
    // bounding a shot's reach is the cabinet's own forward line: CLBLZ builds the trench beam
    // against a fixed endpoint $7000 ahead of the ship —
    //
    //     10$:  LDD #7000               ;FARTHEST FORWARD POINT
    //           ADDD M$TX+M.U1                                   (WSLAZR.MAC:417)
    //
    // — so a port beyond it is not under the beam at all, however clean the shot looks. Without
    // this the hitscan gun would out-reach the machine it is ported from by an unbounded margin.
    expect(TRENCH_FAR, 'the ROM number itself, not a tuned one').toBe(0x7000)

    const INSIDE = TRENCH_FAR - 2000
    const OUTSIDE = TRENCH_FAR + 2000

    // ANTI-VACUOUS, and the whole point of picking the pair this way: the FAR shot is the EASIER
    // aim of the two. A floor-mounted porthole rises toward the crosshair as it recedes, so the
    // 30,672 shot sits at |aimY| ≈ 0.04 against the 26,672 shot's 0.05 — both trivially inside the
    // yoke's throw. Nothing about pointing separates them. The ONLY difference is which side of
    // the ROM's forward line the port is on.
    const near = trench(portAt([0, 0, -INSIDE]))
    const far = trench(portAt([0, 0, -OUTSIDE]))
    const nearAim = aimAt([0, 0, -INSIDE], eyeOf(near))
    const farAim = aimAt([0, 0, -OUTSIDE], eyeOf(far))
    expect(nearAim.reachable).toBe(true)
    expect(farAim.reachable).toBe(true)
    expect(Math.abs(farAim.aimY), 'the clipped shot is the easier aim of the two').toBeLessThan(
      Math.abs(nearAim.aimY),
    )

    expect(fireAtRange(INSIDE).portTorpedoArmed, 'inside the line — the beam gets there').toBe(true)
    expect(fireAtRange(OUTSIDE).portTorpedoArmed, 'past the line — the beam simply stops').toBe(false)
  })

  it('the shot resolves on the TRIGGER FRAME itself — the beam has no flight time at all', () => {
    // DISCRIMINATES: this test cannot be made to pass by any travelling projectile, at any speed.
    // The bolt this file was written for did 12,000 u/s, so a 24,000-unit shot took two full
    // SECONDS to arrive; here the trigger frame is a MICRO-tick — 1 ms, in which sw4-1's bolt
    // would have moved 12 units of the 24,000 — and the torpedo is armed when it returns. That is
    // hitscan stated as behaviour rather than as a comment (audit G-004: the ROM's laser is drawn
    // gun-ports → site and collided in the same frame; there is no player shot in WSLAZR.MAC).
    const s1 = fireAtRange(24000, 0.001)
    expect(s1.portTorpedoArmed).toBe(true)
    // ...and nothing was launched to get there: the player's gun spawns no object, ever.
    expect(s1.projectiles).toHaveLength(0)
  })

  it('the outcome is frame-rate independent — one shot, five step sizes, the same won run', () => {
    // THE GUARANTEE THIS FILE EXISTS TO KEEP, and the truest statement of the bug sw4-4 killed:
    // the old coarse-vs-fine pair flipped the outcome with the frame rate (60 small samples landed
    // inside the sphere; one big step tunnelled past it). Stated over the whole run rather than a
    // single crossing, and over a 33× spread of step sizes — from a limping 30fps to a 1 ms tick.
    const framings = [1 / 30, 1 / 60, 1 / 120, 1 / 240, 1 / 1000]
    for (const dt of framings) {
      const { state, events } = flyTheRun(dt)
      expect(hit(events), `dt=${dt}: the same shot must win`).toBe(true)
      expect(state.phase, `dt=${dt}: the run cleared`).toBe('space')
      expect(state.lives, `dt=${dt}: a clean win costs no shield`).toBe(STARTING_LIVES)
    }
  })
})

// ---------------------------------------------------------------------------
// The fix must resolve by RAY, not by WIDENING — the target-tight radius & the
// $800 window hold. (sw5-4: the visible target is the ROM porthole, not the
// authored octagon.)
// ---------------------------------------------------------------------------

describe('sw4-4 — the fix preserves the target-tight radius and the approach window', () => {
  it('PORT_HIT_RADIUS stays target-tight (≤ the porthole you see) — the fix must not WIDEN', () => {
    // UNCHANGED by sw7-17, and still the story's headline constraint: anti-tunnelling must be
    // decoupled from the hit radius. Papering over a miss by inflating the sphere is forbidden —
    // that would re-break sw3-15's WYSIWYG finish. The sweep is gone; the temptation is not.
    //
    // RE-SEATED BY sw5-4. The old literal ceiling was 120 ("never restore the fat sphere
    // sw3-15 removed"), which was meaningful only against the authored octagon's ~70. The
    // ROM porthole reaches ~135.8, so 120 is now TIGHTER than the target and the old
    // ceiling would forbid a CORRECT radius. The intent — the sphere may never swell out
    // past the hole onto the surrounding structure — is preserved by ceiling it at the
    // porthole and the berm, which is what "don't widen" always meant.
    // The guard: the bounds are stated in the ROM's units, so they only mean anything
    // if the port we draw and collide against IS the ROM plate. If the model is ever
    // re-authored (as the octagon was), this fires first and the bound can be re-read
    // rather than silently rotting.
    expect(MODEL_RINGS, 'the port model is the ROM plate').toEqual([
      PORTHOLE_HALF_WIDTH,
      BERM_HALF_WIDTH,
      BASE_HALF_WIDTH,
    ])
    expect(PORT_HIT_RADIUS).toBeLessThanOrEqual(Math.ceil(PORTHOLE_REACH))
    expect(PORT_HIT_RADIUS, 'never out onto the berm').toBeLessThan(BERM_HALF_WIDTH)
  })

  it('a beam whose whole ray stays wider than the hit radius still misses (ray, not widened)', () => {
    // The direct heir of "a FAST bolt whose whole path stays wider than the hit radius still
    // misses", and it keeps GREEN honest exactly as that did: a lazy "just widen the radius" fix
    // would wrongly catch this shot. The bolt's PATH is now the beam's RAY, which is the same
    // geometry the old `sweptCollides` measured (perpendicular distance to a line) — only cast
    // from the ship rather than integrated from a muzzle.
    //
    // The offset is derived from the radius, so it re-seats itself: it is a NEAR miss —
    // outside the sphere, but still on the plate rather than a wild shot down the trench.
    const OFFSET = PORT_HIT_RADIUS + 25
    expect(OFFSET).toBeGreaterThan(PORT_HIT_RADIUS)
    expect(OFFSET, 'still on the plate — a near miss, not a wild shot').toBeLessThanOrEqual(BASE_HALF_WIDTH)
    const PORT_Z = -EXHAUST_PORT_DISTANCE
    const s0 = trench(portAt([0, 0, PORT_Z]), { trenchShotsFired: 2 })
    const s1 = stepGame(s0, fireAt(s0, [OFFSET, 0, PORT_Z]), FRAME)
    expect(s1.portTorpedoArmed, 'off the visible porthole → no arming, however clean the line').toBe(false)
    expect(hit(s1.events)).toBe(false)
    expect(s1.exhaustPort).not.toBeNull()
    // The control that makes the miss mean something: the SAME state, the SAME range, the only
    // change being that the crosshair is on the hole. Without this, an arming path that was simply
    // broken would sail through the assertion above.
    expect(stepGame(s0, fireAt(s0, [0, 0, PORT_Z]), FRAME).portTorpedoArmed).toBe(true)
  })

  it('the beam stays gated to the $800 approach window — arming far up the channel does not count', () => {
    // sw3-15's gate: the OUTCOME only resolves once the port has scrolled into the narrow
    // near-cockpit window. The beam must respect that gate — connecting with a port that is still
    // far up the channel must NOT detonate it (the port survives to scroll into the window on a
    // later frame). Guards against a fix that drops the window check.
    //
    // STRONGER than the bolt-era version, which could only show that nothing blew up: here the
    // beam demonstrably CONNECTED — `portTorpedoArmed` proves the laser got close enuf — and the
    // gate held the outcome anyway. That is precisely the ROM's shape: WSLAZR latches PT.LZF the
    // moment the laser is on the hole, and WSMAIN reads the flag later, at `SUBD #0800`.
    const FAR_Z = -EXHAUST_PORT_DISTANCE // the port's own spawn distance — the trench mouth
    expect(FAR_Z, 'well beyond the near-cockpit window').toBeLessThan(-PORT_APPROACH_WINDOW)
    const s1 = fireAtRange(EXHAUST_PORT_DISTANCE)
    expect(s1.portTorpedoArmed, 'the shot was earned...').toBe(true)
    expect(hit(s1.events), '...but outside the window it does not resolve').toBe(false)
    expect(s1.exhaustPort, 'the port survives to be resolved later').not.toBeNull()
    expect(s1.phase).toBe('trench')
  })
})

// ---------------------------------------------------------------------------
// The beam's outcome stays a pure, deterministic core
// ---------------------------------------------------------------------------

describe('sw4-4 — the beam collision preserves core purity & determinism', () => {
  it('a beam-armed run is deterministic — identical event stream and terminal state twice over', () => {
    // The ray math must add NO wall-clock and NO Math.random: the same shot resolves
    // bit-identically twice. A time- or RNG-sourced beam would diverge here.
    const a = flyTheRun(FRAME)
    const b = flyTheRun(FRAME)
    expect(a.events).toEqual(b.events)
    expect(a.state).toEqual(b.state)
    expect(hit(a.events)).toBe(true) // it actually resolved in a kill (non-vacuous)
  })

  it('resolving a beam hit never mutates the input state', () => {
    const s0 = trench(portAt([0, 0, -EXHAUST_PORT_DISTANCE]), { trenchShotsFired: 2 })
    const beforePort: Vec3 | null = s0.exhaustPort ? ([...s0.exhaustPort.pos] as Vec3) : null
    const beforeEye: Vec3 = [...s0.trenchView] as Vec3
    const beforeArmed = s0.portTorpedoArmed
    const stepped = stepGame(s0, fireAt(s0, [0, 0, -EXHAUST_PORT_DISTANCE]), FRAME)
    expect(stepped.portTorpedoArmed, 'the step really did resolve something').toBe(true)
    expect(s0.exhaustPort ? s0.exhaustPort.pos : null).toEqual(beforePort) // input port untouched
    expect(s0.trenchView).toEqual(beforeEye) // ...and the ship the beam was cast from
    expect(s0.portTorpedoArmed).toBe(beforeArmed) // ...and the latch it set on the way out
  })
})
