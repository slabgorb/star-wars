// tests/core/trench-obstacles.test.ts
//
// Fidelity epic, task 3 — the trench's wall content as ENTITIES: shootable
// turrets and wall squares, and catwalk hazards spanning the channel. RED phase.
//
// Semantics (docs/star-wars-1983-source-findings.md ## Trench catwalks, turrets
// & wall squares, ## Scoring tables): turrets and squares are wall-mounted and
// shootable — a player shot within OBSTACLE_HIT_RADIUS destroys them and scores;
// catwalks are pure hazards — cockpit contact costs a shield (reuses the
// terrain-crash event) and removes the catwalk. All obstacles scroll toward the
// cockpit with the channel (TRENCH_SCROLL_SPEED) and despawn once they pass it.
//
// ⚠ RE-SEATED BY sw7-17 / R11b — the shooting half of this suite. It used to hand-place a bolt on
// top of each obstacle and step with the trigger up, because the player's gun threw a 12,000 u/s
// projectile you could stand still. The gun is now the cabinet's HITSCAN beam (audit G-004): it
// spawns nothing, so there is no bolt to place, and stepping with the trigger up fires no beam at
// all — which would have quietly turned "catwalks are not shootable" into a test that shoots
// nothing at a catwalk and finds it intact. Every shot below is now a real trigger pull with the
// crosshair on a real target, and each obstacle is seated ON THE LINE from the pilot's eye to the
// exhaust port, which buys the suite something the bolt fixture never could: one shot puts the
// beam through the obstacle AND the port behind it, so "the beam is spent here" and "the beam
// passes through" are both directly observable in the port's torpedo latch.

import { describe, it, expect } from 'vitest'
import {
  spawnTrenchObstacles,
  TRENCH_OBSTACLE_STATIONS,
  TRENCH_TURRET_SCORE,
  TRENCH_SQUARE_SCORE,
  OBSTACLE_HIT_RADIUS,
} from '../../src/core/trench-obstacles'
import { initialState, TRENCH_SCROLL_SPEED, type GameState } from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import { createRng } from '@arcade/shared/rng'
import { TRENCH_EYE_SEAT, TRENCH_HALF_W } from '../../src/core/trench-channel'
import type { Vec3 } from '@arcade/shared/math3d'
import { eyeOf, fireAt } from '../support/aim'

