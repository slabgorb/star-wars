// tests/core/surface-pacing.test.ts
//
// Story sw7-18 — R11c surface traversal rebuild, Defect D-022 (accelerating
// forward pacing). RED phase (O'Brien / TEA). EXPECTED TO FAIL until GREEN.
//
// THE DEFECT. The ROM flies the ground phase at an ACCELERATING player speed:
// PHIGD seeds `M$VX+M.S1 = $100` (256 units/game-frame, WSMAIN.MAC:1621) and
// PHEGD ramps it `ADDD #1 / CMPD #400` — +1 u/frame per frame, capped at $400
// (1024) (WSMAIN.MAC:1660-1665). At the 20.508 Hz timebase that is
//   256 × 20.508  ≈  5,250 u/s   seed
//   +1 u/frame/frame            ≈  +420 u/s²  acceleration  (TICK_HZ²)
//   1024 × 20.508 ≈ 21,000 u/s   cap
// Ours scrolls the world past a fixed cockpit at a CONSTANT TURRET_SCROLL_SPEED
// = 600 u/s — ~9× slower than the ROM's SLOWEST ground speed, and never ramping.
//
// THE FIX (design §Defect 3 / R11c). Keep the world-scroll inversion (camera
// fixed — STRUCTURAL, accepted) but make the scroll RATE a sim-integrated
// accelerating value, frame-true against the ROM's `0x100`/`0x400`/`+1` over
// TICK_HZ. This suite pins that value and its integration; it says NOTHING about
// how far the phase runs (D-019) or which objects wake (D-018) — those are
// their own suites.
//
// Contract this suite asks DEV to implement:
//   state.ts constants (frame-true, like TRENCH_SCROLL_SPEED = 0x300 * TICK_HZ):
//     SURFACE_SEED_SPEED = 0x100 * TICK_HZ   // ≈ 5,250 u/s   (ROM $100 seed)
//     SURFACE_MAX_SPEED  = 0x400 * TICK_HZ   // ≈ 21,000 u/s  (ROM $400 cap)
//     SURFACE_ACCEL      = TICK_HZ * TICK_HZ  // ≈ 420.6 u/s²  (ROM +1 u/frame/frame)
//   GameState gains:
//     surfaceScrollSpeed: number   // the live u/s scroll rate; seeded on surface
//                                  // entry, ramped each surface frame, capped.
//   Behaviour:
//     - enterPhase(s,'surface') seeds surfaceScrollSpeed = SURFACE_SEED_SPEED.
//     - each surface frame: surfaceScrollSpeed += SURFACE_ACCEL·dt, clamped to
//       SURFACE_MAX_SPEED (never above).
//     - the surface scroll (surfaceScrollZ AND the ground field/turrets) advances
//       by surfaceScrollSpeed·dt — the accelerating rate, not the flat 600.
//     - the ramp is `phase === 'surface'`-gated: no other phase accelerates it.
//
// Sacred boundary: pure core, no DOM, no time except dt, no RNG except state's.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  TICK_HZ,
  SURFACE_SEED_SPEED,
  SURFACE_MAX_SPEED,
  SURFACE_ACCEL,
  type GameState,
} from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'

/** A fresh surface run: enter the surface exactly as progression would, so the
 *  seed/reset in `enterPhase` is exercised (not a hand-poked phase flip). */
const freshSurface = (seed = 1983): GameState => enterPhase(initialState(seed), 'surface')

// --- AC: the ROM-derived constants ------------------------------------------

describe('sw7-18 / D-022 — the accelerating-pace constants are the ROM numbers', () => {
  it('SURFACE_SEED_SPEED is the ROM $100 seed over the timebase (≈ 5,250 u/s)', () => {
    // 256 u/frame × 20.508 Hz. Frame-true, single-sourced off TICK_HZ exactly as
    // TRENCH_SCROLL_SPEED = 0x300 * TICK_HZ — a hard-coded 5250 that drifts from
    // the timebase is the bug this equality catches.
    expect(SURFACE_SEED_SPEED).toBe(0x100 * TICK_HZ)
    expect(SURFACE_SEED_SPEED).toBeCloseTo(5250, 0)
  })

  it('SURFACE_MAX_SPEED is the ROM $400 cap over the timebase (≈ 21,000 u/s)', () => {
    expect(SURFACE_MAX_SPEED).toBe(0x400 * TICK_HZ)
    expect(SURFACE_MAX_SPEED).toBeCloseTo(21000, 0)
  })

  it('SURFACE_ACCEL is +1 u/frame/frame over the timebase (≈ 420.6 u/s²)', () => {
    // The ROM adds 1 unit/frame to the per-frame speed every frame. In continuous
    // terms that is TICK_HZ (frames/s) × TICK_HZ (the per-frame delta becomes u/s) = TICK_HZ².
    expect(SURFACE_ACCEL).toBe(TICK_HZ * TICK_HZ)
    expect(SURFACE_ACCEL).toBeCloseTo(420.6, 1)
  })

  it('the cap is a genuine 4× ramp above the seed (seed < cap, not a flat rate)', () => {
    expect(SURFACE_MAX_SPEED).toBeGreaterThan(SURFACE_SEED_SPEED)
    expect(SURFACE_MAX_SPEED / SURFACE_SEED_SPEED).toBeCloseTo(4, 5) // $400 / $100
  })
})

// --- AC: seeded on surface entry --------------------------------------------

describe('sw7-18 / D-022 — the scroll rate seeds at $100 on surface entry', () => {
  it('enterPhase(_, "surface") seats surfaceScrollSpeed at the ROM seed', () => {
    expect(freshSurface().surfaceScrollSpeed).toBe(SURFACE_SEED_SPEED)
  })

  it('re-entering the surface re-seeds the rate (a fast prior run does not carry over)', () => {
    // A stale high speed left on the state must not bleed into the next surface.
    const dirty: GameState = { ...initialState(7), surfaceScrollSpeed: SURFACE_MAX_SPEED }
    expect(enterPhase(dirty, 'surface').surfaceScrollSpeed).toBe(SURFACE_SEED_SPEED)
  })
})

