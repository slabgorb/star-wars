// tests/core/trench-viewpoint.test.ts
//
// Story sw3-2 — "Trench pilotable viewpoint (sub_703B band)". RED phase.
//
// Today the trench cockpit is the immovable constant COCKPIT = [0,0,0]
// (src/core/sim.ts stepTrench): aimX/aimY only steer the firing ray, never the
// ship, and cameraView() lifts the trench eye to a FIXED TRENCH_SKIM. So the
// single catwalk (station 4, y=200, CATWALK_HIT_RADIUS=240) collides on every
// pass — a guaranteed shield loss with zero counterplay, byte-identical run to
// run (audit docs/sw2-6-disassembly-fidelity-audit.md §4).
//
// ROM `sub_703B` flies the viewpoint within a clamped band — ±511 lateral,
// −257…−3583 vertical — so the pilot can dive under (or slip past) the catwalk.
// The ROM↔world-unit conversion is still unresolved (trench-channel.ts, "Trench
// geometry & limits"), so these tests DO NOT hardcode band magnitudes. They pin
// the observable contract instead:
//
//   • CONTRACT: GameState gains `trenchView: Vec3` — the pilotable eye in the
//     trench's collision world. Neutral input seats it at the origin [0,0,0]
//     (so the baseline catwalk hazard still bites); the yoke flies it, clamped
//     to a finite band with no overshoot / no wrap. stepTrench collides the
//     catwalk against `trenchView`, not the fixed COCKPIT.
//
//   • BEHAVIOUR: a sustained dive dodges the catwalk (no crash, no shield),
//     while neutral input still costs exactly one shield (hazard preserved).
//
// The behavioural assertions target OUTCOMES ("a dive dodges", "neutral still
// crashes"), not a specific fix, so whichever mapping GREEN picks keeps them
// valid — mirroring the trench-catwalk-hazard.test.ts philosophy.

import { describe, it, expect } from 'vitest'
import { spawnTrenchObstacles } from '../../src/core/trench-obstacles'
import { initialState, type GameState, type TrenchObstacle } from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'

// Yoke presets. +aimY is UP (input.ts); the catwalk hangs overhead at y=200, so
// a DIVE (aimY < 0) is the maneuver that opens clearance beneath it.
const DOWN: Input = { aimX: 0, aimY: -1, fire: false }
const UP: Input = { aimX: 0, aimY: 1, fire: false }
const LEFT: Input = { aimX: -1, aimY: 0, fire: false }
const RIGHT: Input = { aimX: 1, aimY: 0, fire: false }

/** The catwalk hazard exactly as the game spawns it (station 4, y-offset intact). */
function spawnedCatwalk(): TrenchObstacle {
  const catwalk = spawnTrenchObstacles().find((o) => o.kind === 'catwalk')
  if (!catwalk) throw new Error('expected a catwalk in the trench obstacle table')
  return catwalk
}

/**
 * A fresh, isolated trench holding ONLY the given obstacles and no exhaust port,
 * so the catwalk crash is the only thing that can cost a shield and the viewpoint
 * is the only thing that moves.
 */
function trenchStart(obstacles: TrenchObstacle[] = []): GameState {
  return {
    ...enterPhase(initialState(), 'trench'),
    mode: 'playing',
    exhaustPort: null,
    trenchObstacles: obstacles.map((o) => ({ kind: o.kind, pos: [...o.pos] as TrenchObstacle['pos'] })),
    projectiles: [],
  }
}

/** Step the yoke held for `frames` at a fixed `dt`, returning the final state. */
function hold(state: GameState, input: Input, frames: number, dt = 0.1): GameState {
  let s = state
  for (let i = 0; i < frames; i++) s = stepGame(s, input, dt)
  return s
}

