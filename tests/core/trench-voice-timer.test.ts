// tests/core/trench-voice-timer.test.ts
//
// Origin: Story sw3-4 — "Trench voice-line timer". The 1983 cabinet drives three
// iconic lines off a trench timer `word_4B0E`, gated by run parity `byte_4B12`
// (docs/star-wars-1983-source-findings.md, "Voice-line triggers by trench timer"):
//
//   | frames | parity | Sound  | line                                    |
//   |--------|--------|--------|-----------------------------------------|
//   |  16    | even   | $18    | "Luke, trust me"                        |
//   |  24    | even   | $1A    | "Yahoo, you're all clear kid"           |
//   |  22    | odd    | $16    | "The Force is strong in this one"       |
//
// A single run plays only its PARITY set: even runs → Luke @16 + Yahoo @24; odd runs
// → Force @22. Parity is sourced from `wave` (wave EVEN → even set).
//
// ── UPDATED by Story sw7-1 (R1 Timebase reconcile) ──────────────────────────────
// sw3-4 shipped a DEVIATION: `trenchTimer` advanced +1 per `stepGame` STEP — a raw
// per-step integer, NOT dt-scaled — so the thresholds fired at the loop's 60 Hz step
// index, 2.93× too fast (audit T-008, CONFIRMED). sw7-1 reverses that deviation: the
// timer now advances at the ROM game-frame rate 20.508 Hz (= TICK_HZ), so the cues
// fire at their authentic wall-clock times (16/20.508 = 0.78 s … 24/20.508 = 1.17 s)
// and are frame-rate independent. The word_4B0E frame THRESHOLDS (16/22/24) and the
// parity/one-shot/reset semantics are unchanged — only the counter's RATE is fixed.
//
// The seam-agnostic wall-clock contract lives in rom-timebase.test.ts; this suite
// keeps sw3-4's parity / once-per-run / reset / return-path / determinism coverage,
// re-expressed against the frame-true model. It reads `trenchTimer` as a float
// game-frame accumulator (sw7-1 chose T-008's "accumulate dt·20.508" seam — logged
// as a Design Deviation).
import { describe, it, expect } from 'vitest'
import type { GameEvent, SpeechLine } from '../../src/core/events'
import { stepGame, enterPhase } from '../../src/core/sim'
import { initialState, PROJECTILE_TTL, type GameState } from '../../src/core/state'
import { NO_INPUT } from '../../src/core/input'
import { TRENCH_EYE_SEAT } from '../../src/core/trench-channel'

const DT = 1 / 60

/** ROM game-frame rate (WSINT.MAC:147) — the rate word_4B0E advances at. */
const ROM_GAME_FRAME_HZ = 246.094 / 12 // 20.508 Hz

// Authentic ROM trench-timer thresholds (word_4B0E), in GAME FRAMES.
const F_LUKE = 16 // even run — "Luke, trust me"           (Sound_18)
const F_FORCE = 22 // odd run  — "The Force is strong…"      (Sound_16)
const F_YAHOO = 24 // even run — "Yahoo, you're all clear"   (Sound_1A)

// Their authentic wall-clock firing times (frames ÷ 20.508 Hz), in seconds.
const S_LUKE = F_LUKE / ROM_GAME_FRAME_HZ // 0.780 s
const S_FORCE = F_FORCE / ROM_GAME_FRAME_HZ // 1.073 s
const S_YAHOO = F_YAHOO / ROM_GAME_FRAME_HZ // 1.170 s

/** A clean trench run seeded deterministically at a chosen `wave` (parity source).
 *  Wall obstacles are cleared so a catwalk crash can't cut the run short and mask the
 *  voice timer, and the exhaust port sits far downrange (a NO_INPUT run only reaches
 *  it at ~4.6 s), so this fixture isolates the timer, nothing else. */
function freshTrench(seed: number, wave: number): GameState {
  return {
    ...enterPhase(initialState(seed), 'trench'),
    mode: 'playing',
    wave,
    trenchObstacles: [],
  }
}

/** Pull the speech lines emitted this frame, in order (mirrors speech-cues.test.ts). */
function spokenLines(s: GameState): string[] {
  return s.events.filter((e) => e.type === 'speech').map((e) => (e.type === 'speech' ? e.line : ''))
}

