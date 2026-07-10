// tests/core/framing.test.ts
//
// RED-phase suite for Story 8-6 (Wave 4 — framing), Part D: the pure-core run
// LIFECYCLE and the wiring that makes the difficulty ramp bite in play. Scope is
// the mode transitions, the `wave` counter the HUD reads, and the sim consuming
// `waveParams(wave)` — NOT the canvas HUD/title/attract RENDERING, which is a
// shell concern verified by running the game (star-wars CLAUDE.md: "the shell
// (render/input/audio/loop) is verified by running the game").
//
// New core surface this exercises (absent until 8-6 GREEN):
//   - GameState.mode : 'attract' | 'playing' | 'gameover'
//   - GameState.wave : number   (the HUD's wave indicator; a fresh run is wave 1)
//   - Input.start    : a one-shot "press start" trigger (attract/gameover -> play)
//   - attract + start  -> a fresh PLAYING run (wave 1, score 0, full shields)
//   - attract ignores gameplay input (fire/aim) — only `start` matters
//   - losing the last shield -> mode 'gameover'
//   - gameover + start -> attract (NOT straight back into play)
//   - the space spawner reads waveParams(wave): later waves spawn sooner and the
//     TIEs approach FASTER; wave 1 is byte-for-byte today's balance.
//
// These fields/values are absent pre-GREEN. state.ts / sim.ts / input.ts all
// EXIST, so the module imports resolve; the new fields are read through loose
// cast views so each test fails on an ASSERTION (e.g. expected 'gameover', got
// 'playing') rather than throwing on an undefined property — a clean per-test RED.
//
// TEA decisions pinned here (logged as deviations in .session/8-6-session.md):
//  - initialState() keeps booting a fresh PLAYING wave-1 run (today's behaviour),
//    so the existing 8-3/8-4/8-8 core suites stay green. The attract SCREEN is the
//    shell's boot state; this suite drives the attract BEHAVIOUR from a
//    constructed attract state, exactly as tempest's framing suite does.
//  - The wave-advance TRIGGER (loop space->surface->trench->space at wave+1) is
//    out of scope: the trench is a terminal hold until trench gameplay (8-9) can
//    complete a run. This story delivers the ramp machinery + a wave-1 baseline;
//    8-9 calls the increment. Raised as a Delivery Finding.
import { describe, it, expect } from 'vitest'
import { initialState, STARTING_LIVES, SPAWN_INTERVAL, ENEMY_SPEED, type GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'

const DT = 1 / 60

// Loose views over the not-yet-extended core types: reads stay clean and tests
// fail on assertions rather than throwing on an undefined property.
const modeOf = (s: GameState): string => (s as unknown as { mode: string }).mode
const waveOf = (s: GameState): number | undefined => (s as unknown as { wave?: number }).wave

function withMode(s: GameState, mode: string): GameState {
  ;(s as unknown as { mode: string }).mode = mode
  return s
}
function withWave(s: GameState, wave: number): GameState {
  ;(s as unknown as { wave: number }).wave = wave
  return s
}

// `start` does not exist on Input until GREEN; tsc is red on these literals until
// then (the documented RED convention), while esbuild strips types so vitest runs.
const START: Input = { ...NO_INPUT, start: true } as unknown as Input
const start = (s: GameState): GameState => stepGame(s, START, DT)

// A state forced onto the attract screen regardless of what initialState boots.
const attractState = (seed = 1): GameState => withMode(initialState(seed), 'attract')
// A finished run parked on the game-over screen.
const gameoverState = (seed = 1): GameState => withMode(initialState(seed), 'gameover')

const mag = (v: readonly number[]): number => Math.hypot(v[0], v[1], v[2])

// --- The wave counter (the HUD's wave indicator) ----------------------------

describe('framing — a fresh run is wave 1', () => {
  it('initialState exposes wave = 1 for the HUD to read', () => {
    expect(waveOf(initialState(7))).toBe(1)
  })

  it('boots a fresh run in the playing mode', () => {
    expect(modeOf(initialState(7))).toBe('playing')
  })
})

// --- Attract screen ----------------------------------------------------------

describe('framing — attract screen', () => {
  // 'attract' + start -> a fresh PLAYING run, RNG untouched (framing must not
  // consume randomness, exactly as tempest's framing transitions don't).
  it('attract + start begins a fresh wave-1 run with full shields and no score', () => {
    const s = attractState(42)
    const rngBefore = { ...s.rng }
    const out = start(s)

    expect(modeOf(out)).toBe('playing')
    expect(waveOf(out)).toBe(1)
    expect(out.score).toBe(0)
    expect(out.lives).toBe(STARTING_LIVES)
    expect(out.phase).toBe('space')
    expect(out.enemies).toHaveLength(0)
    expect(out.projectiles).toHaveLength(0)
    expect(out.gameOver).toBe(false)
    expect(out.rng).toEqual(rngBefore) // framing transitions never touch the RNG
  })

  // Attract accepts no gameplay input — fire/aim are inert; only `start` matters.
  it('ignores fire and aim on the attract screen and stays in attract', () => {
    const out = stepGame(attractState(7), { aimX: 0.9, aimY: -0.5, fire: true } as Input, DT)
    expect(modeOf(out)).toBe('attract')
    expect(out.projectiles).toHaveLength(0)
  })

  // Guard: a neutral step holds on attract (no spurious self-start).
  it('holds on attract under neutral input', () => {
    expect(modeOf(stepGame(attractState(7), NO_INPUT, DT))).toBe('attract')
  })
})

// --- Game over ---------------------------------------------------------------

describe('framing — losing the last shield ends the run', () => {
  // A playing run that drops to zero shields this step flips to 'gameover'.
  it('flips a playing run to gameover when the last shield is lost', () => {
    const s: GameState = withMode({ ...initialState(1), lives: 0, gameOver: false }, 'playing')
    const out = stepGame(s, NO_INPUT, DT)
    expect(out.gameOver).toBe(true)
    expect(modeOf(out)).toBe('gameover')
  })

  // 'gameover' + start -> attract (NOT straight into play): the player sees the
  // attract/title screen between runs, the cabinet's behaviour.
  it('gameover + start returns to attract, not straight into play', () => {
    const out = start(gameoverState(3))
    expect(modeOf(out)).toBe('attract')
    expect(modeOf(out)).not.toBe('playing')
  })
})

// --- The sim CONSUMES the difficulty ramp (no duplicated constants) ----------

describe('framing — the space spawner reads waveParams(wave)', () => {
  // A space state primed to spawn its first TIE immediately (spawnTimer at 0,
  // empty slots) at a given wave, stepped one tiny tick.
  const spawnAtWave = (wave: number, seed = 99): GameState =>
    withWave(
      withMode({ ...initialState(seed), phase: 'space', enemies: [], spawnTimer: 0 }, 'playing'),
      wave,
    )

  it('spawns one TIE on the first tick at any wave (sanity for the comparisons below)', () => {
    const out = stepGame(spawnAtWave(1), NO_INPUT, 0.001)
    expect(out.enemies).toHaveLength(1)
  })

  it('keeps wave-1 balance: the spawned TIE approaches at today\'s speed and cadence', () => {
    const out = stepGame(spawnAtWave(1), NO_INPUT, 0.001)
    // A wave-1 TIE approaches at exactly ENEMY_SPEED and the timer rearms at
    // today's SPAWN_INTERVAL — wiring waveParams in must NOT shift wave-1 balance
    // (this guard holds in both RED and GREEN; the 8-3 suite depends on it).
    expect(mag(out.enemies[0].vel)).toBeCloseTo(ENEMY_SPEED, 5)
    expect(out.spawnTimer).toBe(SPAWN_INTERVAL)
  })

  it('makes wave-2 TIEs approach FASTER than wave-1 TIEs (same seed, same spawn)', () => {
    const w1 = stepGame(spawnAtWave(1), NO_INPUT, 0.001)
    const w2 = stepGame(spawnAtWave(2), NO_INPUT, 0.001)
    // Identical seed -> identical spawn position -> identical approach direction;
    // only the SPEED (waveParams(wave).enemySpeed) differs. RED: the sim ignores
    // wave, so the two are equal and this fails. GREEN: wave 2 is strictly faster.
    expect(mag(w2.enemies[0].vel)).toBeGreaterThan(mag(w1.enemies[0].vel))
  })

  it('tightens the wave-2 spawn cadence below wave 1 (TIEs keep coming sooner)', () => {
    const w1 = stepGame(spawnAtWave(1), NO_INPUT, 0.001)
    const w2 = stepGame(spawnAtWave(2), NO_INPUT, 0.001)
    // After a spawn the timer is reset to the wave's spawnInterval. RED: both are
    // the constant SPAWN_INTERVAL (equal). GREEN: wave 2's interval is shorter.
    expect(w2.spawnTimer).toBeLessThan(w1.spawnTimer)
  })
})

// --- Determinism (the sacred core boundary) ----------------------------------

describe('framing — deterministic transitions', () => {
  it('same (state, input, dt) yields the same mode, wave and RNG', () => {
    const a = start(attractState(123))
    const b = start(attractState(123))
    expect(modeOf(a)).toBe(modeOf(b))
    expect(waveOf(a)).toBe(waveOf(b))
    expect(a.rng).toEqual(b.rng)
  })
})
