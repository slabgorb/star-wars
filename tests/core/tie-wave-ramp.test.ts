// tests/core/tie-wave-ramp.test.ts
//
// Story 9-5 — Wave/difficulty ramp of the TIE AI per the RE'd fire table.
// RED phase: EXPECTED TO FAIL until GREEN adds `waveParams().maxConcurrentShots`
// and gates the space-phase TIE fire on it.
//
// The RE'd cabinet (docs/tie-flight-ai-model.md §8) governs TIE aggression with a
// fire-parameter table indexed by `min(mission + DIP, 15)`. The recovered column
// we can port 1:1 — because it has NO cabinet-tick dependence, it is a pure slot
// COUNT — is the per-wave CONCURRENCY cap: how many TIE fireballs may share the
// sky at once. It ramps 1 → 6 and SATURATES at the authentic 6-slot fireball pool.
//
//   clone `wave` (1-based) == cabinet mission (0-based) + 1, so at default
//   difficulty (no DIP switches on the clone → baseDifficulty 0):
//       index = min((wave - 1) + 0, 15)
//
//   index:  0  1  2  3  4  5  6  7+   →  cap:  1  1  2  3  4  5  6  6 (saturates)
//   wave:   1  2  3  4  5  6  7  8+
//
// TEA design decisions (logged as session deviations):
//  * FIDELITY over wave-1 stability (the Jedi's call): wave 1 is the ROM-faithful
//    index 0 = exactly ONE concurrent fireball, NOT today's full-pool volume. That
//    sparse start ramping to a sky full of fire IS the story — later waves send
//    measurably MORE simultaneous attackers (AC#2).
//  * AC#3 "no regression" is scoped to 9-2/9-3 FLIGHT (approach + peel-away), which
//    a fire-table ramp never touches; the scalar speed/spawn/fireInterval baseline
//    (story 8-6) stays wave-1-exact and is asserted here as a guard, not re-derived.
//  * The cadence-mask / PRNG-threshold columns are NOT ported to seconds: the
//    cabinet tick rate is unrecovered (model §5.3), so a frame→seconds cadence would
//    be invented, not faithful. The documented fallback keeps cadence/speed on the
//    existing scalar ramp; only the tick-agnostic concurrency COUNT is ported 1:1.
//    Fire rate still rises with the wave via the scalar `enemyFireInterval`.
//  * Sacred core boundary: no DOM, no time except `dt`, no randomness except the
//    seeded RNG carried in state.
import { describe, it, expect } from 'vitest'
import {
  initialState,
  SPAWN_INTERVAL,
  ENEMY_SPEED,
  ENEMY_FIRE_INTERVAL,
  MAX_FIREBALL_SLOTS,
  type GameState,
  type Enemy,
} from '../../src/core/state'
import * as gameRules from '../../src/core/gameRules'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { normalize, sub, scale, type Vec3, type Mat4 } from '../../src/core/math3d'

const COCKPIT: Vec3 = [0, 0, 0]
const DT = 0.05
const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
/** Two seconds of frames — long enough that every in-window TIE gets several
 * turns, short enough that they stay in their pass window (range > near-bound). */
const TWO_SECONDS = Math.round(2 / DT)

// `waveParams` gains `maxConcurrentShots` in GREEN. Pre-GREEN the field reads
// `undefined`, so the table assertions below fail locally with a clean
// missing-feature RED — never a module-load crash (gameRules already exists).
interface WaveParams {
  spawnInterval: number
  enemySpeed: number
  enemyFireInterval: number
  maxConcurrentShots: number
}
const waveParams = (gameRules as unknown as { waveParams: (wave: number) => WaveParams }).waveParams

/** A TIE squarely in its strafe/pass window: approaching the cockpit at `speed`,
 * range > TIE_NEAR_BOUND, in front of the camera (mirrors the 9-4 helper). */
const tieToward = (pos: Vec3, speed = ENEMY_SPEED): Enemy => ({
  pos,
  vel: scale(normalize(sub(COCKPIT, pos)), speed),
  kind: 'tie',
  orient: IDENTITY,
  bank: 0,
})

/** Three fighters spread across the sky, all in their pass window. */
const threeStrafers = (): Enemy[] => [
  tieToward([250, 0, -900]),
  tieToward([-200, 150, -850]),
  tieToward([0, -220, -880]),
]

/** A playing state at `wave` with the squad fire-clock READY (so the only thing
 * limiting fire is the per-wave cap, not a cold clock), the spawner parked so the
 * only fire aloft comes from the given TIEs, and lives parked high so a stray ram
 * never ends the run mid-measurement. */
const fireReadyAtWave = (wave: number, enemies: Enemy[], seed = 1983): GameState => ({
  ...initialState(seed),
  wave,
  enemies,
  projectiles: [],
  enemyShots: [],
  spawnTimer: 1e9,
  enemyFireCooldown: 0,
  lives: 999,
})

/** Step `n` frames, returning the PEAK number of enemy fireballs ever aloft at
 * once across the run — the most the per-wave concurrency cap permitted. */
function peakShots(s: GameState, n: number): number {
  let peak = s.enemyShots.length
  for (let i = 0; i < n; i++) {
    s = stepGame(s, NO_INPUT, DT)
    if (s.enemyShots.length > peak) peak = s.enemyShots.length
  }
  return peak
}