interface Beat {
  /** accumulated sim-time (s) at the END of this step */
  t: number
  lines: string[]
}

/** Drive a trench state forward `steps` frames at DT, recording the accumulated
 *  sim-time and any speech emitted on each. 90 steps = 1.5 s clears the last cue
 *  (1.17 s) while the port is still ~1,650 u downrange (a NO_INPUT run never fires,
 *  so the port cannot resolve). */
function collectRun(s0: GameState, steps: number): Beat[] {
  const beats: Beat[] = []
  let s = s0
  let t = 0
  for (let i = 0; i < steps; i++) {
    s = stepGame(s, NO_INPUT, DT)
    t += DT
    beats.push({ t, lines: spokenLines(s) })
  }
  return beats
}

/** The sim-times at which `line` was spoken across a run — [] if never, and a length
 *  > 1 means it re-fired (a bug the once-per-run tests guard against). */
function firedAt(beats: Beat[], line: string): number[] {
  return beats.filter((b) => b.lines.includes(line)).map((b) => b.t)
}

const STEPS = 90 // 1.5 s — past the last threshold (1.17 s), port still downrange

describe('trench voice timer — the counter is frame-true (sw7-1 / T-008)', () => {
  it('enters the trench with the voice timer zeroed', () => {
    expect(enterPhase(initialState(1), 'trench').trenchTimer).toBe(0)
  })

  it('advances at the 20.508 Hz game-frame rate — ~20.5 frames after one second', () => {
    // One second of 60 Hz steps accumulates ONE second of game frames = 20.508, NOT
    // 60. (The old per-step counter reached 60 here — 2.93× fast.)
    let s = freshTrench(1, 2)
    for (let i = 0; i < 60; i++) s = stepGame(s, NO_INPUT, DT)
    expect(s.trenchTimer).toBeCloseTo(ROM_GAME_FRAME_HZ, 1) // ≈ 20.508
  })

  it('is dt-SCALED, not per-step — a 1/240 step advances ¼ as far as a 1/60 step', () => {
    // The exact inversion of the sw3-4 bug: the counter is proportional to elapsed
    // time, so a quarter-length frame advances it a quarter as far. A per-step counter
    // would advance by 1 for BOTH and this ratio would be 1.
    const t0 = freshTrench(1, 2)
    const fine = stepGame(t0, NO_INPUT, 1 / 240).trenchTimer
    const coarse = stepGame(t0, NO_INPUT, 1 / 60).trenchTimer
    expect(fine).toBeGreaterThan(0)
    expect(coarse / fine).toBeCloseTo(4, 1)
  })

  it('does NOT advance outside the trench (a space frame leaves it at 0)', () => {
    const space: GameState = { ...initialState(1), phase: 'space', mode: 'playing' }
    expect(space.trenchTimer).toBe(0)
    expect(stepGame(space, NO_INPUT, DT).trenchTimer).toBe(0)
  })
})

describe('even-wave trench run — Luke @0.78 s + Yahoo @1.17 s (AC2)', () => {
  const beats = collectRun(freshTrench(1983, 2), STEPS)

  it('cues "Luke, trust me" exactly once, at its ROM wall-clock time', () => {
    const times = firedAt(beats, 'lukeTrustMe')
    expect(times).toHaveLength(1)
    expect(times[0]).toBeCloseTo(S_LUKE, 1) // 0.780 s
  })

  it('cues "Yahoo, you\'re all clear kid" exactly once, at its ROM wall-clock time', () => {
    const times = firedAt(beats, 'youreAllClearKid')
    expect(times).toHaveLength(1)
    expect(times[0]).toBeCloseTo(S_YAHOO, 1) // 1.170 s
  })

  it('does NOT cue the odd-run "Force is strong" line on an even run (parity gate, AC4)', () => {
    expect(firedAt(beats, 'theForceIsStrongInThisOne')).toEqual([])
  })
})

