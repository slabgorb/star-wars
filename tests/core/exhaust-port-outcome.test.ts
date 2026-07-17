// tests/core/exhaust-port-outcome.test.ts
//
// Story sw2-4 — exhaust-port OUTCOME FEEDBACK (RED phase).
//
// The live-playtest defect: firing the torpedo into the exhaust port produces NO
// outcome feedback. On a HIT the Death Star does not visibly blow — the run just
// silently loops back to the next wave's space phase — and on a MISS there is no
// distinct "you missed" indication; the port slipping past reads as a generic
// crash. The climactic beat of the game currently has no payoff.
//
// Today (`stepTrench`, src/core/sim.ts:503-544) the port-hit branch emits only
// `force-bonus` (clean runs), `speech`, and `level-clear`, then `clearRun` warps
// to space — there is NO dedicated "Death Star destroyed / explosion" cue. The
// only miss path is the port reaching the cockpit → `terrain-crash` + a fresh
// pass, with nothing that says "the shot missed the port."
//
// This suite pins the CORE contract sw2-4 asks DEV to implement. The core emits
// the EVENT (deterministic, testable); the shell owns the explosion visual and
// the miss sound (render.ts / audio.ts) — the sacred core/shell boundary holds.
//
//   GameEvent (src/core/events.ts) gains two variants:
//     { type: 'death-star-destroyed'; pos: Vec3 }   // the winning-shot explosion,
//                                                    //   positioned like enemy-death
//                                                    //   / fireball-destroyed
//     { type: 'exhaust-port-missed' }                // the port slipped past the
//                                                    //   cockpit un-destroyed —
//                                                    //   distinct from terrain-crash
//
//   Contract:
//     1. A player bolt destroying the port emits `death-star-destroyed`, carrying
//        the port's WORLD position, and it is emitted BEFORE `level-clear` so the
//        shell can stage the explosion before the warp to the next wave.
//     2. The hit's existing payoff is preserved — the run still clears, scores
//        TRENCH_BONUS, and cues Han's "great shot" speech line.
//     3. A REAL torpedo fired at PROJECTILE_SPEED and followed at 60fps reliably
//        detonates a dead-centre port (no tunneling — the sw2-1 finding), and a
//        real wide shot reliably does NOT detonate it (the negative case sw2-2's
//        review found missing for fireballs, directed here for the port).
//     4. The port reaching the cockpit un-destroyed emits `exhaust-port-missed`,
//        a cue distinct from `terrain-crash`; a single errant bolt mid-flight is
//        NOT a miss (you can fire again) and emits no such cue.
//
// Like the Wave 1/2 RED suites and the sw2-2 fireball suite, these drive
// behaviour through the pure surface — stepGame(state, input, dt) and the
// GameState it returns — asserting observable gameplay, never internal shape, and
// obey the sacred boundary: no DOM, no time except dt, no randomness except the
// seeded RNG in state. The two new event types don't exist yet, so `tsc` is red
// until GREEN adds them (the established convention here); vitest runs regardless
// and reports the emission contract as failing.
//
// -- ⚠ RE-SEATED BY sw7-17 / R11b: HOW THE KILL IS STAGED --------------------
//
// The outcome contract above is untouched — every cue, stamp and payoff is asserted exactly as
// sw2-4 wrote it. What moves is the fixture underneath, because "a player bolt destroying the
// port" no longer names anything that exists. The gun is now the cabinet's HITSCAN beam (audit
// G-004): it spawns NOTHING, so a bolt parked on the port is unbuildable in play, and a step with
// the trigger up fires no beam at all — which would have quietly turned this suite's miss cases
// into tests that shoot nothing and find the port standing.
//
// Two different replacements, because the tests want two different things:
//
//   • The OUTCOME tests (the cue, the stamps, the payoff, the last-instant save) stage the run at
//     the frame it is won — port in the $800 window, `portTorpedoArmed: true`. That is not a
//     shortcut; it is the ROM's own shape, and now the sim's. The pilot flies 768 above a porthole
//     lying in the floor, so from inside the window the hole is ~44° down against a 30° cone: the
//     shot CANNOT be taken from there, by anyone. WSLAZR arms the torpedo out where the hole is
//     reachable (`?LAZAR GOT CLOSE ENUF TO FIRE PROTON TORPS?` → `JSR FRPTGN`) and WSMAIN resolves
//     it at the wall (`LDA PT.LIV`). An armed port scrolling into the window is precisely what a
//     pilot who threaded the hole at the mouth is flying, and it lets each test below vary the one
//     thing it cares about while the step changes nothing else.
//   • The SHOT tests (the miss cases, the real-fired torpedo) aim and pull for real, from the
//     trench mouth where the yoke can reach — and assert reachability first, since `aimAt` does
//     not clamp and would otherwise hand back a direction no player could hold.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TRENCH_BONUS,
  TRENCH_SCROLL_SPEED,
  PORT_HIT_RADIUS,
  COCKPIT_HIT_RADIUS,
  towersForWave,
  STARTING_LIVES,
  type GameState,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'
