// tests/core/music-cue.test.ts
//
// RED-phase suite for Story sw3-5 — "Phase music engine: a looping music channel
// driven off phase edges". The 1983 cabinet swaps its looping background music at
// each phase edge (docs/star-wars-1983-source-findings.md, "## Sound hooks"):
//
//   phase edge            ROM cue         our track
//   ----------------------------------------------------
//   run start / space     Sound_24/$25    'space'
//   Death Star surface    Sound_20/$21    'towers'   (ROM "Towers music")
//   trench run            Sound_22        'trench'
//   space @ wave>=3 odd   Sound_1D        'imperialMarch'  (replaces 'space')
//
// The last row is the space-wave loop `sub_6838`: it plays the Imperial March
// INSTEAD of the space theme when the wave is >= 3 AND odd. The Imperial March
// replaces ONLY the space theme — the towers/trench themes are wave-independent.
//
// DESIGN (TEA's call, delegated by the story context): the cue is a first-class
// core GameEvent, mirroring sw2-5 speech — the core decides WHICH track and WHEN
// (deterministic, tested here); the shell owns the looping playback via
// @arcade/shared/audio startLoop/stopLoop (tests/shell/music-channel.test.ts).
//
//   // src/core/events.ts  — added to the GameEvent union (nothing here exists yet)
//   type MusicTrack = 'space' | 'towers' | 'trench' | 'imperialMarch'
//   interface MusicEvent { type: 'music'; track: MusicTrack }
//
// The cue is emitted ON THE PHASE EDGE ONLY (run start, space->surface,
// surface->trench, and the trench->next-wave-space clearRun) — never on a frame
// that merely stays in a phase. A per-frame emit would re-trigger startLoop 60x a
// second and stutter the loop to silence; that is the headline regression guarded
// below, and the cousin of the sw3-4 "run two goes silent" edge/reset bug.
//
// Valid RED: `MusicTrack`/the `music` variant do not exist yet (type errors until
// GREEN, like sw3-4's `trenchTimer`), and `stepGame` emits no `music` events, so
// every behavioural assertion fails at runtime.
import { describe, it, expect } from 'vitest'
import type { GameEvent, MusicTrack } from '../../src/core/events'
import { stepGame, enterPhase } from '../../src/core/sim'
import {
  initialState,
  SPACE_WAVE_QUOTA,
  SURFACE_WAVE_QUOTA,
  PROJECTILE_TTL,
  type GameState,
} from '../../src/core/state'
import { NO_INPUT } from '../../src/core/input'

const DT = 1 / 60

/** A playing-phase state seeded deterministically, with optional overrides
 *  (initialState already opens in mode 'playing', phase 'space', wave 1). */
function playing(overrides: Partial<GameState> = {}): GameState {
  return { ...initialState(1), ...overrides }
}

/** A clean trench run at a chosen `wave` (the Imperial-March parity source). Wall
 *  obstacles cleared so a catwalk crash can't cut the run short (mirrors
 *  trench-voice-timer.test.ts's freshTrench). */
function trenchAtWave(seed: number, wave: number): GameState {
  return { ...enterPhase(initialState(seed), 'trench'), mode: 'playing', wave, trenchObstacles: [] }
}

/** Park a bolt on the exhaust port so the NEXT step destroys it — driving the
 *  trench->next-wave-space `clearRun` edge (mirrors speech-cues.test.ts). */
function portKill(state: GameState): GameState {
  const port = state.exhaustPort!.pos
  return {
    ...state,
    projectiles: [{ pos: [port[0], port[1], port[2]], vel: [0, 0, -1], ttl: PROJECTILE_TTL }],
  }
}

/** The music tracks cued this frame, in order (mirrors speech-cues' spokenLines). */
function musicTracks(s: GameState): string[] {
  return s.events.filter((e) => e.type === 'music').map((e) => (e.type === 'music' ? e.track : ''))
}

/** Every track the engine can cue — pins the `MusicTrack` union members at compile
 *  time (a renamed/missing id is a type error, not a silent pass). */
const MUSIC_TRACKS: MusicTrack[] = ['space', 'towers', 'trench', 'imperialMarch']

describe('MusicEvent — a core GameEvent variant (AC2)', () => {
  it('is a discriminated `music` variant carrying a MusicTrack', () => {
    const events: GameEvent[] = MUSIC_TRACKS.map((track) => ({ type: 'music', track }))
    for (const e of events) {
      expect(e.type).toBe('music')
      if (e.type === 'music') expect(typeof e.track).toBe('string')
    }
  })

  it('names four DISTINCT tracks — space, towers, trench, Imperial March', () => {
    expect(new Set(MUSIC_TRACKS).size).toBe(4)
  })
})

