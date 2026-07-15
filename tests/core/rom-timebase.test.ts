// tests/core/rom-timebase.test.ts
//
// RED-phase suite for Story sw7-1 — "R1 Timebase reconcile" (epic sw7, the
// 2026-07-15 primary-source ruling sheet). This is the ONE shared basis every later
// numeric sw7 story re-bakes on: the cabinet's game-logic frame is 20.508 Hz, NOT the
// invented `TICK_HZ = 30`. Everything routed through 30 runs 1.46×–2.93× fast.
//
// Primary source of the rate — WSINT.MAC:147:
//     LDA #11.        ;12.*4.2MS==>50. MS, 20 PER SECOND
//   GMTIMR reload 11(dec)+1 = 12 IRQs per game frame; IRQ = 12.096 MHz / 4096 / 12
//   = 246.094 Hz (period 4.0635 ms); game frame = 246.094 / 12 = 20.508 Hz.
//   Pinned three independent ways in the audit (T-007, T-009, G-003).
//
// Evidence: docs/audit/findings/pair-timing.json (T-007 TICK_HZ, T-008 trenchTimer),
// pair-guns.json (G-001 the 7/8 ratio is faithful, G-003 fireball life 3.12 s);
// refutation verdicts-8 (T-007/T-008 CONFIRMED) + verdicts-2 (G-001/G-003 CONFIRMED);
// audit doc §Timing / preflight §3.
//
// Every assertion here is RED against TICK_HZ = 30 and turns GREEN when TICK_HZ is
// the game-frame rate. The trench-cue timing tests read ONLY the emitted speech
// events (not the internal counter), so they hold whether Dev accumulates dt·20.508
// or drives the trench clock off the already-dt-scaled scroll (T-008 permits both).
import { describe, it, expect } from 'vitest'
import { length, type Vec3 } from '@arcade/shared/math3d'
import { TICK_HZ, ENEMY_SHOT_TTL, initialState, type GameState } from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'

/** The primary-source game-frame rate (WSINT.MAC:147). A faithful port may spell it
 *  `20.508` or `246.094 / 12` — both round equal to 2 dp; the old `30` does not. */
const ROM_GAME_FRAME_HZ = 246.094 / 12 // = 20.5078… Hz

// ── T-007: the shared basis ────────────────────────────────────────────────────
describe('sw7-1 · TICK_HZ is the 20.508 Hz cabinet game frame, not the invented 30 (T-007)', () => {
  it('is the ROM game-frame rate 246.094 / 12 ≈ 20.508 Hz', () => {
    expect(TICK_HZ).toBeCloseTo(ROM_GAME_FRAME_HZ, 2)
  })

  it('is emphatically NOT 30 — nor any half-of-60 guess', () => {
    // The refuter attacked "was 30 a correct half-of-60 for some value?" and it fails
    // at every use site (verdicts-8). The rate lives in a tight band around 20.5.
    expect(TICK_HZ).not.toBe(30)
    expect(TICK_HZ).toBeGreaterThan(20)
    expect(TICK_HZ).toBeLessThan(21)
  })
})

// ── G-003: fireball lifetime ────────────────────────────────────────────────────
describe('sw7-1 · enemy fireball lives its ROM 64 game-frames = 3.12 s (G-003)', () => {
  it('is 64 frames ÷ 20.508 Hz ≈ 3.12 s (was 2.13 s at TICK_HZ = 30)', () => {
    expect(ENEMY_SHOT_TTL).toBeCloseTo(64 / ROM_GAME_FRAME_HZ, 2) // 3.1207 s
    expect(ENEMY_SHOT_TTL).toBeCloseTo(3.12, 1)
  })

  it('keeps the 64-game-frame COUNT faithful (TTL × frame-rate = 64)', () => {
    // The COUNT ($40 = 64, FRAGUN's LDB #40) is faithful; only the seconds conversion
    // was wrong. This invariant catches a fix that changes the TTL without honoring 64.
    expect(ENEMY_SHOT_TTL * TICK_HZ).toBeCloseTo(64, 3)
  })
})

// ── G-001 ratio + T-007 basis: homing cadence ───────────────────────────────────
describe('sw7-1 · homing fireball decays at the 20.508 cadence, not 30 (G-001 ratio, T-007 basis)', () => {
  // The 7/8-per-frame decay RATIO is faithful (G-001 CONFIRMED — MOVAM's ASRD3 = ÷8);
  // only the CADENCE it is applied at rides TICK_HZ. Over a fixed wall-clock window the
  // observable decay factor is (7/8)^(dt·rate): at 20.508 a 0.2 s window shrinks the
  // range to ~57.8 %; at the buggy 30 it over-decays to ~44.9 %.
  const decayFactorOver = (seconds: number): number => {
    const launch: Vec3 = [0, 0, -20000] // far enough to survive the window (> COCKPIT_HIT_RADIUS)
    const s0: GameState = {
      ...initialState(4242),
      phase: 'space',
      mode: 'playing',
      enemies: [],
      enemyShots: [{ pos: [...launch] as Vec3, vel: [0, 0, 0], ttl: ENEMY_SHOT_TTL }],
      spawnTimer: 1e9,
      enemyFireCooldown: 1e9,
    }
    const homed = stepGame(s0, NO_INPUT, seconds).enemyShots[0]
    return length(homed.pos) / length(launch)
  }

  it('a 0.2 s homing window matches (7/8)^(0.2·20.508), not (7/8)^(0.2·30)', () => {
    const ratio = decayFactorOver(0.2)
    expect(ratio).toBeCloseTo(Math.pow(7 / 8, 0.2 * ROM_GAME_FRAME_HZ), 2) // 0.578
    expect(ratio).not.toBeCloseTo(Math.pow(7 / 8, 0.2 * 30), 2) // 0.449 — the bug
  })
})

