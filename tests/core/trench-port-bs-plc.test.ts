// tests/core/trench-port-bs-plc.test.ts
//
// Story sw7-22 (R6d) — RED phase (Imperator Furiosa / TEA): seat the exhaust port
// at its REAL BS.PLC distance so the pilot flies the full ~21s channel, replacing
// the TRENCH_FAR (28,672) port-clamp stub — while the BEAM REACH stays $7000 so the
// port only becomes shootable in the final ~1.8s (WSLAZR CLBLZ).
//
// THE DEFECT this story fixes (from the story title; the numbers are measured, not
// invented — see the probe in the sw7-22 session):
//   • spawnPort (sim.ts) and EXHAUST_PORT_DISTANCE (state.ts) each wrap the real
//     chain-derived port distance in `Math.min(trenchPortDistance(...), TRENCH_FAR)`.
//     So the port SPAWNS at −28,672 (the beam-reach edge) and the pilot reaches it
//     in ~1.8s — the "1.8s stub". The real port is BS.PLC = 0x50000 = 327,680 units
//     down the channel (`trenchPortDistance`, already exported as TRENCH_PORT_OFFSET),
//     a ~21s flight at TRENCH_SCROLL_SPEED. The clamp is the bug; the full distance
//     is the fix.
//
// WHAT STAYS (the invariant the story says must NOT regress): the beam reach is
// still $7000 = TRENCH_FAR. `beamHit(..., TRENCH_FAR)` (sim.ts) already clips the
// port shot at that far line, so a port beyond it is unhittable. Un-clamping the
// SPAWN distance moves the port out past the beam; it becomes shootable only once it
// has scrolled back within $7000 — the final ~1.8s. These tests pin BOTH halves: the
// port now spawns FAR (beyond the beam), and the beam-reach gate still bites.
//
// SEAM NOTE (logged as a deviation): this suite pins the port's SPAWN distance to the
// real BS.PLC via the observable `enterPhase(...).exhaustPort` and the exported
// TRENCH_PORT_OFFSET. It deliberately does NOT force EXHAUST_PORT_DISTANCE (the
// staging constant most port suites fire against) to change value — that constant is
// the *shootable window* (= TRENCH_FAR), and every hit suite that stages a port at
// −EXHAUST_PORT_DISTANCE is firing WITHIN reach, which stays correct. Whether Dev
// keeps, renames, or retires EXHAUST_PORT_DISTANCE is a GREEN concern; a Delivery
// Finding records the naming smell.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TRENCH_SCROLL_SPEED,
  EXHAUST_PORT_DISTANCE,
  type GameState,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { TRENCH_FAR } from '../../src/core/trench-channel'
import { TRENCH_PORT_OFFSET } from '../../src/core/trench-wedges'
import { fireAt } from '../support/aim'
import type { Vec3 } from '@arcade/shared/math3d'

const FRAME = 1 / 60

/** A fresh trench opened at the given (1-based) wave, ready to fly. The port comes
 *  from the real `spawnPort` via `enterPhase` — never hand-placed — so these tests
 *  see the shipped spawn distance, not a fixture's guess. */
function freshTrench(wave = 1, seed = 1983): GameState {
  return { ...enterPhase({ ...initialState(seed), wave }, 'trench'), mode: 'playing' }
}

/** A trench holding an explicit port at `z` (−Z downrange) and nothing else — for
 *  staging the beam-reach boundary at a controlled distance. */
function trenchWithPortAt(z: number, seed = 1983): GameState {
  return {
    ...enterPhase({ ...initialState(seed), wave: 1 }, 'trench'),
    mode: 'playing',
    exhaustPort: { pos: [0, 0, z] },
    trenchObstacles: [],
  }
}

/** Fire one real, aimed shot at `target` and report whether it armed the torpedo. */
function armsShotAt(s0: GameState, target: Vec3): boolean {
  return stepGame(s0, fireAt(s0, target), FRAME).portTorpedoArmed
}

