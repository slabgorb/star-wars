// tests/core/trench.test.ts
//
// Wave 3 — the trench run (story 8-9), RED phase.
//
// These tests define the GAMEPLAY contract for the trench run and are EXPECTED
// TO FAIL until the GREEN phase implements it. Today `stepTrench` is a safe
// terminal hold (story 8-8): the run arrives, the cockpit still tracks and
// fires, but nothing scrolls, scores, or damages. This suite replaces that hold
// with the real run, driving behaviour through the existing pure surface —
// `stepGame(state, input, dt)` and the `GameState` it returns — exactly as the
// Wave 1/2 suites do, so it asserts observable gameplay, not internal shape.
// Everything obeys the sacred boundary: no DOM, no time except `dt`, no
// randomness except the seeded RNG in state.
//
// Contract this suite asks DEV to implement (per context-story-8-9.md). In the
// trench phase a single target — the exhaust port — scrolls up the channel
// toward the cockpit; the player either destroys it (bonus + run cleared) or it
// reaches the cockpit and costs a shield:
//
//   GameState gains:
//     exhaustPort: { pos: Vec3 } | null   // the run's target; null = no active
//                                         // port (space/surface, or destroyed).
//
//   Constants (real-feel values recovered/derived from StarWars.asm in GREEN,
//   single-sourced in src/core/state.ts as the Wave 1/2 constants were):
//     EXHAUST_PORT_DISTANCE  // how far down -Z the port spawns when the trench opens
//     TRENCH_SCROLL_SPEED    // units/sec the port advances toward the cockpit (+Z)
//     TRENCH_BONUS           // score awarded for destroying the port
//     PORT_HIT_RADIUS        // (used by GREEN; tests place bolts dead-on so they
//                            //  never hard-code its value)
//
//   - Entering the trench (clearing the surface) spawns the port centred and far
//     down -Z; `stepTrench` scrolls it toward the cockpit every frame by dt.
//   - A player bolt within PORT_HIT_RADIUS destroys the port: it is consumed, the
//     bonus is awarded, no shield is lost, and the run CLEARS — TEA design
//     decision (see session deviation): "clears Wave 3" advances to the next wave
//     (wave+1, back to the space phase), engaging the wave difficulty ramp that
//     is otherwise dead code (`waveParams`/`state.wave` is never incremented
//     today). The story leaves post-clear behaviour open; this suite pins it.
//   - A port that reaches the cockpit un-destroyed costs one shield (mirrors the
//     surface crash); losing the last shield ends the run.
//   - A trench with no active port holds safely (preserves the 8-8 terminal-hold
//     edge case and exercises the null branch).
//
//   RENDER (AC4/AC5): the port's WORLD position lives in sim state
//   (`state.exhaustPort.pos`); `shell/render.ts` only CONSUMES it. Render exposes
//   a pure `trenchPlacement(state) -> { floor, port }` (the world points it draws
//   the TRENCH and EXHAUST_PORT models at), derived purely from state — mirroring
//   the surface suite's testing of render's display-orientation exports. The port
//   it returns equals the sim position (no static placeholder) and sits WITHIN
//   the trench floor channel, closing the ~244-unit float the 8-5 Reviewer found.
//   Orientation/scale stay an eyeball check (context-epic-8.md: "display
//   orientation is a render concern").
//
// Like the Wave 1/2 RED suites, this file references state fields, constants, and
// a render export the GREEN phase will add, so `tsc` is red until then while
// vitest runs and reports the contract as failing. Once GREEN lands it
// typechecks with no casts.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  EXHAUST_PORT_DISTANCE,
  TRENCH_SCROLL_SPEED,
  TRENCH_BONUS,
  SHIELD_BONUS_PER_UNIT,
  towersForWave,
  type GameState,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'
import { TRENCH } from '../../src/core/models'
import * as RenderModule from '../../src/shell/render'
import { FIRE_AT_PORT, fireAt } from '../support/aim'

// sw5-6: RE-SEATED — see tests/support/aim.ts. `aimY: 0` now points at empty sky, not the port.
const FIRE: Input = FIRE_AT_PORT

/** One real 60fps frame. */
const FRAME = 1 / 60

/** A live exhaust port at a world position — the hit-test reads `.pos`. */
const portAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

