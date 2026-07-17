// tests/core/speech-cues.test.ts
//
// RED-phase suite for Story sw2-5 — "Wire remaining voice lines: only 'Use the
// Force, Luke' currently fires". Furiosa tests the escape route: the game is
// voiced but silent in play because speech has no CORE trigger — the one line
// that fires is derived in the SHELL off a phase edge, while every SFX flows
// from a `GameEvent`. sw2-5 makes speech a first-class core event so the lines
// are deterministic and testable, and wires the subset of the 23 cabinet lines
// that map to moments the current sim actually reaches (session scope decision:
// "Reachable subset now").
//
// The contract these tests pin (nothing here exists yet — valid RED):
//
//   // src/core/events.ts
//   type SpeechLine =
//     | 'redFiveStandingBy'                 // run start
//     | 'lookAtTheSizeOfThatThing'          // entering the Death Star surface
//     | 'useTheForceLuke'                   // entering the trench (was shell-derived)
//     | 'greatShotKidThatWasOneInAMillion'  // the exhaust-port kill
//   interface SpeechEvent { type: 'speech'; line: SpeechLine }
//   // ...added to the GameEvent union.
//
// The core emits a speech event at each reachable cue moment; the shell's pump
// (main.ts) speaks `event.line` generically (see tests/shell/audio.test.ts).
// Lines that need mechanics the sim lacks (R2 damage, Vader-on-tail, wingmen)
// are DEFERRED to a follow-on — they are listed in the shell's SPEECH catalogue
// (AC1) but carry no core trigger yet.
import { describe, it, expect } from 'vitest'
import type { GameEvent, SpeechLine } from '../../src/core/events'
import { stepGame, enterPhase } from '../../src/core/sim'
import {
  initialState,
  SPACE_WAVE_QUOTA,
  towersForWave,
  FORCE_BONUS,
  type GameState,
} from '../../src/core/state'
import { NO_INPUT } from '../../src/core/input'

const DT = 1 / 60

/** A playing-phase state seeded deterministically, with optional overrides. */
function playing(overrides: Partial<GameState> = {}): GameState {
  return { ...initialState(1), ...overrides }
}

/** A trench run ARMED AND AT THE WALL: the proton-torpedo latch closed and the port
 *  already inside the near-cockpit approach window, so the next step detonates it.
 *  This is the state every winning run is in on its killing frame. */
function portKill(state: GameState): GameState {
  // sw3-15: a port kill only resolves once the port has scrolled into the near-cockpit
  // approach window, so seat the (dead-centre) port in-window rather than at its far
  // spawn distance.
  //
  // sw7-17: the bolt that used to be parked here is gone — the laser is HITSCAN, and
  // nothing the player fires exists as an object any more. It cannot be replaced by "aim
  // at the port and pull the trigger" ON THIS FRAME either, and not for a fixture reason:
  // a port 300 ahead of a pilot flying 768 above the floor lies 68.7° below him, and the
  // 60° FOV yoke reaches 30°. That shot is unmakeable, which is the whole point of sw5-6's
  // ARM-early / RESOLVE-late split — the pilot earns it far out where the port is still a
  // reachable ~17.7° (WSLAZR.MAC's PT.LZF box), and the machine takes it at the ROM's $800
  // gate. So the honest one-frame fixture for "this run wins now" is the latch, not a shot:
  // armed earlier, resolving here. The laser's own arming is pinned in tune-cue.test.ts /
  // exhaust-port-challenge.test.ts; what this suite is about is the CUE on the kill frame.
  const p = state.exhaustPort!.pos
  const port: typeof p = [p[0], p[1], -300]
  return {
    ...state,
    mode: 'playing',
    exhaustPort: { pos: port },
    portTorpedoArmed: true,
  }
}

/** Every speech line the CORE cues in this story — pins the `SpeechLine` union
 *  members at compile time (a renamed/missing id is a type error, not a silent
 *  pass) and names the reachable subset the wiring covers. */
const WIRED_LINES: SpeechLine[] = [
  'redFiveStandingBy',
  'lookAtTheSizeOfThatThing',
  'useTheForceLuke',
  'greatShotKidThatWasOneInAMillion',
]

/** Pull the speech lines emitted this frame, in order. */
function spokenLines(s: GameState): string[] {
  return s.events.filter((e) => e.type === 'speech').map((e) => (e.type === 'speech' ? e.line : ''))
}

describe('SpeechEvent — a core GameEvent variant (AC2)', () => {
  it('is a discriminated `speech` variant carrying a SpeechLine', () => {
    const events: GameEvent[] = WIRED_LINES.map((line) => ({ type: 'speech', line }))
    for (const e of events) {
      expect(e.type).toBe('speech')
      // Narrow on the discriminant and read the payload field by name.
      if (e.type === 'speech') expect(typeof e.line).toBe('string')
    }
  })

  it('cues four DISTINCT reachable lines (the session-scoped subset)', () => {
    expect(new Set(WIRED_LINES).size).toBe(4)
  })
})

describe('speech cue — run start (AC2)', () => {
  it("cues 'Red Five standing by' alongside player-spawn when a run begins", () => {
    const out = stepGame(playing({ mode: 'attract' }), { ...NO_INPUT, start: true }, DT)
    expect(out.mode).toBe('playing')
    expect(out.events).toContainEqual({ type: 'player-spawn' })
    expect(out.events).toContainEqual({ type: 'speech', line: 'redFiveStandingBy' })
  })
})

