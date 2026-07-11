// tests/core/trench-voice-timer.test.ts
//
// RED-phase suite for Story sw3-4 — "Trench voice-line timer". sw2-5 made speech
// a first-class core GameEvent and wired the 4 lines that map to phase edges, but
// left the trench nearly silent: after "Use the Force, Luke" fires on trench
// ENTRY, no further voice plays. The 1983 cabinet drives three more iconic lines
// off a trench timer `word_4B0E`, gated by run parity `byte_4B12`
// (docs/star-wars-1983-source-findings.md, "Voice-line triggers by trench timer"):
//
//   | timer | parity | Sound  | line                                    |
//   |-------|--------|--------|-----------------------------------------|
//   |  16   | even   | $18    | "Luke, trust me"                        |
//   |  24   | even   | $1A    | "Yahoo, you're all clear kid"           |
//   |  22   | odd    | $16    | "The Force is strong in this one"       |
//   |  16   | odd    | $C     | (a non-voice cue — out of scope here)   |
//
// So a single run plays only its PARITY set: even runs → Luke @16 + Yahoo @24;
// odd runs → Force is strong @22. Session scope decision (user, sw3-4 RED): the
// parity gate is implemented NOW, sourced from `wave` (the real ROM source,
// byte_4B12, is the trench section-chain index — that mechanic lands in sw3-7).
// wave EVEN → even set; wave ODD → odd set. "reachable now WITHOUT new mechanics."
//
// The contract these tests pin (nothing here exists yet — valid RED, including the
// `trenchTimer` field and the three new `SpeechLine` ids, which are type errors
// until GREEN):
//
//   // src/core/state.ts — GameState gains an integer trench voice timer.
//   trenchTimer: number   // ROM word_4B0E; 0 in initialState, reset to 0 on
//                         // entering the trench, +1 each trench step.
//   // src/core/events.ts — SpeechLine union gains the three cabinet lines
//   //   | 'lukeTrustMe'               // trench timer 16, even run
//   //   | 'youreAllClearKid'          // trench timer 24, even run
//   //   | 'theForceIsStrongInThisOne' // trench timer 22, odd run
//   // (each id is an existing key in the shell's 23-line SPEECH catalogue, so the
//   //  generic event->speak pump needs no change — see tests/shell/audio.test.ts.)
//
// TICK MODEL (deviation, logged in the session): `trenchTimer` advances by exactly
// ONE per `stepGame` trench step — a per-step integer counter, NOT dt-scaled — so
// the authentic thresholds 16/22/24 are reachable inside the ~4.8s trench
// (EXHAUST_PORT_DISTANCE 2400 / TRENCH_SCROLL_SPEED 500) under the fixed-timestep
// loop, mirroring the ROM's per-frame word_4B0E. The wall-clock cadence/feel of the
// cluster is a playtest-tuning candidate (see Delivery Findings), not pinned here.
import { describe, it, expect } from 'vitest'
import type { GameEvent, SpeechLine } from '../../src/core/events'
import { stepGame, enterPhase } from '../../src/core/sim'
import { initialState, type GameState } from '../../src/core/state'
import { NO_INPUT } from '../../src/core/input'

const DT = 1 / 60

// Authentic ROM trench-timer thresholds (word_4B0E), pinned as golden values.
const T_LUKE = 16 // even run — "Luke, trust me"        (Sound_18)
const T_FORCE = 22 // odd run  — "The Force is strong…"   (Sound_16)
const T_YAHOO = 24 // even run — "Yahoo, you're all clear" (Sound_1A)

/** A clean trench run seeded deterministically at a chosen `wave` (parity source).
 *  Wall obstacles are cleared so a catwalk crash can't cut the run short and mask
 *  the voice timer, and the exhaust port sits far downrange (no hit across the
 *  driven window) — this fixture isolates the timer, nothing else. */
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
  timer: number
  lines: string[]
}

/** Drive a trench state forward `steps` frames, recording the timer value and any
 *  speech emitted on each. `steps <= 30` keeps the port far downrange (a port hit
 *  needs a bolt on it, and 30 frames scroll it only ~250 of 2400 units). */
function collectRun(s0: GameState, steps: number): Beat[] {
  const beats: Beat[] = []
  let s = s0
  for (let i = 0; i < steps; i++) {
    s = stepGame(s, NO_INPUT, DT)
    beats.push({ timer: s.trenchTimer, lines: spokenLines(s) })
  }
  return beats
}

/** The timer values at which `line` was spoken across a run — [] if never, and a
 *  length > 1 means it re-fired (a bug the AC5 tests guard against). */
function firedAt(beats: Beat[], line: string): number[] {
  return beats.filter((b) => b.lines.includes(line)).map((b) => b.timer)
}

describe('trench voice timer — the counter (AC1)', () => {
  it('enters the trench with the voice timer zeroed', () => {
    expect(enterPhase(initialState(1), 'trench').trenchTimer).toBe(0)
  })

  it('advances by exactly one per trench step', () => {
    const t0 = freshTrench(1, 2)
    expect(t0.trenchTimer).toBe(0)
    const t1 = stepGame(t0, NO_INPUT, DT)
    expect(t1.trenchTimer).toBe(1)
    const t2 = stepGame(t1, NO_INPUT, DT)
    expect(t2.trenchTimer).toBe(2)
  })

  it('is a per-step tick, independent of dt (an integer ROM counter, not dt-scaled)', () => {
    const t0 = freshTrench(1, 2)
    // A tiny frame and a huge frame both advance the counter by exactly one — the
    // thresholds are tick counts, not seconds (a seconds timer could never reach
    // 24 in a ~4.8s trench).
    expect(stepGame(t0, NO_INPUT, 1 / 240).trenchTimer).toBe(1)
    expect(stepGame(t0, NO_INPUT, 0.9).trenchTimer).toBe(1)
  })

  it('does NOT advance outside the trench (a space frame leaves it at 0)', () => {
    const space: GameState = { ...initialState(1), phase: 'space', mode: 'playing' }
    expect(space.trenchTimer).toBe(0)
    expect(stepGame(space, NO_INPUT, DT).trenchTimer).toBe(0)
  })
})

