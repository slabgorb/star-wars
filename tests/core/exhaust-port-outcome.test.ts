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
  PROJECTILE_TTL,
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
    // Positioned like enemy-death / fireball-destroyed: a real Vec3 out in front
    // (the port's own down-range spot), not the cockpit origin.
    expect(cue && 'pos' in cue ? cue.pos : null).not.toBeNull()
    expect(cue && 'pos' in cue ? cue.pos.length : 0).toBe(3)
    expect(cue && 'pos' in cue ? cue.pos[2] : 0).toBeLessThan(0)
  })

  it('emits the explosion BEFORE the level-clear warp (explode, then jump to space)', () => {
    const base = trench(portAt([0, 0, -300]), { trenchShotsFired: 2 })
    const s0: GameState = { ...base, projectiles: [bolt([0, 0, -300])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    const boom = s1.events.findIndex((e) => e.type === 'death-star-destroyed')
    const warp = s1.events.findIndex((e) => e.type === 'level-clear')
    expect(boom).toBeGreaterThanOrEqual(0)
    expect(warp).toBeGreaterThanOrEqual(0)
    expect(boom).toBeLessThan(warp) // the shell can stage the boom before the warp
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
    // a dead-on torpedo sits inside the 120u sphere for only ~2-3 frames. A torpedo
    // that visibly flies into the port MUST register.
    const base = trench(portAt([0, 0, -1500]))
    const { state, events } = fireAndFollowPort(base)
    expect(state.exhaustPort).toBeNull() // detonated, not tunneled through
    expect(state.phase).toBe('space') // the winning shot cleared the run
    expect(events.some((e) => e.type === 'death-star-destroyed')).toBe(true)
    expect(state.lives).toBe(STARTING_LIVES) // destroying it is never a crash
  })

  it('a real wide shot flies past and does NOT detonate the port (no false hit)', () => {
    // The negative case sw2-2's review found missing. The port sits 800u off-axis
    // — far outside PORT_HIT_RADIUS (120) and any plausible WYSIWYG widening of it
    // (the octagon spans ~64) — so a straight-ahead torpedo can never touch it.
    // Only ~45 frames: enough for the bolt to pass the port's z-plane, but far too
    // few for the still-distant port to scroll to the cockpit (which would itself
    // count as a miss), isolating "the wide bolt did not detonate it."
    const base = trench(portAt([800, 0, -1500]))
    const { state, events } = fireAndFollowPort(base, 45)
    expect(events.some((e) => e.type === 'death-star-destroyed')).toBe(false)
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

  it('the miss cue is DISTINCT from a generic terrain-crash', () => {
    // The story's core ask: a miss must not read as "nothing" or as a generic
    // scrape. Whatever the shell does with terrain-crash, the port-miss carries its
    // own identity so "YOU MISSED" can be shown/heard.
    const base = trench(portAt([0, 0, 0]))
    const s1 = stepGame(base, NO_INPUT, 0.001)
    const miss = s1.events.find((e) => e.type === 'exhaust-port-missed')
    expect(miss).toBeDefined()
    expect(miss?.type).not.toBe('terrain-crash')
  })

  it('a missed pass still costs a shield (the miss adds a cue, it does not remove the stakes)', () => {
    const base = trench(portAt([0, 0, 0]))
    const s1 = stepGame(base, NO_INPUT, 0.001)
    expect(s1.lives).toBe(base.lives - 1)
  })

  it('a single errant bolt mid-flight is NOT a miss — no cue while the port still runs', () => {
    // A miss is the port slipping PAST, not one wide shot — you can fire again. The
    // cue must fire only when the run is actually lost, never on every stray bolt.
    const base = trench(portAt([0, 0, -1500]))
    const s0: GameState = { ...base, projectiles: [bolt([9999, 0, -1500])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.events.some((e) => e.type === 'exhaust-port-missed')).toBe(false)
    expect(s1.exhaustPort).not.toBeNull() // the port is still in the run
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

  it('the same seed + inputs yields an identical outcome-event stream', () => {
    const mk = (): GameState => trench(portAt([0, 0, -1500]), {}, 7)
    const a = fireAndFollowPort(mk())
    const b = fireAndFollowPort(mk())
    expect(a.events).toEqual(b.events)
  })
})
