// tests/core/phase-jump.test.ts
//
// Dev phase-jump (story 11-4), RED phase.
//
// The triangle/sliver render bug shipped through stories 11-1 and 11-2 because
// their "eyeball in the dev server" ACs were unverifiable: the surface and trench
// phases are only reachable after clearing 6 TIE + 4 turret kills, so nobody ever
// flew there to check (see star-wars/docs/adr/0002-scene-geometry-surface-and-trench.md).
// 11-4 makes those scenes reachable with a DEV-ONLY phase-jump. The pure,
// unit-testable piece (AC#3) is the phase-set the jump reuses — the existing
// `enterPhase(state, phase)` transition (AC#1), today PRIVATE in sim.ts.
//
// Contract this suite asks DEV to implement (GREEN):
//   - EXPORT `enterPhase(state, phase)` from src/core/sim.ts. It already opens a
//     phase cleanly (zero kills, no leftover enemies/turrets/ordnance, a port only
//     in the trench, the surface at skim height) and preserves the run (score,
//     lives, wave, rng) — the dev jump reuses it verbatim.
//   - The shell binds the jump keys (eyeballed, not unit-tested) and calls
//     enterPhase directly on a dev key, gated to dev — so stepGame's
//     (state, input, dt) contract is untouched and a normal run never jumps.
//
// Until GREEN exports enterPhase, every jump test below sees `undefined` and
// fails — the RED contract. The boundary is sacred: no DOM, no time except `dt`,
// no randomness except the seeded RNG.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  SKIM_ALTITUDE,
  EXHAUST_PORT_DISTANCE,
  type GameState,
  type Phase,
  type Enemy,
} from '../../src/core/state'
import { enterPhase, stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'

// Minimal fixtures — stepGame/enterPhase only read `.pos` off these, and the jump
// scrubs them anyway. Matches the house style in phase-progression.test.ts.
const tie = (pos: Vec3): Enemy => ({ pos } as Enemy)
const turretAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

const PHASES: readonly Phase[] = ['space', 'surface', 'trench']

// A "dirty" run sitting in `phase`: kills on the counter plus whatever ordnance
// that phase carries — exactly what a jump must scrub for the target phase.
function dirtyRun(phase: Phase, over: Partial<GameState> = {}): GameState {
  return {
    ...initialState(1983),
    phase,
    phaseKills: 4,
    enemies: phase === 'space' ? [tie([10, 20, -300]), tie([-5, 0, -400])] : [],
    turrets: phase === 'surface' ? [turretAt([0, 0, -200])] : [],
    exhaustPort: phase === 'trench' ? { pos: [0, 0, -EXHAUST_PORT_DISTANCE] } : null,
    enemyShots: [{ pos: [0, 0, -50], vel: [0, 0, 1], ttl: 4 }],
    ...over,
  }
}

// --- AC#1: reach ANY phase via the reused enterPhase transition --------------

describe('Dev phase-jump — every from→to transition lands in a clean phase', () => {
  for (const from of PHASES) {
    for (const to of PHASES) {
      it(`${from} -> ${to}: phase set, kills zeroed, no leftover ordnance`, () => {
        const s = enterPhase(dirtyRun(from), to)
        expect(s.phase).toBe(to)
        expect(s.phaseKills).toBe(0)
        expect(s.enemies).toHaveLength(0)
        expect(s.turrets).toHaveLength(0)
        expect(s.enemyShots).toHaveLength(0)
        // Only the trench opens with a target; every other phase carries no port.
        if (to === 'trench') expect(s.exhaustPort).not.toBeNull()
        else expect(s.exhaustPort).toBeNull()
      })
    }
  }
})

describe('Dev phase-jump — the transitions progression itself can never make', () => {
  it('jumps space -> trench in ONE step, skipping surface, with the port seated for 11-6', () => {
    const s = enterPhase(dirtyRun('space'), 'trench')
    expect(s.phase).toBe('trench')
    expect(s.exhaustPort?.pos).toEqual([0, 0, -EXHAUST_PORT_DISTANCE])
  })

  it('jumps BACKWARD trench -> space (progression only ever moves forward)', () => {
    const s = enterPhase(dirtyRun('trench'), 'space')
    expect(s.phase).toBe('space')
    expect(s.exhaustPort).toBeNull() // space carries no port
    expect(s.phaseKills).toBe(0)
  })

  it('jumps to the surface at the nominal skim height — never arriving mid-crash', () => {
    const s = enterPhase(dirtyRun('space', { altitude: 5 }), 'surface')
    expect(s.phase).toBe('surface')
    expect(s.altitude).toBe(SKIM_ALTITUDE)
  })
})

// --- AC#2: preserves the run; never the sim contract; never randomness -------

describe('Dev phase-jump — preserves the run-global state across a jump', () => {
  it('carries score, lives, wave, mode, and the RNG seed (a jump consumes no randomness)', () => {
    const start = dirtyRun('space', { score: 4200, lives: 3, wave: 5 })
    const s = enterPhase(start, 'trench')
    expect(s.score).toBe(4200)
    expect(s.lives).toBe(3)
    expect(s.wave).toBe(5)
    expect(s.mode).toBe('playing')
    expect(s.rng.seed).toBe(start.rng.seed)
  })

  it('is PURE — it never mutates the state handed in', () => {
    const start = dirtyRun('space')
    const enemiesBefore = start.enemies.length
    enterPhase(start, 'surface')
    expect(start.phase).toBe('space') // original phase untouched
    expect(start.enemies).toHaveLength(enemiesBefore) // original ordnance untouched
    expect(enemiesBefore).toBeGreaterThan(0) // guard: the fixture really was dirty
  })

  it('is DETERMINISTIC — equal inputs yield deep-equal outputs', () => {
    expect(enterPhase(dirtyRun('space'), 'trench')).toEqual(enterPhase(dirtyRun('space'), 'trench'))
  })
})

describe('Dev phase-jump — leaves a state the normal sim step accepts and holds', () => {
  it('a jumped-to surface steps forward normally and stays put with no kills', () => {
    let s = enterPhase(dirtyRun('space'), 'surface')
    for (let i = 0; i < 20; i++) s = stepGame(s, NO_INPUT, 1 / 60)
    expect(s.phase).toBe('surface') // the jumped state is a valid, consistent stepGame input
    expect(s.gameOver).toBe(false)
  })

  it('the stepGame(state, input, dt) contract is unchanged — no new required Input field', () => {
    // If the jump had been wired through a new REQUIRED Input field, this minimal
    // input would no longer typecheck/run. It must keep working untouched (AC#2).
    const minimal: Input = { aimX: 0, aimY: 0, fire: false }
    let s = initialState(1983)
    for (let i = 0; i < 30; i++) s = stepGame(s, minimal, 1 / 60)
    expect(s.phase).toBe('space') // a normal run never jumps on its own — only a quota or the dev key does
  })
})