describe('sw7-22 (R6d) — AC-1: the exhaust port is seated at its real BS.PLC distance', () => {
  it('TRENCH_PORT_OFFSET is the ROM BS.PLC = 0x50000 = 327,680 (the balanced-pie channel length)', () => {
    // Source anchor: the chain-derived port distance (already the pure model). The
    // clamp is what hides it at spawn; this pins the number the fix un-clamps to.
    expect(TRENCH_PORT_OFFSET).toBe(0x50000)
    expect(TRENCH_PORT_OFFSET).toBe(327_680)
    // It is BEYOND the beam reach — the whole reason the port needs to scroll in.
    expect(TRENCH_PORT_OFFSET).toBeGreaterThan(TRENCH_FAR)
  })

  it('the port SPAWNS at −BS.PLC, not the −TRENCH_FAR clamp (RED: currently −28,672)', () => {
    const s = freshTrench()
    expect(s.exhaustPort).not.toBeNull()
    expect(s.exhaustPort!.pos[2]).toBe(-TRENCH_PORT_OFFSET)
    // The clamp is gone: the spawn sits PAST the beam-reach line, not on it.
    expect(-s.exhaustPort!.pos[2]).toBeGreaterThan(TRENCH_FAR)
  })

  it('the spawn distance is the FULL channel across waves — Atari balanced every pie to it', () => {
    // trenchPortDistance is constant across pies (measured); the port must reflect
    // that at every wave, never the compressed stub. RED now: −28,672 for all.
    for (const wave of [1, 2, 3, 12]) {
      const s = freshTrench(wave)
      expect(s.exhaustPort!.pos[2], `wave ${wave} port at BS.PLC`).toBe(-TRENCH_PORT_OFFSET)
    }
  })

  it('the pilot flies the full ~21s channel, not the ~1.8s stub', () => {
    // Distance ÷ scroll speed. The full channel is ~20.8s; the old stub was ~1.8s.
    // Pin the OBSERVABLE spawn distance as flight time — robust to the exact speed.
    const s = freshTrench()
    const flightSeconds = -s.exhaustPort!.pos[2] / TRENCH_SCROLL_SPEED
    expect(flightSeconds).toBeGreaterThan(18) // RED now: ~1.8s (the stub)
    expect(flightSeconds).toBeLessThan(24)
    // And the beam-reach window really is the ~1.8s tail it was.
    expect(TRENCH_FAR / TRENCH_SCROLL_SPEED).toBeLessThan(2.5)
  })
})

describe('sw7-22 (R6d) — AC-2: beam reach stays $7000; the port is shootable only in the final ~1.8s', () => {
  it('a dead-centre shot at the freshly-spawned port does NOT arm — it is beyond the $7000 beam reach', () => {
    // The real gun, aimed straight at the port from the real eye (sw5-6: never stage
    // the bolt on the target). At BS.PLC the beam is clipped by TRENCH_FAR and cannot
    // reach it. RED now: the port spawns at −28,672 (ON the beam edge), so it arms.
    const s0 = freshTrench()
    expect(armsShotAt(s0, s0.exhaustPort!.pos)).toBe(false)
  })

  it('the SAME shot arms once the port has scrolled within beam reach (keep-behavior)', () => {
    // A port staged inside $7000 is still shootable — un-clamping the spawn must not
    // break the win. Green under both the old and the new code (the clip is unchanged).
    const near = trenchWithPortAt(-(TRENCH_FAR / 2))
    expect(armsShotAt(near, near.exhaustPort!.pos)).toBe(true)
  })

  it('the beam-reach line is exactly $7000: just beyond misses, just within arms (both sides pinned)', () => {
    // The "test the wave after the last row" discipline — pin the boundary, not just
    // an interior point. Green under both codes; guards the gate that AC-1 relies on.
    const beyond = trenchWithPortAt(-(TRENCH_FAR + 3000))
    const within = trenchWithPortAt(-(TRENCH_FAR - 3000))
    expect(armsShotAt(beyond, beyond.exhaustPort!.pos), 'a port past $7000 is unhittable').toBe(false)
    expect(armsShotAt(within, within.exhaustPort!.pos), 'a port inside $7000 is hittable').toBe(true)
  })

  it('EXHAUST_PORT_DISTANCE stays a within-reach staging distance (≤ the beam reach)', () => {
    // The port suites fire at −EXHAUST_PORT_DISTANCE expecting a hit; that only holds
    // while it is inside the beam window. This guards the whole hit-suite re-seat
    // decision: keep the constant within $7000, or those suites go silently un-hittable.
    expect(EXHAUST_PORT_DISTANCE).toBeLessThanOrEqual(TRENCH_FAR)
  })
})
