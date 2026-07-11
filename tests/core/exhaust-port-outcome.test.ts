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

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TRENCH_BONUS,
  TRENCH_SCROLL_SPEED,
  PROJECTILE_TTL,
  PORT_HIT_RADIUS,
  COCKPIT_HIT_RADIUS,
  towersForWave,
  STARTING_LIVES,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'
import type { Vec3 } from '@arcade/shared/math3d'

/** A live exhaust port at a world position — the hit-test reads `.pos`. */
const portAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

/** A fresh trench run with an explicit exhaust port. initialState seeds a live
 *  trigger (fireCooldown 0), so a `FIRE` frame spawns a real bolt immediately. */
const trench = (
  port: { pos: Vec3 } | null,
  over: Partial<GameState> = {},
  seed = 1983,
): GameState => ({ ...initialState(seed), phase: 'trench', exhaustPort: port, ...over })

// A hand-placed bolt at rest (unit -Z velocity, micro-tick friendly) — used only
// where the geometry is pinned dead-on and the real-speed flight is irrelevant.
const bolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })

// One real 60fps frame — the fireball suite's cadence: a fired bolt moves its
// true ~83 units/frame, so any per-frame collision gap has room to bite.
const FRAME = 1 / 60

// Trigger held, aim dead-centre, square aspect: the sim spawns a bolt at the
// cockpit with velocity = aimDirection(0,0,1) * PROJECTILE_SPEED = [0,0,-5000],
// flying straight down the trench. A REAL fired bolt, not a hand-placed one.
const FIRE: Input = { aimX: 0, aimY: 0, fire: true, aspect: 1 }

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
    const base = trench(portAt([0, 0, -300]), { trenchShotsFired: 2 })
    const s0: GameState = { ...base, projectiles: [bolt([0, 0, -300])] }
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
    const base = trench(portAt([0, 0, -300]), { trenchShotsFired: 2 })
    const s0: GameState = { ...base, projectiles: [bolt([0, 0, -300])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.events.some((e) => e.type === 'death-star-destroyed')).toBe(true)
    expect(s1.events).toContainEqual({ type: 'level-clear', next: 'space' })
  })

  it('preserves the existing payoff — the run still clears, scores, and cues speech', () => {
    const base = trench(portAt([0, 0, -300]), { wave: 1, score: 500, trenchShotsFired: 2 })
    const s0: GameState = { ...base, projectiles: [bolt([0, 0, -300])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.exhaustPort).toBeNull() // destroyed
    expect(s1.phase).toBe('space') // warped to the next wave
    expect(s1.wave).toBe(2)
    expect(s1.score).toBe(500 + TRENCH_BONUS) // the bonus still lands
    // Han's winning-shot line still fires on the port kill (sw2-5) — the new
    // explosion cue rides ALONGSIDE it, not instead of it.
    expect(s1.events).toContainEqual({ type: 'speech', line: 'greatShotKidThatWasOneInAMillion' })
  })

  it('a bolt that misses the port emits no explosion cue and leaves it standing', () => {
    const base = trench(portAt([0, 0, -300]))
    const s0: GameState = { ...base, projectiles: [bolt([9999, 0, -300])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.events.some((e) => e.type === 'death-star-destroyed')).toBe(false)
    expect(s1.exhaustPort).not.toBeNull()
  })
})

// --- AC3: real-fired torpedo — no tunneling on hit, no false hit on a wide shot

