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
  towersForWave,
  PROJECTILE_TTL,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'
import { TRENCH } from '../../src/core/models'
import * as RenderModule from '../../src/shell/render'
import { FIRE_AT_PORT } from '../support/aim'

// sw5-6: RE-SEATED — see tests/support/aim.ts. `aimY: 0` now points at empty sky, not the port.
const FIRE: Input = FIRE_AT_PORT

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

// stepGame reads a bolt's `.pos` for the hit-test (and vel/ttl to advance it).
const bolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })

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
  it('a player bolt on target destroys the port, is consumed, scores the bonus, and costs no shield', () => {
    // trenchShotsFired: 2 — this test is about TRENCH_BONUS alone; a fresh
    // enterPhase() state starts at 0, which the fidelity epic's task 4 "Use the
    // Force" clean-run tell (trenchShotsFired <= 1) would also score FORCE_BONUS
    // on top (see tests/core/force-bonus.test.ts for that case).
    const base = trench(portAt([0, 0, -300]), { trenchShotsFired: 2 })
    const s0: GameState = { ...base, projectiles: [bolt([0, 0, -300])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.exhaustPort).toBeNull() // the port is destroyed
    expect(s1.projectiles).toHaveLength(0) // the bolt is spent
    expect(s1.score).toBe(base.score + TRENCH_BONUS) // the bonus is awarded
    expect(s1.lives).toBe(base.lives) // destroying it is not a crash
  })

  it('destroying the port CLEARS the run and advances to the next wave', () => {
    // trenchShotsFired: 2 — see the note above; keeps this test about the wave
    // transition, not the "Use the Force" bonus.
    const base = trench(portAt([0, 0, -300]), { wave: 1, score: 500, trenchShotsFired: 2 })
    const s0: GameState = { ...base, projectiles: [bolt([0, 0, -300])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
    expect(s1.wave).toBe(2) // run cleared — loop back harder
    expect(s1.phase).toBe('space') // the next wave opens in the space phase
    expect(s1.phaseKills).toBe(0) // fresh phase counter
    expect(s1.exhaustPort).toBeNull() // no stale target carried into the next wave
    expect(s1.score).toBe(500 + TRENCH_BONUS)
  })

  it('a bolt that misses leaves the port intact, the score untouched, and the run going', () => {
    const base = trench(portAt([0, 0, -300]))
    const s0: GameState = { ...base, projectiles: [bolt([9999, 0, -300])] }
    const s1 = stepGame(s0, NO_INPUT, 0.001)
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