describe('sw3-2 — trench pilotable viewpoint exists and responds to the yoke', () => {
  it('seats the viewpoint at the collision-world origin on trench entry', () => {
    // Neutral seat = [0,0,0] keeps the baseline catwalk hazard (dist 200 < 240) alive.
    const s = trenchStart()
    expect(s.trenchView).toEqual([0, 0, 0])
  })

  it('flies the eye DOWN when the yoke is pushed down (was pinned at the origin before)', () => {
    const s = hold(trenchStart(), DOWN, 5)
    expect(s.trenchView[1]).toBeLessThan(0) // dove below the centreline
  })

  it('flies the eye laterally when the yoke is pushed sideways', () => {
    const right = hold(trenchStart(), RIGHT, 5)
    const left = hold(trenchStart(), LEFT, 5)
    expect(right.trenchView[0]).toBeGreaterThan(0)
    expect(left.trenchView[0]).toBeLessThan(0)
  })
})

describe('sw3-2 — the viewpoint is clamped to the band (no overshoot, no wrap)', () => {
  it('a sustained dive saturates at a finite floor and holds there', () => {
    const entered = trenchStart()
    const a = hold(entered, DOWN, 2000) // ~200s of sim — well past any sane band depth
    const b = hold(a, DOWN, 2000) // holding longer must not push it any deeper
    expect(b.trenchView[1]).toBe(a.trenchView[1]) // saturated: no further travel
    expect(b.trenchView[1]).toBeLessThan(0) // the floor is below the centreline
    expect(Number.isFinite(b.trenchView[1])).toBe(true) // a real bound, not ±Infinity/NaN
  })

  it('clamps a single oversized step to the floor instead of overshooting past it', () => {
    const entered = trenchStart()
    const floor = hold(entered, DOWN, 2000).trenchView[1]
    // One giant dt=100s step would integrate to -rate*100 with no clamp; the band
    // must cap it at the SAME floor a long hold reaches.
    const oneBigStep = stepGame(entered, DOWN, 100).trenchView[1]
    expect(oneBigStep).toBe(floor)
  })

  it('never wraps: a very long dive stays below the centreline the whole way', () => {
    let s = trenchStart()
    let maxY = -Infinity
    for (let i = 0; i < 3000; i++) {
      s = stepGame(s, DOWN, 0.1)
      if (s.trenchView[1] > maxY) maxY = s.trenchView[1]
    }
    expect(maxY).toBeLessThanOrEqual(0) // no frame ever rose above the seat — no wrap-around
  })

  it('the lateral clamp is symmetric — a full-left bound mirrors a full-right bound', () => {
    const left = hold(trenchStart(), LEFT, 2000).trenchView[0]
    const right = hold(trenchStart(), RIGHT, 2000).trenchView[0]
    expect(right).toBeGreaterThan(0)
    expect(left).toBeCloseTo(-right, 5) // ROM ±511 about centre → symmetric in world units
  })
})

describe('sw3-2 — catwalks become dodgeable, but the hazard is preserved', () => {
  it('diving under the catwalk (yoke held down) dodges it — no crash, no shield lost', () => {
    let s = trenchStart([spawnedCatwalk()])
    const lives0 = s.lives
    let crashed = false
    const dt = 1 / 60
    // Drive the whole crossing (catwalk at z=-2100, scroll 500 u/s → ~4.2s) with
    // the dive held from the first frame.
    for (let i = 0; i < 600 && s.trenchObstacles.length > 0; i++) {
      s = stepGame(s, DOWN, dt)
      if (s.events.some((e) => e.type === 'terrain-crash')) crashed = true
    }
    expect(crashed).toBe(false) // steered clear — the crash never fires
    expect(s.lives).toBe(lives0) // no shield lost
    expect(s.trenchObstacles).toHaveLength(0) // the catwalk scrolled harmlessly past
  })

  it('neutral input STILL costs exactly one shield as the catwalk passes (hazard preserved)', () => {
    let s = trenchStart([spawnedCatwalk()])
    const lives0 = s.lives
    let crashed = false
    for (let i = 0; i < 600 && s.trenchObstacles.length > 0; i++) {
      s = stepGame(s, NO_INPUT, 1 / 60)
      if (s.events.some((e) => e.type === 'terrain-crash')) crashed = true
    }
    expect(crashed).toBe(true) // an un-piloted run still crashes...
    expect(lives0 - s.lives).toBe(1) // ...for exactly one shield (not zero, not doubled)
    expect(s.trenchObstacles).toHaveLength(0)
  })
})