import type { Vec3 } from '@arcade/shared/math3d'
import { FIRE_AT_PORT, aimAt, eyeOf, fireAt } from '../support/aim'
import { EXHAUST_PORT_DISTANCE } from '../../src/core/state'

/** A live exhaust port at a world position — the hit-test reads `.pos`. */
const portAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

/** A fresh trench run with an explicit exhaust port. initialState seeds a live trigger
 *  (`fireCooldown: 0`, and `firePrev: false` — under the edge-triggered gun a state carrying
 *  `firePrev: true` would fire nothing), so a `FIRE` frame really pulls it. */
const trench = (
  port: { pos: Vec3 } | null,
  over: Partial<GameState> = {},
  seed = 1983,
): GameState => ({ ...initialState(seed), phase: 'trench', exhaustPort: port, ...over })

/** The run staged on the frame it is WON: the port has scrolled into the $800 window with the
 *  proton torpedo already armed by a laser that threaded the hole back at the trench mouth. The
 *  successor to `bolt(port)` — see the sw7-17 note in the header for why the kill cannot be staged
 *  as a shot from in here, and never could have been since sw5-6 put the porthole in the floor. */
const wonAt = (pos: Vec3, over: Partial<GameState> = {}): GameState =>
  trench(portAt(pos), { portTorpedoArmed: true, ...over })

// One real 60fps frame.
const FRAME = 1 / 60

// Trigger held, aim dead-centre, square aspect: the sim spawns a bolt at the
// cockpit with velocity = aimDirection(0,0,1) * PROJECTILE_SPEED = [0,0,-5000],
// flying straight down the trench. A REAL fired bolt, not a hand-placed one.
// sw5-6: RE-SEATED. A centred crosshair no longer points at the port — the pilot now flies 768
// above the floor and the port lies IN it, so `aimY: 0` points at the vanishing point. FIRE_AT_PORT
// puts the crosshair ON the target, which is what this suite always meant by "fire".
const FIRE: Input = FIRE_AT_PORT