describe('odd-wave trench run — Force is strong @1.07 s (AC3)', () => {
  const beats = collectRun(freshTrench(1983, 1), STEPS)

  it('cues "The Force is strong in this one" exactly once, at its ROM wall-clock time', () => {
    const times = firedAt(beats, 'theForceIsStrongInThisOne')
    expect(times).toHaveLength(1)
    expect(times[0]).toBeCloseTo(S_FORCE, 1) // 1.073 s
  })

  it('does NOT cue the even-run lines on an odd run (parity gate, AC4)', () => {
    expect(firedAt(beats, 'lukeTrustMe')).toEqual([])
    expect(firedAt(beats, 'youreAllClearKid')).toEqual([])
  })
})

describe('a line fires ONCE per run, not every frame past its threshold (AC5)', () => {
  it('an even run is silent of "Luke, trust me" on every frame after it fires', () => {
    const beats = collectRun(freshTrench(7, 2), STEPS)
    const after = beats.filter((b) => b.t > S_LUKE + DT)
    expect(after.length).toBeGreaterThan(0) // the run really did pass 0.78 s
    expect(after.some((b) => b.lines.includes('lukeTrustMe'))).toBe(false)
  })

  it('an odd run is silent of "Force is strong" on every frame after it fires', () => {
    const beats = collectRun(freshTrench(7, 1), STEPS)
    const after = beats.filter((b) => b.t > S_FORCE + DT)
    expect(after.length).toBeGreaterThan(0)
    expect(after.some((b) => b.lines.includes('theForceIsStrongInThisOne'))).toBe(false)
  })
})

describe('the timer + cues reset each run (AC6)', () => {
  it('resets a NON-ZERO timer to 0 on entering the trench', () => {
    // Drive the reset from a genuinely dirty value — NOT from a pristine
    // `initialState` (whose trenchTimer is already 0, which would pass even if the
    // `enterPhase` reset were deleted).
    const dirty: GameState = { ...initialState(1), trenchTimer: 47 }
    expect(enterPhase(dirty, 'trench').trenchTimer).toBe(0)
  })

  it('re-arms the cues on a second run whose prior timer had already climbed past 24', () => {
    // Run 1 climbs the timer well past every threshold...
    const run1 = collectRun(freshTrench(1, 2), STEPS)
    expect(firedAt(run1, 'lukeTrustMe')).toHaveLength(1)
    expect(firedAt(run1, 'youreAllClearKid')).toHaveLength(1) // really climbed past 24 frames
    // ...then a NEW trench opens from a state that STILL carries that climbed timer.
    // The entry MUST zero it, or the second run is silent forever (timer never falls
    // back below 16). If the enterPhase reset were missing, the cue would never fire.
    const climbed: GameState = { ...initialState(1), wave: 2, trenchTimer: 30 }
    const run2Start: GameState = {
      ...enterPhase(climbed, 'trench'),
      mode: 'playing',
      trenchObstacles: [],
    }
    expect(run2Start.trenchTimer).toBe(0)
    const run2 = collectRun(run2Start, STEPS)
    const luke = firedAt(run2, 'lukeTrustMe')
    expect(luke).toHaveLength(1)
    expect(luke[0]).toBeCloseTo(S_LUKE, 1)
  })
})

describe('silence outside the cue windows (AC7 — complements speech-cues.test.ts)', () => {
  it('the trench is silent before the first threshold time', () => {
    const beats = collectRun(freshTrench(1, 2), STEPS)
    const beforeLuke = beats.filter((b) => b.t < S_LUKE - DT)
    expect(beforeLuke.length).toBeGreaterThan(0) // there really is a pre-cue window
    expect(beforeLuke.every((b) => b.lines.length === 0)).toBe(true)
  })

  it('emits speech ONLY on the two even-run threshold frames (no chatter between)', () => {
    const beats = collectRun(freshTrench(1, 2), STEPS)
    const speakingFrames = beats.filter((b) => b.lines.length > 0)
    expect(speakingFrames).toHaveLength(2) // exactly Luke + Yahoo, nothing else
  })
})

describe('parity is stable across many waves (rule: parity arithmetic)', () => {
  it('a high EVEN wave still cues the even set, never the odd line', () => {
    const beats = collectRun(freshTrench(1, 100), STEPS)
    expect(firedAt(beats, 'lukeTrustMe')).toHaveLength(1)
    expect(firedAt(beats, 'youreAllClearKid')).toHaveLength(1)
    expect(firedAt(beats, 'theForceIsStrongInThisOne')).toEqual([])
  })

  it('a high ODD wave still cues the odd line, never the even set', () => {
    const beats = collectRun(freshTrench(1, 101), STEPS)
    expect(firedAt(beats, 'theForceIsStrongInThisOne')).toHaveLength(1)
    expect(firedAt(beats, 'lukeTrustMe')).toEqual([])
    expect(firedAt(beats, 'youreAllClearKid')).toEqual([])
  })
})