/** A fresh trench run with an explicit exhaust port (or none). */
const trench = (
  port: { pos: Vec3 } | null,
  over: Partial<GameState> = {},
  seed = 1983,
): GameState => ({ ...initialState(seed), phase: 'trench', exhaustPort: port, ...over })

/** A fresh surface run — the phase the trench is entered FROM. */
const surface = (seed = 1983): GameState => ({ ...initialState(seed), phase: 'surface' })

/**
 * SHOOT THE PORT AND FLY THE RUN OUT (RE-SEATED BY sw7-17 / R11b).
 *
 * These two AC2 tests used to say "the player shot the port" by hand-placing a bolt on top of it —
 * `projectiles: [bolt([0,0,-300])]` — and stepping once with the trigger up. That fixture is now
 * unbuildable in play: the laser is HITSCAN and the player's gun spawns NOTHING (audit G-004), so
 * nothing the player fires ever exists as an object to place. The honest replacement is not a
 * different fixture but a different sentence — AIM AT IT AND PULL THE TRIGGER — and it is strictly
 * stronger than the bolt was: it goes through the real aim, the real ship point and the real
 * resolve, so it fails if any of them break.
 *
 * It also has to fly, and that is the ROM's doing rather than ours. The beam ARMS the torpedo
 * early — at the trench mouth, the only range from which a floor-mounted porthole is inside the
 * yoke's cone at all (from the seat 768 above it, an in-window port is 43.8° down against a 30°
 * cone) — and the machine RESOLVES it late, when the port reaches the $800 end wall. So the shot
 * is one pull at -2,400 and then a coast; see the sw5-6 note in exhaust-port-challenge.test.ts.
 *
 * The trigger is released on every subsequent frame because one pull is one shot (G-012): holding
 * it would fire nothing anyway, and NO_INPUT also keeps the yoke from flying the eye off its seat.
 */
function fireAndFlyOut(s0: GameState, maxFrames = 400): GameState {
  let s = stepGame(s0, fireAt(s0, s0.exhaustPort!.pos), FRAME)
  for (let i = 1; i < maxFrames && s.phase === 'trench'; i++) s = stepGame(s, NO_INPUT, FRAME)
  return s
}

/** Step in small ticks until the phase leaves `from` (or give up after a few). */
function crossFrom(s: GameState, from: string, input: Input = NO_INPUT): GameState {
  for (let i = 0; i < 8 && s.phase === from; i++) s = stepGame(s, input, 0.001)
  return s
}

// --- AC1: the exhaust port scrolls up the run -------------------------------

describe('Wave 3 — the exhaust port scrolls toward the cockpit', () => {
  it('a trench run carries an exhaust port as its target', () => {
    const s = trench(portAt([0, 0, -EXHAUST_PORT_DISTANCE]))
    expect(s.exhaustPort).not.toBeNull()
    expect(Array.isArray(s.exhaustPort?.pos)).toBe(true)
    expect(s.exhaustPort?.pos).toHaveLength(3)
  })

  it('the port advances toward the cockpit (z rises toward 0) and holds the centreline', () => {
    const start: Vec3 = [0, 0, -EXHAUST_PORT_DISTANCE]
    const s0 = trench(portAt(start))
    const s1 = stepGame(s0, NO_INPUT, 0.05)
    expect(s1.exhaustPort).not.toBeNull()
    const moved = s1.exhaustPort!.pos
    expect(moved[2]).toBeGreaterThan(start[2]) // nearer the cockpit at z=0
    expect(moved[2]).toBeLessThan(0) // still ahead, down -Z
    expect(moved[0]).toBe(0) // dead ahead — the run does not drift the port sideways
  })

  it('the scroll is frame-rate independent (dt-driven, not per-frame)', () => {
    const start: Vec3 = [0, 0, -EXHAUST_PORT_DISTANCE]
    let many = trench(portAt(start))
    for (let i = 0; i < 10; i++) many = stepGame(many, NO_INPUT, 0.02)
    const once = stepGame(trench(portAt(start)), NO_INPUT, 0.2)
    // Same elapsed sim time (0.2s) — identical advance regardless of step count.
    expect(many.exhaustPort!.pos[2]).toBeCloseTo(once.exhaustPort!.pos[2], 5)
    // ...and the advance is exactly the scroll rate over the elapsed time.
    expect(once.exhaustPort!.pos[2] - start[2]).toBeCloseTo(TRENCH_SCROLL_SPEED * 0.2, 5)
  })

  it('entering the trench from the cleared surface spawns the port far downrange', () => {
    const s0: GameState = { ...surface(), phaseKills: towersForWave(1), turrets: [], enemyShots: [] }
    const s1 = crossFrom(s0, 'surface')
    expect(s1.phase).toBe('trench')
    expect(s1.exhaustPort).not.toBeNull()
    expect(s1.exhaustPort!.pos[2]).toBe(-EXHAUST_PORT_DISTANCE) // centred, far ahead
    expect(s1.exhaustPort!.pos[0]).toBe(0)
  })
})

