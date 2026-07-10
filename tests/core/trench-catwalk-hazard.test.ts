// tests/core/trench-catwalk-hazard.test.ts
//
// Story 14-7 (bug) — "Trench catwalk hazard never costs a shield". RED phase.
//
// The catwalk obstacle spawns at station (0, 200, -2100) and, as it scrolls up
// the channel, ONLY its z advances — x/y stay fixed (src/core/sim.ts stepTrench).
// Its hazard check is `collides(pos, COCKPIT, COCKPIT_HIT_RADIUS)` with
// COCKPIT = [0,0,0] and COCKPIT_HIT_RADIUS = 80 (src/core/state.ts). The nearest
// the catwalk ever gets to the cockpit is at z=0, where the distance is
// sqrt(200² + 0²) = 200 — always greater than 80 — so the crash branch
// (terrain-crash + one shield, sim.ts stepTrench) is geometrically dead code.
//
// The pre-existing coverage in trench-obstacles.test.ts HID this: it placed the
// catwalk at an idealized [0, 0, -1] (y=0), where it trivially collides. These
// tests instead drive the REAL spawned catwalk (its true y-offset) through the
// cockpit over time — mirroring the live repro (enter a fresh trench, don't fire,
// wait ~4.2s for the catwalk to reach z=0). A single-frame /scenes.html render
// can't catch a collision-over-time bug; a stepped sim can.
//
// The assertions target BEHAVIOR ("a catwalk pass costs exactly one shield and
// fires terrain-crash"), NOT any one of the three candidate fixes (widen the
// hazard radius / lower the spawn-y / give the catwalk its own radius), so
// whichever fix GREEN picks keeps them valid. They also guard against an
// over-correction that crashes the catwalk too early or double-counts the shield.

import { describe, it, expect } from 'vitest'
import { spawnTrenchObstacles } from '../../src/core/trench-obstacles'
import { initialState, type GameState, type TrenchObstacle } from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'

/** The catwalk hazard exactly as the game spawns it (station 4, y-offset intact). */
function spawnedCatwalk(): TrenchObstacle {
  const catwalk = spawnTrenchObstacles().find((o) => o.kind === 'catwalk')
  if (!catwalk) throw new Error('expected a catwalk in the trench obstacle table')
  return catwalk
}

/**
 * An isolated trench holding ONLY the given obstacles and no exhaust port, so the
 * catwalk crash is the only thing that can cost a shield (the port's own cockpit
 * crash can't contaminate the count).
 */
function isolatedTrench(obstacles: TrenchObstacle[]): GameState {
  return {
    ...enterPhase(initialState(), 'trench'),
    mode: 'playing',
    exhaustPort: null,
    trenchObstacles: obstacles.map((o) => ({ kind: o.kind, pos: [...o.pos] as TrenchObstacle['pos'] })),
    projectiles: [],
  }
}

describe('story 14-7 — trench catwalk hazard actually costs a shield', () => {
  it('the real spawned catwalk (y-offset intact) costs exactly one shield as it passes the cockpit', () => {
    let s = isolatedTrench([spawnedCatwalk()])
    const lives0 = s.lives
    let crashSeen = false

    // Drive until the catwalk has scrolled clean past the cockpit. From z=-2100 at
    // TRENCH_SCROLL_SPEED (500 u/s) that's ~4.2s (~252 frames @ 1/60); cap above it.
    const dt = 1 / 60
    for (let i = 0; i < 600 && s.trenchObstacles.length > 0; i++) {
      s = stepGame(s, NO_INPUT, dt)
      if (s.events.some((e) => e.type === 'terrain-crash')) crashSeen = true
    }

    expect(crashSeen).toBe(true) // the crash MUST fire on some frame during the crossing
    expect(lives0 - s.lives).toBe(1) // exactly one shield: not zero (the bug), not double-counted
    expect(s.trenchObstacles).toHaveLength(0) // the catwalk is gone (crashed through / passed)
  })

  it('does NOT cost a shield while the catwalk is still far downrange (guards an over-eager fix)', () => {
    // One frame from a fresh trench leaves the catwalk ~2090 units out — no sane
    // fix (a wider radius or a lower spawn-y) should register a crash this far away.
    const s0 = isolatedTrench([spawnedCatwalk()])
    const s1 = stepGame(s0, NO_INPUT, 1 / 60)
    expect(s1.events.some((e) => e.type === 'terrain-crash')).toBe(false)
    expect(s1.lives).toBe(s0.lives)
    expect(s1.trenchObstacles).toHaveLength(1) // still ahead, still airborne
  })

  it('the obstacle table has exactly one catwalk and it is downrange of the cockpit', () => {
    const catwalks = spawnTrenchObstacles().filter((o) => o.kind === 'catwalk')
    expect(catwalks).toHaveLength(1)
    expect(catwalks[0].pos[2]).toBeLessThan(0) // downrange, ahead of the cockpit
  })
})