describe("Story 9-5 — waveParams.maxConcurrentShots ports the RE'd fire table (AC1)", () => {
  it('maps each wave to the table concurrency cap (waves 1..8 → 1 1 2 3 4 5 6 6)', () => {
    // docs/tie-flight-ai-model.md §8, index = min((wave-1)+0, 15) at default difficulty.
    const expected: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 6 }
    for (const wave of Object.keys(expected).map(Number)) {
      expect(waveParams(wave).maxConcurrentShots).toBe(expected[wave])
    }
  })

  it('starts ROM-faithful: wave 1 permits exactly ONE concurrent fireball (index 0)', () => {
    // The whole point of the fidelity decision — the cabinet's first space wave is
    // sparse, one fireball in the sky, not the full pool.
    expect(waveParams(1).maxConcurrentShots).toBe(1)
  })

  it('saturates at the authentic 6-fireball pool on deep waves (the table tops out)', () => {
    expect(waveParams(7).maxConcurrentShots).toBe(MAX_FIREBALL_SLOTS) // 6
    expect(waveParams(20).maxConcurrentShots).toBe(MAX_FIREBALL_SLOTS)
    expect(waveParams(200).maxConcurrentShots).toBe(MAX_FIREBALL_SLOTS)
  })

  it('stays an integer slot count within [1, pool] on every wave', () => {
    for (let w = 1; w <= 30; w++) {
      const cap = waveParams(w).maxConcurrentShots
      expect(Number.isInteger(cap)).toBe(true) // a slot COUNT, never a fraction
      expect(cap).toBeGreaterThanOrEqual(1)
      expect(cap).toBeLessThanOrEqual(MAX_FIREBALL_SLOTS)
    }
  })

  it('is monotonic non-decreasing across waves (aggression only ever ramps up)', () => {
    for (let w = 1; w < 30; w++) {
      expect(waveParams(w + 1).maxConcurrentShots).toBeGreaterThanOrEqual(
        waveParams(w).maxConcurrentShots,
      )
    }
  })
})

describe('Story 9-5 — the existing scalar ramp is untouched (AC3 — no flight regression)', () => {
  it("wave 1 still reproduces today's speed / spawn / fire-interval baseline exactly", () => {
    const p = waveParams(1)
    expect(p.spawnInterval).toBe(SPAWN_INTERVAL)
    expect(p.enemySpeed).toBe(ENEMY_SPEED)
    expect(p.enemyFireInterval).toBe(ENEMY_FIRE_INTERVAL)
  })

  it('still speeds up the approach and tightens fire cadence on later waves (8-6 ramp intact)', () => {
    expect(waveParams(5).enemySpeed).toBeGreaterThan(waveParams(1).enemySpeed)
    expect(waveParams(5).enemyFireInterval).toBeLessThan(waveParams(1).enemyFireInterval)
  })
})

describe('Story 9-5 — the per-wave cap drives the sim: later waves put MORE fire aloft (AC1, AC2)', () => {
  it('wave 1 holds at most ONE TIE fireball aloft even with three fighters strafing', () => {
    // Index-0 cap is 1: three in-window TIEs cannot fill the sky past a single
    // fireball. Pre-GREEN the gate uses the full 6-slot pool, so the sky climbs past
    // 1 → RED. Exactly 1 (not 0) proves the cap throttles real fire, never gates it off.
    const peak = peakShots(fireReadyAtWave(1, threeStrafers()), TWO_SECONDS)
    expect(peak).toBe(1)
  })

  it('a deep wave (7, cap 6) lets several fighters fill the sky at once', () => {
    const peak = peakShots(fireReadyAtWave(7, threeStrafers()), TWO_SECONDS)
    expect(peak).toBeGreaterThan(1)
  })

  it('a later wave is measurably more aggressive than wave 1 (strictly more fire aloft)', () => {
    // AC#2 made concrete: same three strafers, same frames — the only difference is
    // the wave, and the deeper wave's higher concurrency cap shows up as more fire.
    const peak1 = peakShots(fireReadyAtWave(1, threeStrafers()), TWO_SECONDS)
    const peak7 = peakShots(fireReadyAtWave(7, threeStrafers()), TWO_SECONDS)
    expect(peak7).toBeGreaterThan(peak1)
  })

  it('never exceeds the authentic 6-fireball pool, however deep the wave', () => {
    const peak = peakShots(fireReadyAtWave(50, threeStrafers()), TWO_SECONDS)
    expect(peak).toBeLessThanOrEqual(MAX_FIREBALL_SLOTS)
  })
})

describe('Story 9-5 — the new knob stays pure and deterministic (AC4)', () => {
  it('returns the same maxConcurrentShots for the same wave, and ramped params are deep-equal', () => {
    expect(waveParams(7).maxConcurrentShots).toBe(waveParams(7).maxConcurrentShots)
    expect(waveParams(3)).toEqual(waveParams(3))
  })

  it('replays per-wave fire bit-identically from a fixed seed (sacred boundary)', () => {
    const run = (): number => peakShots(fireReadyAtWave(5, threeStrafers(), 4242), TWO_SECONDS)
    expect(run()).toBe(run())
  })
})