// --- AC2: targeting the port & the bonus ------------------------------------

describe('Wave 3 — destroying the exhaust port', () => {
  it('a player shot on target destroys the port, launches nothing, scores the bonus, and costs no shield', () => {
    // trenchShotsFired: 2 — this test is about TRENCH_BONUS alone; a fresh
    // enterPhase() state starts at 0, which the fidelity epic's task 4 "Use the
    // Force" clean-run tell (trenchShotsFired <= 1) would also score FORCE_BONUS
    // on top (see tests/core/force-bonus.test.ts for that case).
    //
    // sw7-17: "is consumed" became "launches nothing", and it is a REAL assertion rather than a
    // weaker one. The bolt this line used to watch die was the fiction; the beam never was an
    // object, so the pilot pulls the trigger and `projectiles` — which now carries only the proton
    // torpedo and whatever a fixture hands the sim — stays empty from muzzle to detonation. Delete
    // the hitscan gun and put a travelling shot back, and this is the line that goes red.
    const base = trench(portAt([0, 0, -EXHAUST_PORT_DISTANCE]), { trenchShotsFired: 2 })
    const s1 = fireAndFlyOut(base)
    expect(s1.exhaustPort).toBeNull() // the port is destroyed
    expect(s1.projectiles).toHaveLength(0) // the gun spawned nothing to spend
    // sw7-4/S-013: the win also banks 5,000 x surviving shields (s1.lives, unchanged here).
    expect(s1.score).toBe(base.score + TRENCH_BONUS + SHIELD_BONUS_PER_UNIT * s1.lives) // the bonus is awarded
    expect(s1.lives).toBe(base.lives) // destroying it is not a crash
  })

  it('destroying the port CLEARS the run and advances to the next wave', () => {
    // trenchShotsFired: 2 — see the note above; keeps this test about the wave
    // transition, not the "Use the Force" bonus.
    const base = trench(portAt([0, 0, -EXHAUST_PORT_DISTANCE]), {
      wave: 1,
      score: 500,
      trenchShotsFired: 2,
    })
    const s1 = fireAndFlyOut(base)
    expect(s1.wave).toBe(2) // run cleared — loop back harder
    expect(s1.phase).toBe('space') // the next wave opens in the space phase
    expect(s1.phaseKills).toBe(0) // fresh phase counter
    expect(s1.exhaustPort).toBeNull() // no stale target carried into the next wave
    // sw7-4/S-013: the win also banks 5,000 x surviving shields (s1.lives).
    expect(s1.score).toBe(500 + TRENCH_BONUS + SHIELD_BONUS_PER_UNIT * s1.lives)
  })

  it('a shot that misses leaves the port intact, the score untouched, and the run going', () => {
    // RE-SEATED BY sw7-17. This used to park a bolt at x=9,999 and step with the trigger UP, which
    // under a hitscan gun asserts nothing at all: with no trigger pull there is no beam, so "the
    // port survived" would hold however broken the hit test was. The miss is now a real pull of the
    // trigger with the crosshair off the hole — the only way a player can miss.
    //
    // 9,999 lateral at this range is not aimable (the yoke would need |aimX| ≈ 7), so the wide shot
    // is stated as a fraction of the range: half the port's distance out, an unmistakable miss that
    // the yoke can still physically make. The sphere-tight near-miss band is
    // swept-port-collision.test.ts's business.
    const PORT_Z = -EXHAUST_PORT_DISTANCE
    const WIDE = EXHAUST_PORT_DISTANCE / 2
    const base = trench(portAt([0, 0, PORT_Z]))
    const s1 = stepGame(base, fireAt(base, [WIDE, 0, PORT_Z]), FRAME)
    expect(s1.portTorpedoArmed).toBe(false) // the laser never got close enuf
    expect(s1.exhaustPort).not.toBeNull() // still standing
    expect(s1.score).toBe(base.score) // a miss never scores
    expect(s1.phase).toBe('trench') // run continues
  })
})