describe('music cue — run start opens the space theme (AC2)', () => {
  it('cues the space theme alongside player-spawn when a run begins', () => {
    const out = stepGame(playing({ mode: 'attract' }), { ...NO_INPUT, start: true }, DT)
    expect(out.mode).toBe('playing')
    expect(out.phase).toBe('space')
    expect(out.events).toContainEqual({ type: 'player-spawn' })
    expect(out.events).toContainEqual({ type: 'music', track: 'space' })
  })

  it('opens the PLAIN space theme on wave 1 (odd but < 3 — no Imperial March)', () => {
    const out = stepGame(playing({ mode: 'attract' }), { ...NO_INPUT, start: true }, DT)
    expect(musicTracks(out)).toContain('space')
    expect(musicTracks(out)).not.toContain('imperialMarch')
  })
})

describe('music cue — entering the Death Star surface plays the towers theme (AC2)', () => {
  it("swaps to the 'towers' theme on the space -> surface edge", () => {
    const out = stepGame(playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA }), NO_INPUT, DT)
    expect(out.phase).toBe('surface') // the transition actually happened
    expect(out.events).toContainEqual({ type: 'level-clear', next: 'surface' })
    expect(out.events).toContainEqual({ type: 'music', track: 'towers' })
  })

  it("names the surface track for the ROM 'towers' music, not the 'surface' phase", () => {
    const out = stepGame(playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA }), NO_INPUT, DT)
    // Deliberate: the surface phase's authentic music is Sound_20/21 "Towers music".
    expect(musicTracks(out)).toContain('towers')
    expect(musicTracks(out)).not.toContain('surface')
  })

  it('does NOT play the trench theme on the surface edge (right theme, right moment)', () => {
    const out = stepGame(playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA }), NO_INPUT, DT)
    expect(musicTracks(out)).not.toContain('trench')
  })
})

describe('music cue — entering the trench plays the trench theme (AC2)', () => {
  it("swaps to the 'trench' theme on the surface -> trench edge", () => {
    const out = stepGame(playing({ phase: 'surface', phaseKills: SURFACE_WAVE_QUOTA }), NO_INPUT, DT)
    expect(out.phase).toBe('trench') // the transition actually happened
    expect(out.events).toContainEqual({ type: 'level-clear', next: 'trench' })
    expect(out.events).toContainEqual({ type: 'music', track: 'trench' })
  })
})

describe('music cue — the Imperial March replaces the space theme at wave>=3 odd (AC3)', () => {
  it('plays the Imperial March entering wave 3 (odd, >=3) after a run clears', () => {
    const out = stepGame(portKill(trenchAtWave(1983, 2)), NO_INPUT, DT)
    // The whole run cleared and looped one wave harder into the space phase.
    expect(out.phase).toBe('space')
    expect(out.wave).toBe(3)
    expect(out.events).toContainEqual({ type: 'level-clear', next: 'space' })
    expect(musicTracks(out)).toContain('imperialMarch')
    expect(musicTracks(out)).not.toContain('space')
  })

  it('plays the plain space theme entering wave 2 (even) after a run clears', () => {
    const out = stepGame(portKill(trenchAtWave(1983, 1)), NO_INPUT, DT)
    expect(out.wave).toBe(2)
    expect(musicTracks(out)).toContain('space')
    expect(musicTracks(out)).not.toContain('imperialMarch')
  })

  it('plays the plain space theme entering wave 4 (even, >=3) — the gate needs ODD, not just >=3', () => {
    const out = stepGame(portKill(trenchAtWave(1983, 3)), NO_INPUT, DT)
    expect(out.wave).toBe(4)
    expect(musicTracks(out)).toContain('space')
    expect(musicTracks(out)).not.toContain('imperialMarch')
  })

  it('plays the Imperial March entering wave 5 (odd, >=3)', () => {
    const out = stepGame(portKill(trenchAtWave(1983, 4)), NO_INPUT, DT)
    expect(out.wave).toBe(5)
    expect(musicTracks(out)).toContain('imperialMarch')
    expect(musicTracks(out)).not.toContain('space')
  })

  it('replaces ONLY the space theme — the towers/trench edges are unchanged at wave 3', () => {
    // Imperial March is the space-wave loop (sub_6838); the surface/trench themes
    // never become the March, whatever the wave/parity.
    const toSurface = stepGame(
      playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA, wave: 3 }),
      NO_INPUT,
      DT,
    )
    expect(toSurface.phase).toBe('surface')
    expect(musicTracks(toSurface)).toContain('towers')
    expect(musicTracks(toSurface)).not.toContain('imperialMarch')

    const toTrench = stepGame(
      playing({ phase: 'surface', phaseKills: SURFACE_WAVE_QUOTA, wave: 3 }),
      NO_INPUT,
      DT,
    )
    expect(toTrench.phase).toBe('trench')
    expect(musicTracks(toTrench)).toContain('trench')
    expect(musicTracks(toTrench)).not.toContain('imperialMarch')
  })
})