// ── T-008: trench voice cues — observable wall-clock timing (seam-agnostic) ──────
/** A clean trench run seeded at a chosen `wave` (the parity source). Obstacles are
 *  cleared so a catwalk crash can't cut the run short, and the port stays far
 *  downrange, so this isolates the voice timer over the driven window. */
function freshTrench(seed: number, wave: number): GameState {
  return { ...enterPhase(initialState(seed), 'trench'), mode: 'playing', wave, trenchObstacles: [] }
}

/** Drive a fresh trench forward and return, per spoken line, the accumulated SIM-TIME
 *  at which it FIRST fired (undefined if never). Reads only emitted speech events —
 *  it never inspects the internal counter, so it is agnostic to how T-008 is fixed. */
function firstCueTimes(
  seed: number,
  wave: number,
  dt: number,
  steps: number,
): Record<string, number> {
  let s = freshTrench(seed, wave)
  const at: Record<string, number> = {}
  let t = 0
  for (let i = 0; i < steps; i++) {
    s = stepGame(s, NO_INPUT, dt)
    t += dt
    for (const e of s.events) {
      if (e.type === 'speech' && at[e.line] === undefined) at[e.line] = t
    }
  }
  return at
}

// Thresholds are GAME-FRAMES on the ROM's word_4B0E; wall-clock = frames / 20.508 Hz.
// Parity base (corrected by sw7-2): the ROM gates on 0-based BS.WAV (WSMAIN:1868), so
// "Luke, trust me"/"Yahoo" ride BS.WAV-even = human ODD waves {1,3,5,...}, while "Let
// go Luke"/"The Force is strong" ride BS.WAV-odd = human EVEN waves {2,4,6,...}. This
// timing suite is agnostic to WHICH wave carries a line — it swaps the fixture wave so
// each line's wall-clock time is still driven (the parity map itself is pinned in
// tests/core/wave-parity-gates.test.ts).
const F_LUKE = 16 // human-odd — "Luke, trust me"          → 0.780 s
const F_FORCE = 22 // human-even — "The Force is strong…"    → 1.073 s
const F_YAHOO = 24 // human-odd — "Yahoo, you're all clear" → 1.170 s

describe('sw7-1 · trench voice cues fire at their ROM wall-clock time, not step 16/22/24 (T-008)', () => {
  const DT = 1 / 60

  it('odd wave: "Luke, trust me" ≈ 0.78 s, "Yahoo…" ≈ 1.17 s (parity gate holds)', () => {
    const at = firstCueTimes(1983, 1, DT, 90) // wave 1 (human odd); 90 steps = 1.5 s > 1.17 s
    expect(at['lukeTrustMe']).toBeCloseTo(F_LUKE / ROM_GAME_FRAME_HZ, 1) // 0.780 s (was 16/60 = 0.27 s)
    expect(at['youreAllClearKid']).toBeCloseTo(F_YAHOO / ROM_GAME_FRAME_HZ, 1) // 1.170 s
    expect(at['theForceIsStrongInThisOne'] ?? null).toBeNull() // even-wave line stays silent
  })

  it('even wave: "The Force is strong in this one" ≈ 1.07 s', () => {
    const at = firstCueTimes(1983, 2, DT, 90) // wave 2 (human even)
    expect(at['theForceIsStrongInThisOne']).toBeCloseTo(F_FORCE / ROM_GAME_FRAME_HZ, 1) // 1.073 s
    expect(at['lukeTrustMe'] ?? null).toBeNull()
    expect(at['youreAllClearKid'] ?? null).toBeNull()
  })
})

describe('sw7-1 · trench cue timing is frame-rate independent — wall-clock, not step index (T-008)', () => {
  // The defect T-008 names: a per-STEP counter fires at a fixed STEP INDEX, so its
  // wall-clock time scales with dt (16/30 = 0.53 s vs 16/120 = 0.13 s). The fix fires
  // at a fixed wall-clock TIME regardless of tick rate. Drive the SAME even run coarse
  // and fine and demand "Luke" lands at the same second.
  it('"Luke, trust me" fires at the same sim-time at 30 Hz and 120 Hz stepping', () => {
    // wave 1 (human odd) is the "Luke, trust me" parity set (sw7-2, WSMAIN:1868).
    const coarse = firstCueTimes(1983, 1, 1 / 30, 60)['lukeTrustMe'] // 60 steps = 2.0 s
    const fine = firstCueTimes(1983, 1, 1 / 120, 240)['lukeTrustMe'] // 240 steps = 2.0 s
    expect(coarse).not.toBeUndefined()
    expect(fine).not.toBeUndefined()
    // Same instant, within the coarser step (1/30 ≈ 0.033 s). A per-step counter puts
    // coarse at 0.53 s and fine at 0.13 s — 0.40 s apart — and blows this up.
    expect(Math.abs(coarse - fine)).toBeLessThan(2 / 30)
  })
})