// --- AC3: collision & death --------------------------------------------------

describe('Wave 3 — the port reaching the cockpit', () => {
  it('an un-destroyed port that reaches the cockpit costs one shield (no bonus, no clear)', () => {
    const base = trench(portAt([0, 0, 0])) // arrived at the cockpit, never hit
    const s1 = stepGame(base, NO_INPUT, 0.001)
    expect(s1.lives).toBe(base.lives - 1) // it cost exactly one shield
    expect(s1.score).toBe(base.score) // a crash never scores the bonus
    expect(s1.wave).toBe(base.wave) // and never clears the run
  })

  it('reaching the cockpit on the last shield ends the run', () => {
    const s0 = trench(portAt([0, 0, 0]), { lives: 1 })
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.lives).toBe(0)
    expect(s1.gameOver).toBe(true)
  })
})

// --- Boundary: determinism, purity & the null-port hold ----------------------

describe('Wave 3 — determinism, purity & the empty-trench hold', () => {
  it('advances identically for a fixed seed (deterministic, no ad-hoc randomness)', () => {
    const mk = (): GameState => trench(portAt([0, 0, -EXHAUST_PORT_DISTANCE]), {}, 7)
    let a = mk()
    let b = mk()
    for (let i = 0; i < 12; i++) {
      a = stepGame(a, FIRE, 0.05)
      b = stepGame(b, FIRE, 0.05)
    }
    expect(a).toEqual(b)
  })

  it('a step never mutates the input state’s exhaust port (purity)', () => {
    const s0 = trench(portAt([0, 0, -EXHAUST_PORT_DISTANCE]))
    const before: Vec3 = [...s0.exhaustPort!.pos]
    stepGame(s0, NO_INPUT, 0.05)
    expect(s0.exhaustPort!.pos).toEqual(before) // input untouched
  })

  it('a trench with no active port holds safely (no scroll, no score, no damage)', () => {
    let s = trench(null, { score: 1000, lives: 4, phaseKills: 999 })
    for (let i = 0; i < 50; i++) s = stepGame(s, FIRE, 0.1)
    expect(s.phase).toBe('trench') // nothing to clear → holds
    expect(s.exhaustPort).toBeNull()
    expect(s.score).toBe(1000) // no target to score
    expect(s.lives).toBe(4) // no hazard to take a shield
    expect(s.enemies).toHaveLength(0) // and the space spawner never leaks in
  })
})

// --- AC4/AC5: render consumes sim positions (no static-placeholder gap) -------
//
// Render placement (orientation/scale) is eyeball-verified, as the surface phase
// was; these tests only assert the structural contract that render derives the
// trench from SIM STATE and seats the port in the channel — catching the 8-5
// float (port at -1200 floating ~244 beyond a floor that ended at -892).

describe('Wave 3 — render seats the port from sim state', () => {
  // The TRENCH floor's own z half-depth (outer square spans z ∈ [-192, 192]),
  // derived from the model so the bound tracks the geometry, never a literal.
  const floorHalfDepth = Math.max(...TRENCH.vertices.map((v) => Math.abs(v[2])))

  it('render exports a well-formed TRENCH_ORIENT 4x4 matrix', () => {
    const m = RenderModule.TRENCH_ORIENT
    expect(Array.isArray(m)).toBe(true)
    expect(m).toHaveLength(16)
    expect((m as readonly number[]).every((n) => Number.isFinite(n))).toBe(true)
  })

  it('draws the exhaust port AT the sim position (consumes state, not a constant)', () => {
    const s = trench(portAt([0, 0, -520]))
    const { port } = RenderModule.trenchPlacement(s)
    expect(port).toEqual(s.exhaustPort!.pos) // render reads the sim port, verbatim
  })

  it('seats the port inside the trench floor channel (closes the 8-5 float)', () => {
    const s = trench(portAt([0, 0, -520]))
    const { floor, port } = RenderModule.trenchPlacement(s)
    // The port sits within the floor's z-span, not floating beyond its far edge.
    expect(port[2]).toBeGreaterThanOrEqual(floor[2] - floorHalfDepth)
    expect(port[2]).toBeLessThanOrEqual(floor[2] + floorHalfDepth)
    // ...and recessed into the same skim plane, not hovering above/below it.
    expect(port[1]).toBe(floor[1])
  })
})