describe('SpeechEvent carries the new trench SpeechLine ids (AC9 / union exhaustiveness)', () => {
  // Typed as SpeechLine[]: a COMPILE-TIME assertion that all three ids are members of
  // the union — a renamed or missing id is a type error, not a silent pass.
  const NEW_TRENCH_LINES: SpeechLine[] = [
    'lukeTrustMe',
    'youreAllClearKid',
    'theForceIsStrongInThisOne',
  ]

  it('adds three DISTINCT lines to the SpeechLine union', () => {
    expect(new Set(NEW_TRENCH_LINES).size).toBe(3)
  })

  it('each is a valid `speech` GameEvent payload', () => {
    const events: GameEvent[] = NEW_TRENCH_LINES.map((line) => ({ type: 'speech', line }))
    for (const e of events) {
      expect(e.type).toBe('speech')
      if (e.type === 'speech') expect(typeof e.line).toBe('string')
    }
  })
})

describe('a cue rides every return path — coexists with crash / port-kill events', () => {
  it('fires alongside the win cue when "Luke" lands on the SAME frame as a port kill (clearRun path)', () => {
    // Even wave, timer one game-frame short of 16, with a bolt parked on the port so
    // this ONE step both crosses the "Luke, trust me" threshold AND destroys the port.
    // The port kill runs clearRun -> enterPhase (the most complex return path); the
    // cue, pushed at the TOP of stepTrench, must still ride the frame's events out.
    // (trenchTimer is set 0.1 frames below 16 so a single game-frame advance —
    //  dt·20.508 ≈ 0.34 — crosses it this step.)
    const trench = enterPhase(initialState(1983), 'trench')
    const p = trench.exhaustPort!.pos
    const port: typeof p = [p[0], p[1], -300] // seat it in the near-cockpit approach window
    const s0: GameState = {
      ...trench,
      mode: 'playing',
      wave: 2,
      trenchTimer: F_LUKE - 0.1,
      trenchObstacles: [],
      exhaustPort: { pos: port },
      projectiles: [{ pos: [port[0], port[1], port[2]], vel: [0, 0, -1], ttl: PROJECTILE_TTL }],
    }
    const lines = spokenLines(stepGame(s0, NO_INPUT, DT))
    expect(lines).toContain('lukeTrustMe') // the timer cue survived the port-hit return
    expect(lines).toContain('greatShotKidThatWasOneInAMillion') // ...next to the win cue
  })

  it('fires alongside a catwalk crash on the SAME frame (obstacle-crash path)', () => {
    // A synthetic catwalk parked at the cockpit forces the crash branch on this step,
    // while the timer crosses 16. The cue must ride the crash return path too.
    const trench = enterPhase(initialState(1983), 'trench')
    const s0: GameState = {
      ...trench,
      mode: 'playing',
      wave: 2,
      trenchTimer: F_LUKE - 0.1,
      trenchObstacles: [{ kind: 'catwalk', pos: [0, TRENCH_EYE_SEAT, -1] }],
    }
    const out = stepGame(s0, NO_INPUT, DT)
    expect(spokenLines(out)).toContain('lukeTrustMe') // the cue survived the crash return
    expect(out.events.some((e) => e.type === 'terrain-crash')).toBe(true) // crash really fired
  })
})

describe('trench voice cues are deterministic (AC8 — pure core)', () => {
  it('identical seed + wave replay identical speech cues across a trench run', () => {
    const stream = (seed: number, wave: number): string[] =>
      collectRun(freshTrench(seed, wave), STEPS).flatMap((b) => b.lines)
    const a = stream(2024, 2)
    const b = stream(2024, 2)
    expect(a).toEqual(b)
    // The scripted even run really did cross both even-set cue edges.
    expect(a).toContain('lukeTrustMe')
    expect(a).toContain('youreAllClearKid')
  })
})