describe('the cue fires on the EDGE, not every frame (AC1/AC4 — one startLoop per phase, not 60/sec)', () => {
  it('emits exactly one music cue entering the trench, and none on the next trench frame', () => {
    const entered = stepGame(playing({ phase: 'surface', phaseKills: SURFACE_WAVE_QUOTA }), NO_INPUT, DT)
    expect(entered.phase).toBe('trench')
    expect(musicTracks(entered)).toEqual(['trench']) // exactly one, exactly this track
    // A subsequent frame still in the trench (port far downrange, no hit) must be
    // musically silent — the cue rides the EDGE, not every frame in the phase. A
    // per-frame emit would re-start the loop every step and never let it play.
    const next = stepGame({ ...entered, mode: 'playing' }, NO_INPUT, DT)
    expect(next.phase).toBe('trench')
    expect(musicTracks(next)).toEqual([])
  })

  it('an idle space frame right after the run starts emits no music cue', () => {
    const started = stepGame(playing({ mode: 'attract' }), { ...NO_INPUT, start: true }, DT)
    expect(musicTracks(started)).toContain('space') // the edge fired
    const idle = stepGame(started, NO_INPUT, DT) // still space, not an edge
    expect(idle.phase).toBe('space')
    expect(musicTracks(idle)).toEqual([])
  })

  it('an idle surface frame (already entered) emits no music cue', () => {
    const entered = stepGame(playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA }), NO_INPUT, DT)
    expect(entered.phase).toBe('surface')
    const idle = stepGame({ ...entered, mode: 'playing' }, NO_INPUT, DT)
    expect(idle.phase).toBe('surface')
    expect(musicTracks(idle)).toEqual([])
  })

  it('a plain trench frame that is not an edge emits no music', () => {
    // Already IN the trench (not entering it) — stepping forward is not an edge.
    const trench: GameState = { ...enterPhase(initialState(7), 'trench'), mode: 'playing' }
    expect(musicTracks(stepGame(trench, NO_INPUT, DT))).toEqual([])
  })
})

describe('no run-two-silent regression — a later wave still cues its edges (AC4)', () => {
  it('a second run (wave 2) still swaps to the towers theme entering the surface', () => {
    const out = stepGame(
      playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA, wave: 2 }),
      NO_INPUT,
      DT,
    )
    expect(out.phase).toBe('surface')
    expect(musicTracks(out)).toContain('towers')
  })

  it('a second run (wave 2) still swaps to the trench theme entering the trench', () => {
    const out = stepGame(
      playing({ phase: 'surface', phaseKills: SURFACE_WAVE_QUOTA, wave: 2 }),
      NO_INPUT,
      DT,
    )
    expect(out.phase).toBe('trench')
    expect(musicTracks(out)).toContain('trench')
  })

  it('the music cue rides the clearRun return path (fires alongside level-clear on the port-kill frame)', () => {
    // The port kill runs the most complex return path (stepTrench -> clearRun ->
    // enterPhase); the music cue, like the level-clear, must still ride the frame out.
    const out = stepGame(portKill(trenchAtWave(1983, 1)), NO_INPUT, DT)
    expect(out.events).toContainEqual({ type: 'level-clear', next: 'space' })
    expect(musicTracks(out).length).toBe(1) // exactly one music cue on the wave-clear edge
  })
})

describe('music cues are deterministic (AC4 — pure core)', () => {
  it('identical seed + inputs replay identical music cues across a scripted run', () => {
    function musicStream(seed: number): string[] {
      // Drive a scripted run across both quota edges: clear space, then surface.
      let s: GameState = { ...initialState(seed), phase: 'space', phaseKills: SPACE_WAVE_QUOTA }
      const tracks: string[] = []
      for (let f = 0; f < 3; f++) {
        if (s.phase === 'surface') s = { ...s, phaseKills: SURFACE_WAVE_QUOTA }
        s = stepGame(s, NO_INPUT, DT)
        tracks.push(...musicTracks(s))
      }
      return tracks
    }
    const a = musicStream(1983)
    const b = musicStream(1983)
    expect(a).toEqual(b)
    // The scripted run really did cross both music edges.
    expect(a).toContain('towers')
    expect(a).toContain('trench')
  })
})