describe('trench obstacles — spawn & scroll', () => {
  it('enterPhase(trench) seeds the run chain from the run RNG; other phases carry none', () => {
    const t = enterPhase(initialState(), 'trench')
    // sw3-7: the trench chain is now SEEDED from the run RNG (fixed-head +
    // picked-tail, ROM sub_83A4), so it equals the generator seeded with the
    // run's own seed — no longer the static no-arg default. enterPhase must seed
    // from a LOCAL cursor (createRng(state.rng.seed)) so the run RNG is unmutated.
    expect(t.trenchObstacles).toEqual(spawnTrenchObstacles(createRng(initialState().rng.seed)))
    expect(t.trenchObstacles.length).toBe(TRENCH_OBSTACLE_STATIONS.length)
    expect(enterPhase(initialState(), 'space').trenchObstacles).toEqual([])
    expect(enterPhase(initialState(), 'surface').trenchObstacles).toEqual([])
  })

  it('spawnTrenchObstacles returns fresh arrays (no shared mutable state)', () => {
    const a = spawnTrenchObstacles()
    const b = spawnTrenchObstacles()
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it('obstacles scroll toward the cockpit at TRENCH_SCROLL_SPEED, like the port', () => {
    const s0 = enterPhase(initialState(), 'trench')
    const z0 = s0.trenchObstacles[0].pos[2]
    const s1 = stepGame(s0, NO_INPUT, 0.1)
    expect(s1.trenchObstacles[0].pos[2]).toBeCloseTo(z0 + TRENCH_SCROLL_SPEED * 0.1)
  })

  it('despawns obstacles that pass the cockpit (pos z > 0)', () => {
    let s = enterPhase(initialState(), 'trench')
    const nearest: GameState = {
      ...s,
      trenchObstacles: [{ ...s.trenchObstacles[0], pos: [s.trenchObstacles[0].pos[0], s.trenchObstacles[0].pos[1], -0.1] }],
    }
    const stepped = stepGame(nearest, NO_INPUT, 1)
    expect(stepped.trenchObstacles.length).toBe(0)
  })
})

describe('trench obstacles — shooting & scoring', () => {
  /**
   * A trench run whose ONLY obstacle is of `kind`, parked exactly halfway along the beam from the
   * pilot's eye to the exhaust port — plus the yoke that shoots the PORT.
   *
   * That seating is the whole trick. Aiming at the port sends one ray through both, with the
   * obstacle strictly nearer, so a single step exercises the ROM's precedence directly: CLBLZ
   * resolves ONE object per frame and takes the nearest, and the arming test that follows it is
   * gated on the beam not already having been spent. `portTorpedoArmed` therefore reads out, from
   * the far side of the sim, whether the beam stopped here or carried on — which is exactly what
   * the old "the destroying bolt is consumed" line was reaching for and could only approximate by
   * counting bolts.
   *
   * Derived from `eyeOf` and the port's own spawn position rather than hardcoded, so it re-seats
   * itself if the pilot's seat or the trench's length ever moves again (both already have: sw5-6
   * lifted the eye to 768 and put the porthole in the floor, which is why the old [0, 60, -400]
   * fixture is not merely stale but unaimable — from the seat it is 60° down, twice the yoke's
   * throw).
   */
  function shotThroughTo(kind: 'turret' | 'square' | 'catwalk'): {
    s0: GameState
    yoke: Input
    port: Vec3
  } {
    const s = { ...enterPhase(initialState(), 'trench'), mode: 'playing' as const }
    const eye = eyeOf(s)
    const port = [...s.exhaustPort!.pos] as Vec3
    const pos: Vec3 = [(eye[0] + port[0]) / 2, (eye[1] + port[1]) / 2, (eye[2] + port[2]) / 2]
    return { s0: { ...s, trenchObstacles: [{ kind, pos }] }, yoke: fireAt(s, port), port }
  }

  it('a shot on a TURRET destroys it, scores TRENCH_TURRET_SCORE, emits the event', () => {
    const { s0, yoke } = shotThroughTo('turret')
    const s1 = stepGame(s0, yoke, 1 / 60)
    expect(s1.trenchObstacles.length).toBe(0)
    expect(s1.score).toBe(TRENCH_TURRET_SCORE)
    expect(s1.events).toContainEqual({ type: 'trench-obstacle-destroyed', kind: 'turret' })
  })

  it('a shot on a SQUARE destroys it and scores TRENCH_SQUARE_SCORE', () => {
    const { s0, yoke } = shotThroughTo('square')
    const s1 = stepGame(s0, yoke, 1 / 60)
    expect(s1.trenchObstacles.length).toBe(0)
    expect(s1.score).toBe(TRENCH_SQUARE_SCORE)
  })

  it('the beam is SPENT on the obstacle — it cannot also arm the torpedo on the port behind it', () => {
    // The successor to "the destroying bolt is consumed (no double-kill on the port behind)", and
    // a sharper statement of the same rule: one object per frame, nearest first. The ROM resolves
    // the trench beam once (CLBLZ) and our arming test is explicitly gated on `beamObstacle < 0`.
    //
    // NOT VACUOUS, and this is the pin that proves it: the identical shot with the obstacle taken
    // out of the channel DOES arm the torpedo. So the beam really was on the port, and it really
    // was the turret that stopped it — not a shot that was never going to reach.
    const { s0, yoke } = shotThroughTo('turret')
    const s1 = stepGame(s0, yoke, 1 / 60)
    expect(s1.trenchObstacles.length).toBe(0) // the turret ate the shot...
    expect(s1.portTorpedoArmed, 'a beam spent on an obstacle cannot also arm the port').toBe(false)

    const clear = stepGame({ ...s0, trenchObstacles: [] }, yoke, 1 / 60)
    expect(clear.portTorpedoArmed, 'the same shot, nothing in the way — it arms').toBe(true)
  })

  it('CATWALKS are not shootable — the beam passes through', () => {
    // RE-SEATED BY sw7-17, and the re-seat is the point: this test USED to fire nothing (a bolt
    // parked with the trigger up), so "the catwalk survived" was true no matter what the hit test
    // did. Now the crosshair is genuinely on the catwalk's own line and the trigger is genuinely
    // pulled, and the catwalk still stands — which is what `if (o.kind === 'catwalk') continue`
    // inside the beam's target loop is there to do (a catwalk is a hazard to fly into, not a
    // target).
    //
    // And it does not merely survive: the beam carries STRAIGHT THROUGH it and arms the torpedo on
    // the port beyond. A catwalk is transparent to the laser, not cover — the same shot through a
    // TURRET is stopped dead (the test above). That contrast is the assertion.
    const { s0, yoke } = shotThroughTo('catwalk')
    const s1 = stepGame(s0, yoke, 1 / 60)
    expect(s1.trenchObstacles.length).toBe(1) // still there
    expect(s1.score).toBe(0) // and it scored nothing
    expect(s1.portTorpedoArmed, 'the beam went straight through it to the port').toBe(true)
  })

  it('a wall force-field catwalk GRAZES on contact — emits terrain-crash, costs NO shield (B-012)', () => {
    const s = enterPhase(initialState(), 'trench')
    const lives0 = s.lives
    // A LEFT-wall force field at the seat height. The hands-off pilot rides centre — the ROM's
    // left side (`IFLE ;?ON LEFT SIDE?`) — so the field grazes him. sw5-6's height framing is
    // unchanged: trenchView is a height above the y=0 floor, seated at TRENCH_EYE_SEAT.
    const s1 = stepGame(
      { ...s, mode: 'playing', trenchObstacles: [{ kind: 'catwalk', pos: [-TRENCH_HALF_W, TRENCH_EYE_SEAT, -1] }] },
      NO_INPUT,
      1 / 60,
    )
    expect(s1.lives).toBe(lives0) // a graze costs NO shield (was −1; B-012 moved the shield to WSGLOW scope)
    expect(s1.events).toContainEqual({ type: 'terrain-crash' }) // the AUDCR graze sound still fires
    expect(s1.trenchObstacles.length).toBe(0) // flew through the field
  })

  it('OBSTACLE_HIT_RADIUS and both scores are positive (table sanity)', () => {
    expect(OBSTACLE_HIT_RADIUS).toBeGreaterThan(0)
    expect(TRENCH_TURRET_SCORE).toBeGreaterThan(0)
    expect(TRENCH_SQUARE_SCORE).toBeGreaterThan(0)
    expect(TRENCH_OBSTACLE_STATIONS.length).toBeGreaterThanOrEqual(8) // ≥ the off_7CC0 record count
    for (const o of TRENCH_OBSTACLE_STATIONS) expect(o.pos[2]).toBeLessThan(0) // all downrange
  })

  it('is deterministic for a fixed seed across 20 trench steps', () => {
    let a = enterPhase(initialState(7), 'trench')
    let b = enterPhase(initialState(7), 'trench')
    for (let i = 0; i < 20; i++) {
      a = stepGame(a, NO_INPUT, 0.1)
      b = stepGame(b, NO_INPUT, 0.1)
    }
    expect(a).toEqual(b)
  })
})