// --- AC: it accelerates, frame over frame -----------------------------------

describe('sw7-18 / D-022 — the scroll rate ramps by SURFACE_ACCEL each frame', () => {
  it('one surface frame raises the rate by SURFACE_ACCEL·dt', () => {
    const dt = 0.02
    const s1 = stepGame(freshSurface(), NO_INPUT, dt)
    expect(s1.surfaceScrollSpeed).toBeCloseTo(SURFACE_SEED_SPEED + SURFACE_ACCEL * dt, 3)
  })

  it('the rate keeps climbing across a stretch of flight (still short of the cap)', () => {
    // 250 frames × 20 ms = 5 s of surface flight — well inside the ~18 s phase
    // (gdSeq < 5), well short of the ~37 s it would take to reach the cap. The rate
    // law is linear, so after N frames it is EXACTLY seed + ACCEL·(N·dt). An integer
    // frame count (not a `t += dt` loop) avoids float drift changing the tick count.
    let s = freshSurface()
    const dt = 0.02
    const frames = 250
    for (let i = 0; i < frames; i++) s = stepGame(s, NO_INPUT, dt)
    expect(s.phase).toBe('surface') // has NOT cleared yet — we're only measuring pace
    expect(s.surfaceScrollSpeed).toBeCloseTo(SURFACE_SEED_SPEED + SURFACE_ACCEL * frames * dt, 1)
    expect(s.surfaceScrollSpeed).toBeGreaterThan(SURFACE_SEED_SPEED)
  })

  it('the world scroll (surfaceScrollZ) advances by the CURRENT rate, not the flat 600', () => {
    // Wire check: the first frame moves the ground by the SEED rate (~5,250·dt),
    // not the retired 600·dt. Measured off the accumulator the field rides.
    const dt = 0.02
    const s0 = freshSurface()
    const s1 = stepGame(s0, NO_INPUT, dt)
    const advanced = s1.surfaceScrollZ - s0.surfaceScrollZ
    // Between the seed rate and one accel tick above it — and unmistakably faster
    // than the old 600·dt (= 12 units at this dt).
    expect(advanced).toBeGreaterThanOrEqual(SURFACE_SEED_SPEED * dt)
    expect(advanced).toBeLessThanOrEqual((SURFACE_SEED_SPEED + SURFACE_ACCEL * dt) * dt + 1e-6)
    expect(advanced).toBeGreaterThan(600 * dt) // decisively past the retired flat rate
  })
})

// --- AC: the cap holds ------------------------------------------------------

describe('sw7-18 / D-022 — the rate is capped at $400 (21,000 u/s)', () => {
  it('clamps at SURFACE_MAX_SPEED — a near-cap rate does not overshoot', () => {
    // Seed just below the cap so a single accel tick would blow past it: it must clamp.
    const nearCap: GameState = { ...freshSurface(), surfaceScrollSpeed: SURFACE_MAX_SPEED - 1 }
    const s1 = stepGame(nearCap, NO_INPUT, 1) // a full second of accel (~+420) would overshoot
    expect(s1.surfaceScrollSpeed).toBe(SURFACE_MAX_SPEED)
  })

  it('holds AT the cap once reached (does not keep growing)', () => {
    let s: GameState = { ...freshSurface(), surfaceScrollSpeed: SURFACE_MAX_SPEED }
    for (let i = 0; i < 20; i++) s = stepGame(s, NO_INPUT, 0.02)
    expect(s.surfaceScrollSpeed).toBe(SURFACE_MAX_SPEED)
  })
})

// --- AC: gated to the surface -----------------------------------------------

describe('sw7-18 / D-022 — only the surface phase accelerates', () => {
  it('the ramp is phase-gated: a space frame does not accelerate the surface rate', () => {
    // Park a seed rate on a SPACE state and step: the surface ramp must not fire
    // off-phase (the ROM runs it only inside PHEGD).
    const spaceState: GameState = { ...initialState(1983), phase: 'space', surfaceScrollSpeed: SURFACE_SEED_SPEED }
    let s = spaceState
    for (let i = 0; i < 20; i++) s = stepGame(s, NO_INPUT, 0.05)
    expect(s.surfaceScrollSpeed).toBe(SURFACE_SEED_SPEED) // untouched off the surface
  })
})

// --- AC: determinism / frame-rate independence of the rate law --------------

describe('sw7-18 / D-022 — the pace law is deterministic and dt-granularity-free', () => {
  it('the same elapsed surface time yields the same rate regardless of dt granularity', () => {
    // The rate is a LINEAR integral (seed + ACCEL·t), so one coarse step and many
    // fine steps over the same 3 s must land the SAME surfaceScrollSpeed. (Position
    // is Euler and may differ; the RATE law is exact.)
    const coarse = stepGame(freshSurface(), NO_INPUT, 3)
    let fine = freshSurface()
    for (let i = 0; i < 300; i++) fine = stepGame(fine, NO_INPUT, 0.01)
    expect(coarse.surfaceScrollSpeed).toBeCloseTo(fine.surfaceScrollSpeed, 3)
  })

  it('replays identically for a fixed seed (no Date.now/Math.random in the ramp)', () => {
    const run = (): GameState => {
      let s = freshSurface(7)
      for (let i = 0; i < 40; i++) s = stepGame(s, NO_INPUT, 0.02)
      return s
    }
    expect(run().surfaceScrollSpeed).toBe(run().surfaceScrollSpeed)
  })
})