/**
 * Fire ONE real bolt down the trench, then coast at a true 60fps, collecting the
 * event stream every frame (events are fresh per step, so the detonation/miss cue
 * lands on a single frame and must be gathered across the flight). Stops when the
 * run leaves the trench (a hit warps to space) or the frame budget runs out.
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

// --- AC1/AC2: a hit blows the Death Star (positioned cue, before the warp) ----

describe('sw2-4 — destroying the port emits a Death-Star-destroyed cue', () => {
  it('emits a positioned `death-star-destroyed` event carrying the port position', () => {
    // trenchShotsFired: 2 keeps this about the explosion cue, not the clean-run
    // "Use the Force" bonus (that path is force-bonus.test.ts's concern).
    const s0 = wonAt([0, 0, -300], { trenchShotsFired: 2 })
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    const cue = s1.events.find((e) => e.type === 'death-star-destroyed')
    expect(cue).toBeDefined()
    // Positioned like enemy-death / fireball-destroyed, and at the port's EXACT
    // scrolled world spot on the kill frame — [0,0,-300] advanced one micro-tick's
    // scroll toward the cockpit (TRENCH_SCROLL_SPEED × dt) — not the cockpit origin
    // and not a stale pre-scroll point. Exact value, tied to the scroll constant.
    expect(cue).toMatchObject({
      type: 'death-star-destroyed',
      pos: [0, 0, -300 + TRENCH_SCROLL_SPEED * 0.001],
    })
  })

  it('emits the explosion AND the level-clear warp on the same kill frame', () => {
    // The boom and the warp fire together on the killing frame. We do NOT pin their
    // array ORDER: the shell's audio pump is an order-insensitive switch, and the
    // render layer stages the explosion off the persisted `deathStarDestroyedAt`
    // stamp (covered below), never off event position — so array order carries no
    // behavioural contract. What matters is that both cues are present to react to.
    const s0 = wonAt([0, 0, -300], { trenchShotsFired: 2 })
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.events.some((e) => e.type === 'death-star-destroyed')).toBe(true)
    expect(s1.events).toContainEqual({ type: 'level-clear', next: 'space' })
  })

  it('preserves the existing payoff — the run still clears, scores, and cues speech', () => {
    // sw7-2: Han's line is wave-gated to human {4,6,8,...} (WSMAIN:1919). Kill the port
    // on wave 4 (a speaking wave) so the winning-shot line still asserts alongside the
    // clear/score payoff; the wave-gate map itself is in wave-parity-gates.test.ts.
    const base = wonAt([0, 0, -300], { wave: 4, score: 500, trenchShotsFired: 2 })
    const s1 = stepGame(base, NO_INPUT, 0.001)
    expect(s1.exhaustPort).toBeNull() // destroyed
    expect(s1.phase).toBe('space') // warped to the next wave
    expect(s1.wave).toBe(5)
    expect(s1.score).toBe(500 + TRENCH_BONUS) // the bonus still lands
    // Han's winning-shot line still fires on the port kill (sw2-5, wave-gated by sw7-2)
    // — the new explosion cue rides ALONGSIDE it, not instead of it.
    expect(s1.events).toContainEqual({ type: 'speech', line: 'greatShotKidThatWasOneInAMillion' })
  })

  it('a shot that misses the port emits no explosion cue and leaves it standing', () => {
    // RE-SEATED BY sw7-17. This parked a bolt at x=9,999 and stepped with the trigger UP, which
    // under a hitscan gun fires no beam whatsoever — "no explosion" would have held however broken
    // the hit test was. The miss is now a real pull with the crosshair off the hole, taken from the
    // trench mouth where the yoke can reach (9,999 lateral is not a yoke position: from here it
    // needs |aimX| ≈ 7). The offset is a multiple of the hit radius, so it re-seats itself.
    const PORT_Z = -EXHAUST_PORT_DISTANCE
    const OFF_AXIS = PORT_HIT_RADIUS * 6 // 648u out — far outside any plausible sphere
    const base = trench(portAt([0, 0, PORT_Z]))
    expect(aimAt([OFF_AXIS, 0, PORT_Z], eyeOf(base)).reachable).toBe(true)
    const s1 = stepGame(base, fireAt(base, [OFF_AXIS, 0, PORT_Z]), FRAME)
    expect(s1.events.some((e) => e.type === 'fire'), 'he really did pull the trigger').toBe(true)
    expect(s1.portTorpedoArmed, 'the laser never got close enuf').toBe(false)
    expect(s1.events.some((e) => e.type === 'death-star-destroyed')).toBe(false)
    expect(s1.exhaustPort).not.toBeNull()
  })
})

// --- AC3: real-fired torpedo — no tunneling on hit, no false hit on a wide shot

describe('sw2-4 — a real-fired shot detonates the port (whole-run coverage)', () => {
  it('a dead-centre shot fired at the trench mouth detonates the port at 60fps', () => {
    // The sw2-1 tunneling finding directed here: the existing port tests hand-place
    // unit bolts on a 0.001s tick; none fire at 5000 u/s and follow at 60fps, where
    // a dead-on torpedo sits inside the (post-sw3-15, octagon-tight) hit sphere for
    // only a frame or two. A torpedo that visibly flies into the port MUST register.
    // Re-seated in-window (sw3-15): the hit/miss now resolves only in the ROM's narrow
    // $800 end-wall window, so the port is placed near the cockpit — well inside it —
    // rather than the mid-trench -1500 this predates the window gate; the no-tunnel
    // coverage (real speed through a small sphere) is unchanged, and tighter if anything.
    // ⚠ RE-SEATED BY sw5-6 (user-approved). This staged the port at -300 — inside the window —
    // and fired. That is now an IMPOSSIBLE shot: the pilot flies 768 above a floor-mounted
    // porthole, so at 300 units the hole is 68.7° below him against a 30° cone. The ROM never
    // asked for that shot; WSLAZR arms the torpedo when a laser gets close enuf, and WSMAIN reads
    // the flag at the window. So the port is seated where the shot can actually be THREADED, and
    // the run is followed to the window.
    //
    // ⚠ AND RE-NARRATED BY sw7-17: there is no PROJECTILE_SPEED in this any more, which is why the
    // name lost it. The no-tunnel worry the whole title carried — "a 12,000 u/s bolt still has to
    // register against a small sphere at a true 60fps, which is what the swept arming test is for"
    // — is simply gone: the beam is a ray and has nothing to tunnel through. What survives, and is
    // what this test is now worth, is the END-TO-END witness: a real pull of a real trigger at a
    // real range, flown the whole length of the trench, actually wins the game. Nothing about it
    // is stubbed. The frame-rate independence that replaced the tunnelling contract lives in
    // swept-port-collision.test.ts.
    const base = trench(portAt([0, 0, -EXHAUST_PORT_DISTANCE]))
    const { state, events } = fireAndFollowPort(base, 320)
    expect(state.exhaustPort).toBeNull() // detonated, not tunneled through
    expect(state.phase).toBe('space') // the winning shot cleared the run
    expect(events.some((e) => e.type === 'death-star-destroyed')).toBe(true)
    expect(state.lives).toBe(STARTING_LIVES) // destroying it is never a crash
  })

  it('a real wide shot flies past and does NOT detonate the port (no false hit)', () => {
    // The negative case sw2-2's review found missing. The port sits well off-axis —
    // a multiple of PORT_HIT_RADIUS, so it stays outside the sphere even if a future
    // story widens the radius (WYSIWYG) — so a straight-ahead shot never touches
    // it. The offset is DERIVED from the constant (guarded below), not hardcoded, so
    // it can't silently rot if PORT_HIT_RADIUS is re-tuned (it already moved 90→120).
    //
    // sw7-17: this one needed no re-seating at all — it always fired FIRE_AT_PORT for real and
    // moved the PORT off-axis rather than hand-placing anything, so the hitscan beam simply flies
    // where the bolt used to and misses the same way.
    const OFF_AXIS = PORT_HIT_RADIUS * 6 // 648u today — far outside any plausible sphere
    expect(OFF_AXIS).toBeGreaterThan(PORT_HIT_RADIUS)
    // An off-axis port can NEVER satisfy the cockpit-crash test: `stepTrench` only
    // scrolls z, so the port holds x=OFF_AXIS and its 3D distance to the cockpit is
    // always ≥ OFF_AXIS ≫ COCKPIT_HIT_RADIUS — the 45-frame cap is just a bound on a
    // no-op flight, not what prevents a confounding cockpit-arrival miss.
    const base = trench(portAt([OFF_AXIS, 0, -1500]))
    const { state, events } = fireAndFollowPort(base, 45)
    expect(events.some((e) => e.type === 'death-star-destroyed')).toBe(false)
    expect(events.some((e) => e.type === 'exhaust-port-missed')).toBe(false) // no confound
    expect(state.exhaustPort).not.toBeNull() // still standing, un-hit
    expect(state.phase).toBe('trench') // the run did not clear
    expect(state.lives).toBe(STARTING_LIVES) // and nothing crashed
  })
})

// --- AC4: the port slipping past the cockpit is a distinct MISS -------------

describe('sw2-4 — a missed run gives a clear miss indication', () => {
  it('the port reaching the cockpit un-destroyed emits `exhaust-port-missed`', () => {
    const base = trench(portAt([0, 0, 0])) // arrived at the cockpit, never hit
    const s1 = stepGame(base, NO_INPUT, 0.001)
    expect(s1.events.some((e) => e.type === 'exhaust-port-missed')).toBe(true)
  })

  it('the miss cue rides ALONGSIDE terrain-crash as its own distinct event', () => {
    // The story's core ask: a miss must not read as "nothing" or as a generic
    // scrape. The port slipping past emits BOTH cues on the same frame — the crash
    // (physics: a shield is lost) AND a dedicated `exhaust-port-missed` so the shell
    // can say "YOU MISSED". This asserts co-occurrence of two DISTINCT event types,
    // not one replacing the other (and is not the earlier tautology of comparing an
    // event's own type against a literal it can never equal).
    const base = trench(portAt([0, 0, 0]))
    const s1 = stepGame(base, NO_INPUT, 0.001)
    expect(s1.events.some((e) => e.type === 'exhaust-port-missed')).toBe(true)
    expect(s1.events.some((e) => e.type === 'terrain-crash')).toBe(true)
    // Two separate entries in the stream, not a single conflated cue.
    const kinds = s1.events.map((e) => e.type)
    expect(kinds.filter((k) => k === 'exhaust-port-missed' || k === 'terrain-crash')).toHaveLength(2)
  })

  it('a missed pass still costs a shield (the miss adds a cue, it does not remove the stakes)', () => {
    const base = trench(portAt([0, 0, 0]))
    const s1 = stepGame(base, NO_INPUT, 0.001)
    expect(s1.lives).toBe(base.lives - 1)
  })

  it('a stray shot with the port still downrange is NOT a miss', () => {
    // A miss is the port slipping PAST the cockpit — gated purely on
    // COCKPIT_HIT_RADIUS — never on shots. So a stray shot (here far off-axis,
    // physically unable to reach the on-axis port) fired while the port is still
    // approaching yields NO miss across many frames. The port sits several cockpit-radii
    // downrange (tied to the constant, not a magic number); it scrolls toward the
    // cockpit but never arrives in the window, and the run simply continues.
    //
    // RE-SEATED BY sw7-17, and the last line INVERTED rather than dropped. The stray used to be a
    // bolt hand-placed at x=9,999 and watched to make sure it was "still in flight" — a state the
    // player can no longer produce, since the hitscan gun spawns nothing (audit G-004). So the
    // stray is now a real trigger pull that goes wide, and the flight assertion becomes its exact
    // opposite and equally real successor: nothing is in flight, ever, and the miss cue STILL does
    // not fire. That is the same guard, and a stronger statement of it — the cue is the port's
    // business, and it is not merely indifferent to what the gun launched, there is nothing to be
    // indifferent to.
    const portZ = -COCKPIT_HIT_RADIUS * 5 // 400u ahead — nowhere near arrival
    const s0 = trench(portAt([0, 0, portZ]))
    // The port itself is unaimable from here (~62° down), which is the point — the pilot's shot
    // goes down the trench, where the yoke actually reaches, and the port is nowhere near it.
    const wide: Vec3 = [EXHAUST_PORT_DISTANCE / 2, 0, -EXHAUST_PORT_DISTANCE]
    expect(aimAt(wide, eyeOf(s0)).reachable).toBe(true)
    let s = stepGame(s0, fireAt(s0, wide), FRAME)
    expect(s.events.some((e) => e.type === 'fire'), 'he really did pull the trigger').toBe(true)
    expect(s.portTorpedoArmed, 'and it really did go wide').toBe(false)
    for (let i = 0; i < 5; i++) {
      s = stepGame(s, NO_INPUT, FRAME)
      expect(s.events.some((e) => e.type === 'exhaust-port-missed')).toBe(false)
      expect(s.exhaustPort).not.toBeNull() // the port is still in the run
      expect(s.projectiles).toHaveLength(0) // ...and the shot was never an object at all
    }
  })
})

// --- State-field lifecycle: the stamps that carry the visual beat -----------
//
// The two GameState timestamps ARE the visible payoff mechanism — the shell reads
// them to stage the explosion/miss for a beat (the events alone are invisible once
// the same-frame warp fires). They must be stamped on the outcome, `clearRun` must
// carry `deathStarDestroyedAt` THROUGH the warp, and `enterPhase` must reset both.
// The sibling `forceBonusAwardedAt` is pinned exactly this way in force-bonus.test.ts;
// without these, a dropped re-stamp or reset ships silently (events still fire).

describe('sw2-4 — the outcome timestamps drive & survive the visual beat', () => {
  it('a hit stamps deathStarDestroyedAt (= this frame’s sim time), miss stamp stays null', () => {
    const s1 = stepGame(wonAt([0, 0, -300], { trenchShotsFired: 2 }), NO_INPUT, 0.001)
    expect(s1.deathStarDestroyedAt).toBe(s1.t) // stamped with THIS frame's sim time
    expect(s1.exhaustPortMissedAt).toBeNull() // a hit is not a miss
  })

  it('deathStarDestroyedAt SURVIVES the warp — still stamped once phase === space', () => {
    // The regression this field exists to prevent: clearRun warps to space the same
    // frame and enterPhase nulls the stamp; clearRun re-stamps it so the explosion
    // beat plays INTO the next wave. Drop the re-stamp and the boom/banner never show
    // after the kill — yet every event/score/phase assertion would still pass. Pin it.
    const s1 = stepGame(wonAt([0, 0, -300], { trenchShotsFired: 2 }), NO_INPUT, 0.001)
    expect(s1.phase).toBe('space') // warped
    expect(s1.deathStarDestroyedAt).not.toBeNull() // ...and the stamp rode along
  })

  it('a miss stamps exhaustPortMissedAt (= this frame’s sim time), hit stamp stays null', () => {
    const s1 = stepGame(trench(portAt([0, 0, 0])), NO_INPUT, 0.001)
    expect(s1.exhaustPortMissedAt).toBe(s1.t)
    expect(s1.deathStarDestroyedAt).toBeNull()
  })

  it('entering a fresh trench RESETS both stamps (no beat leaks across phases)', () => {
    // enterPhase nulls both on every phase entry, so a stale stamp from a prior run
    // can't re-trigger a banner in a new trench. Cross surface→trench carrying
    // non-null stamps and assert they are cleared on arrival.
    const surface: GameState = {
      ...initialState(1),
      phase: 'surface',
      phaseKills: towersForWave(1),
      turrets: [],
      enemyShots: [],
      deathStarDestroyedAt: 999,
      exhaustPortMissedAt: 999,
    }
    let s = surface
    for (let i = 0; i < 8 && s.phase === 'surface'; i++) s = stepGame(s, NO_INPUT, 0.001)
    expect(s.phase).toBe('trench') // crossed into the trench
    expect(s.deathStarDestroyedAt).toBeNull() // stale stamps cleared on entry
    expect(s.exhaustPortMissedAt).toBeNull()
  })
})

// --- Same-frame race: a last-instant kill beats the cockpit crash ------------

describe('sw2-4 — a killing shot on the arrival frame beats the crash', () => {
  it('a hit AND a cockpit-arrival the same frame resolves as a HIT (player-favouring)', () => {
    // The port is inside COCKPIT_HIT_RADIUS (would crash) AND the torpedo is armed on it (would
    // detonate) the same step. stepTrench checks the hit branch FIRST and returns, so
    // the player gets the last-instant save. Reorder the two if-blocks and this save
    // silently becomes a death — nothing else pins the precedence.
    //
    // sw7-17: an armed latch rather than a bolt on the port, and the race it pins is if anything
    // MORE real for it. A shot taken at -40 was always fiction (the hole is 87° below the pilot
    // there); a torpedo armed at the mouth and arriving with the port a half-radius from the
    // cockpit glass is the actual last-instant save the ROM stages.
    const portZ = -COCKPIT_HIT_RADIUS / 2 // inside the cockpit sphere → would crash un-hit
    const base = wonAt([0, 0, portZ], { trenchShotsFired: 2 })
    const s1 = stepGame(base, NO_INPUT, 0.001)
    expect(s1.events.some((e) => e.type === 'death-star-destroyed')).toBe(true) // hit won
    expect(s1.events.some((e) => e.type === 'exhaust-port-missed')).toBe(false) // not a miss
    expect(s1.events.some((e) => e.type === 'terrain-crash')).toBe(false) // not a crash
    expect(s1.lives).toBe(base.lives) // the last-instant save costs no shield
    expect(s1.phase).toBe('space') // the run cleared
  })
})

// --- Purity: the outcome cues carry no state mutation ------------------------

describe('sw2-4 — outcome feedback preserves core purity & determinism', () => {
  it('emitting the explosion never mutates the input state', () => {
    const s0 = wonAt([0, 0, -300], { trenchShotsFired: 2 })
    const beforePort: Vec3 | null = s0.exhaustPort ? [...s0.exhaustPort.pos] : null
    const beforeEvents = s0.events.length
    const stepped = stepGame(s0, NO_INPUT, 0.001)
    expect(stepped.events.some((e) => e.type === 'death-star-destroyed')).toBe(true) // it resolved
    expect(s0.exhaustPort ? s0.exhaustPort.pos : null).toEqual(beforePort) // input untouched
    expect(s0.events.length).toBe(beforeEvents)
  })

  it('the same seed + inputs yields an identical event stream AND terminal state', () => {
    // sw3-15: re-seated in-window — the hit/miss now resolves only in the ROM's
    // narrow $800 end-wall window; -1500 is outside it, so a full-trench shot no
    // longer resolves in a kill. -300 places the port where the run actually wins.
    // sw5-6: seated at spawn distance for the same reason as the real-speed test above — a shot
    // into the window is geometrically impossible now, so the kill is EARNED at entry and RESOLVES
    // at the window. Determinism is what this test is about, and it is unaffected.
    const mk = (): GameState => trench(portAt([0, 0, -EXHAUST_PORT_DISTANCE]), {}, 7)
    const a = fireAndFollowPort(mk(), 320)
    const b = fireAndFollowPort(mk(), 320)
    expect(a.events).toEqual(b.events)
    // Full terminal-state equality — catches an impure source in the new stamps
    // (a wall-clock/random timestamp would diverge here while the events matched).
    expect(a.state).toEqual(b.state)
    expect(a.state.deathStarDestroyedAt).not.toBeNull() // the run actually resolved in a kill
  })
})