describe('even-wave trench run — Luke @16 + Yahoo @24 (AC2)', () => {
  const beats = collectRun(freshTrench(1983, 2), 30)

  it('cues "Luke, trust me" exactly once, at timer 16', () => {
    expect(firedAt(beats, 'lukeTrustMe')).toEqual([T_LUKE])
  })

  it('cues "Yahoo, you\'re all clear kid" exactly once, at timer 24', () => {
    expect(firedAt(beats, 'youreAllClearKid')).toEqual([T_YAHOO])
  })

  it('does NOT cue the odd-run "Force is strong" line on an even run (parity gate, AC4)', () => {
    expect(firedAt(beats, 'theForceIsStrongInThisOne')).toEqual([])
  })
})

describe('odd-wave trench run — Force is strong @22 (AC3)', () => {
  const beats = collectRun(freshTrench(1983, 1), 30)

  it('cues "The Force is strong in this one" exactly once, at timer 22', () => {
    expect(firedAt(beats, 'theForceIsStrongInThisOne')).toEqual([T_FORCE])
  })

  it('does NOT cue the even-run lines on an odd run (parity gate, AC4)', () => {
    expect(firedAt(beats, 'lukeTrustMe')).toEqual([])
    expect(firedAt(beats, 'youreAllClearKid')).toEqual([])
  })
})

describe('a line fires ONCE per run, not every frame past its threshold (AC5)', () => {
  it('an even run is silent of "Luke, trust me" on every frame after timer 16', () => {
    const beats = collectRun(freshTrench(7, 2), 30)
    const afterLuke = beats.filter((b) => b.timer > T_LUKE)
    expect(afterLuke.length).toBeGreaterThan(0) // the run really did pass 16
    expect(afterLuke.some((b) => b.lines.includes('lukeTrustMe'))).toBe(false)
  })

  it('an odd run is silent of "Force is strong" on every frame after timer 22', () => {
    const beats = collectRun(freshTrench(7, 1), 30)
    const afterForce = beats.filter((b) => b.timer > T_FORCE)
    expect(afterForce.length).toBeGreaterThan(0)
    expect(afterForce.some((b) => b.lines.includes('theForceIsStrongInThisOne'))).toBe(false)
  })
})

describe('the timer + cues reset each run (AC6)', () => {
  it('a fresh trench zeroes the timer and re-arms the parity set', () => {
    const run1 = collectRun(freshTrench(1, 2), 30)
    expect(firedAt(run1, 'lukeTrustMe')).toEqual([T_LUKE])
    // A new run (next wave re-enters the trench) opens with a zeroed timer...
    const run2Start = freshTrench(1, 2)
    expect(run2Start.trenchTimer).toBe(0)
    // ...and cues the line all over again — the timer is per-run, not per-game.
    expect(firedAt(collectRun(run2Start, 30), 'lukeTrustMe')).toEqual([T_LUKE])
  })
})

describe('silence outside the cue windows (AC7 — complements speech-cues.test.ts)', () => {
  it('the trench is silent below the first threshold', () => {
    const first = collectRun(freshTrench(1, 2), 1)[0]
    expect(first.timer).toBe(1)
    expect(first.lines).toEqual([])
  })

  it('every frame that is NOT a threshold frame emits no speech (even run)', () => {
    const beats = collectRun(freshTrench(1, 2), 30)
    const offThreshold = beats.filter((b) => b.timer !== T_LUKE && b.timer !== T_YAHOO)
    expect(offThreshold.every((b) => b.lines.length === 0)).toBe(true)
  })
})

describe('parity is stable across many waves (rule: parity arithmetic)', () => {
  it('a high EVEN wave still cues the even set, never the odd line', () => {
    const beats = collectRun(freshTrench(1, 100), 30)
    expect(firedAt(beats, 'lukeTrustMe')).toEqual([T_LUKE])
    expect(firedAt(beats, 'youreAllClearKid')).toEqual([T_YAHOO])
    expect(firedAt(beats, 'theForceIsStrongInThisOne')).toEqual([])
  })

  it('a high ODD wave still cues the odd line, never the even set', () => {
    const beats = collectRun(freshTrench(1, 101), 30)
    expect(firedAt(beats, 'theForceIsStrongInThisOne')).toEqual([T_FORCE])
    expect(firedAt(beats, 'lukeTrustMe')).toEqual([])
    expect(firedAt(beats, 'youreAllClearKid')).toEqual([])
  })
})

describe('SpeechEvent carries the new trench SpeechLine ids (AC9 / union exhaustiveness)', () => {
  // Typed as SpeechLine[]: a COMPILE-TIME assertion that all three ids are members
  // of the union — a renamed or missing id is a type error, not a silent pass.
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

describe('trench voice cues are deterministic (AC8 — pure core)', () => {
  it('identical seed + wave replay identical speech cues across a trench run', () => {
    const stream = (seed: number, wave: number): string[] =>
      collectRun(freshTrench(seed, wave), 30).flatMap((b) => b.lines)
    const a = stream(2024, 2)
    const b = stream(2024, 2)
    expect(a).toEqual(b)
    // The scripted even run really did cross both even-set cue edges.
    expect(a).toContain('lukeTrustMe')
    expect(a).toContain('youreAllClearKid')
  })
})