describe('speech cue — entering the Death Star surface (AC2)', () => {
  it("cues 'Look at the size of that thing' on the space -> surface transition", () => {
    const out = stepGame(playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA }), NO_INPUT, DT)
    expect(out.phase).toBe('surface') // the transition actually happened
    expect(out.events).toContainEqual({ type: 'level-clear', next: 'surface' })
    expect(out.events).toContainEqual({ type: 'speech', line: 'lookAtTheSizeOfThatThing' })
  })

  it('does NOT cue the trench line on the surface transition (right line, right moment)', () => {
    const out = stepGame(playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA }), NO_INPUT, DT)
    expect(out.events).not.toContainEqual({ type: 'speech', line: 'useTheForceLuke' })
  })
})

describe('speech cue — entering the trench (AC2)', () => {
  it("cues 'Use the Force, Luke' on the surface -> trench transition", () => {
    const out = stepGame(playing({ phase: 'surface', phaseKills: towersForWave(1) }), NO_INPUT, DT)
    expect(out.phase).toBe('trench') // the transition actually happened
    expect(out.events).toContainEqual({ type: 'level-clear', next: 'trench' })
    expect(out.events).toContainEqual({ type: 'speech', line: 'useTheForceLuke' })
  })

  it('cues the trench line exactly ONCE — not re-emitted on later trench frames', () => {
    const entered = stepGame(
      playing({ phase: 'surface', phaseKills: towersForWave(1) }),
      NO_INPUT,
      DT,
    )
    expect(entered.phase).toBe('trench')
    expect(spokenLines(entered)).toContain('useTheForceLuke')
    // A subsequent frame still in the trench (port far downrange, no hit) must be
    // silent — the cue fires on the EDGE, not every frame it is in the trench.
    const next = stepGame({ ...entered, mode: 'playing' }, NO_INPUT, DT)
    expect(next.phase).toBe('trench')
    expect(spokenLines(next)).not.toContain('useTheForceLuke')
  })
})

describe('speech cue — the exhaust-port kill (AC2)', () => {
  // sw7-2: Han's line is WAVE-GATED — the ROM speaks it only on human waves {4,6,8,...}
  // (WSMAIN:1919, the same 0-based GM.WAV gate as the Imperial March), not on every
  // kill. These fixtures kill the port on wave 4 (a speaking wave) to isolate the
  // clean/dirty Force-bonus contract; the exhaustive wave map is in
  // tests/core/wave-parity-gates.test.ts.
  it("cues 'Great shot kid...' on a speaking wave when the port is destroyed (clean kill)", () => {
    const s0 = { ...portKill(enterPhase(initialState(1983), 'trench')), wave: 4, trenchShotsFired: 0 }
    const out = stepGame(s0, NO_INPUT, DT)
    expect(out.events).toContainEqual({
      type: 'speech',
      line: 'greatShotKidThatWasOneInAMillion',
    })
    // The clean-run Force bonus rides the same frame (existing behaviour, unbroken).
    expect(out.events).toContainEqual({ type: 'force-bonus', amount: FORCE_BONUS })
  })

  it("cues 'Great shot kid...' on a DIRTY port kill too — the line is the winning shot, not the Force bonus", () => {
    const s0 = { ...portKill(enterPhase(initialState(1983), 'trench')), wave: 4, trenchShotsFired: 3 }
    const out = stepGame(s0, NO_INPUT, DT)
    expect(out.events).toContainEqual({
      type: 'speech',
      line: 'greatShotKidThatWasOneInAMillion',
    })
    // ...but a dirty run earns no Force bonus — the two cues are independent.
    expect(out.events.some((e) => e.type === 'force-bonus')).toBe(false)
  })
})

describe('speech cue — silence when nothing cues (AC4: no lines fire out of sequence)', () => {
  it('an idle space frame emits no speech', () => {
    expect(spokenLines(stepGame(playing(), NO_INPUT, DT))).toEqual([])
  })

  it('merely firing the laser emits no speech (fire is not a voice cue)', () => {
    const out = stepGame(playing(), { ...NO_INPUT, fire: true }, DT)
    expect(out.events).toContainEqual({ type: 'fire' })
    expect(spokenLines(out)).toEqual([])
  })

  it('a plain trench frame with no port hit emits no speech', () => {
    const trench = { ...enterPhase(initialState(1983), 'trench'), mode: 'playing' as const }
    expect(spokenLines(stepGame(trench, NO_INPUT, DT))).toEqual([])
  })
})

describe('speech cues are deterministic (AC2 — pure core)', () => {
  it('identical seed + inputs replay identical speech cues across a run', () => {
    function speechStream(seed: number): string[] {
      // Drive a scripted run to the trench: clear space, clear surface, then hold.
      let s: GameState = { ...initialState(seed), phase: 'space', phaseKills: SPACE_WAVE_QUOTA }
      const lines: string[] = []
      for (let f = 0; f < 3; f++) {
        // After the space->surface step, force the surface quota so the next step
        // advances to the trench — a fixed script, no RNG divergence.
        if (s.phase === 'surface') s = { ...s, phaseKills: towersForWave(1) }
        s = stepGame(s, NO_INPUT, DT)
        lines.push(...spokenLines(s))
      }
      return lines
    }
    const a = speechStream(1983)
    const b = speechStream(1983)
    expect(a).toEqual(b)
    // The scripted run really did cross both cue edges.
    expect(a).toContain('lookAtTheSizeOfThatThing')
    expect(a).toContain('useTheForceLuke')
  })
})