describe('sw2-4 — a real-fired torpedo detonates the port (real-speed coverage)', () => {
  it('a dead-centre torpedo fired at PROJECTILE_SPEED detonates the port at 60fps', () => {
    // The sw2-1 tunneling finding directed here: the existing port tests hand-place
    // unit bolts on a 0.001s tick; none fire at 5000 u/s and follow at 60fps, where
    // a dead-on torpedo sits inside the (post-sw3-15, octagon-tight) hit sphere for
    // only a frame or two. A torpedo that visibly flies into the port MUST register.
    // Re-seated in-window (sw3-15): the hit/miss now resolves only in the ROM's narrow
    // $800 end-wall window, so the port is placed near the cockpit — well inside it —
    // rather than the mid-trench -1500 this predates the window gate; the no-tunnel
    // coverage (real speed through a small sphere) is unchanged, and tighter if anything.
    const base = trench(portAt([0, 0, -300]))
    const { state, events } = fireAndFollowPort(base)
    expect(state.exhaustPort).toBeNull() // detonated, not tunneled through
    expect(state.phase).toBe('space') // the winning shot cleared the run
    expect(events.some((e) => e.type === 'death-star-destroyed')).toBe(true)
    expect(state.lives).toBe(STARTING_LIVES) // destroying it is never a crash
  })

  it('a real wide shot flies past and does NOT detonate the port (no false hit)', () => {
    // The negative case sw2-2's review found missing. The port sits well off-axis —
    // a multiple of PORT_HIT_RADIUS, so it stays outside the sphere even if a future
    // story widens the radius (WYSIWYG) — so a straight-ahead torpedo never touches
    // it. The offset is DERIVED from the constant (guarded below), not hardcoded, so
    // it can't silently rot if PORT_HIT_RADIUS is re-tuned (it already moved 90→120).
    const OFF_AXIS = PORT_HIT_RADIUS * 6 // 720u today — far outside any plausible sphere
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

  it('a stray shot in flight with the port still downrange is NOT a miss', () => {
    // A miss is the port slipping PAST the cockpit — gated purely on
    // COCKPIT_HIT_RADIUS — never on shots. So a live stray bolt (here far off-axis,
    // physically unable to reach the on-axis port) coexisting with a still-approaching
    // port yields NO miss across many frames. The port sits several cockpit-radii
    // downrange (tied to the constant, not a magic number); it scrolls toward the
    // cockpit but never arrives in the window, and the run simply continues.
    const portZ = -COCKPIT_HIT_RADIUS * 5 // 400u ahead — nowhere near arrival
    let s: GameState = { ...trench(portAt([0, 0, portZ])), projectiles: [bolt([9999, 0, portZ])] }
    for (let i = 0; i < 5; i++) {
      s = stepGame(s, NO_INPUT, FRAME)
      expect(s.events.some((e) => e.type === 'exhaust-port-missed')).toBe(false)
      expect(s.exhaustPort).not.toBeNull() // the port is still in the run
      expect(s.projectiles.length).toBeGreaterThan(0) // the stray bolt is still in flight
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
    const base = trench(portAt([0, 0, -300]), { trenchShotsFired: 2 })
    const s1 = stepGame({ ...base, projectiles: [bolt([0, 0, -300])] }, NO_INPUT, 0.001)
    expect(s1.deathStarDestroyedAt).toBe(s1.t) // stamped with THIS frame's sim time
    expect(s1.exhaustPortMissedAt).toBeNull() // a hit is not a miss
  })

  it('deathStarDestroyedAt SURVIVES the warp — still stamped once phase === space', () => {
    // The regression this field exists to prevent: clearRun warps to space the same
    // frame and enterPhase nulls the stamp; clearRun re-stamps it so the explosion
    // beat plays INTO the next wave. Drop the re-stamp and the boom/banner never show
    // after the kill — yet every event/score/phase assertion would still pass. Pin it.
    const base = trench(portAt([0, 0, -300]), { trenchShotsFired: 2 })
    const s1 = stepGame({ ...base, projectiles: [bolt([0, 0, -300])] }, NO_INPUT, 0.001)
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
    // The port is inside COCKPIT_HIT_RADIUS (would crash) AND a bolt is on it (would
    // detonate) the same step. stepTrench checks the hit branch FIRST and returns, so
    // the player gets the last-instant save. Reorder the two if-blocks and this save
    // silently becomes a death — nothing else pins the precedence.
    const portZ = -COCKPIT_HIT_RADIUS / 2 // inside the cockpit sphere → would crash un-hit
    const base = trench(portAt([0, 0, portZ]), { trenchShotsFired: 2 })
    const s1 = stepGame({ ...base, projectiles: [bolt([0, 0, portZ])] }, NO_INPUT, 0.001)
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
    const base = trench(portAt([0, 0, -300]), { trenchShotsFired: 2 })
    const s0: GameState = { ...base, projectiles: [bolt([0, 0, -300])] }
    const beforePort: Vec3 | null = s0.exhaustPort ? [...s0.exhaustPort.pos] : null
    const beforeEvents = s0.events.length
    stepGame(s0, NO_INPUT, 0.001)
    expect(s0.exhaustPort ? s0.exhaustPort.pos : null).toEqual(beforePort) // input untouched
    expect(s0.events.length).toBe(beforeEvents)
  })

  it('the same seed + inputs yields an identical event stream AND terminal state', () => {
    const mk = (): GameState => trench(portAt([0, 0, -1500]), {}, 7)
    const a = fireAndFollowPort(mk())
    const b = fireAndFollowPort(mk())
    expect(a.events).toEqual(b.events)
    // Full terminal-state equality — catches an impure source in the new stamps
    // (a wall-clock/random timestamp would diverge here while the events matched).
    expect(a.state).toEqual(b.state)
    expect(a.state.deathStarDestroyedAt).not.toBeNull() // the run actually resolved in a kill
  })
})
