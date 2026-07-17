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
//   space @ ROM {4,6,8}   Sound_1D        'imperialMarch'  (replaces 'space')
//
// The last row is the space-wave loop (WSMAIN:1421 / sub_6838): it plays the
// Imperial March INSTEAD of the space theme on human 1-based waves {4,6,8,...} —
// the ROM gate `LDA GM.WAV / CMPA #4-1 / IFGE / ANDA #1 / IFNE` reads the 0-based
// counter (GM.WAV >= 3 AND odd), which is human wave >= 4 AND even. (sw3-5 shipped
// the 1-based misread {3,5,7,...}; sw7-2 corrected it — see wave-parity-gates.test.)
// The Imperial March replaces ONLY the space theme — towers/trench are wave-independent.
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
import type { MusicTrack } from '../../src/core/events'
import { stepGame, enterPhase } from '../../src/core/sim'
import {
  initialState,
  SPACE_WAVE_QUOTA,
  towersForWave,
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

/** A run ARMED AND AT THE WALL, so the NEXT step destroys the port — driving the
 *  trench->next-wave-space `clearRun` edge (mirrors speech-cues.test.ts). */
function portKill(state: GameState): GameState {
  // sw3-15: a port kill now only resolves in the near-cockpit approach window,
  // so seat the (dead-centre) port in-window rather than at its far spawn distance.
  // sw7-17: the laser is HITSCAN, so the bolt that used to be parked on the port is
  // gone — and a port 300 ahead of a pilot flying 768 above the floor sits 68.7° below
  // him, past the 30° the yoke reaches, so it cannot become "shoot it this frame"
  // either. A real run wins the way this fixture does: the torpedo latch closed far
  // out (where the port IS reachable), resolving here at the ROM's $800 gate — sw5-6's
  // ARM-early / RESOLVE-late split. See speech-cues.test.ts's twin.
  const p = state.exhaustPort!.pos
  const port: typeof p = [p[0], p[1], -300]
  return {
    ...state,
    exhaustPort: { pos: port },
    portTorpedoArmed: true,
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
  it('emits every MusicTrack the union declares across real phase edges', () => {
    // Folds the old compile-time "is a `music` variant" / "4 distinct tracks" pins
    // (which only inspected the local MUSIC_TRACKS fixture, never production) into one
    // BEHAVIORAL check: every track the union declares must actually be reachable as a
    // `music` cue — so the union carries no dead member and no edge is missing its
    // theme. The `MUSIC_TRACKS: MusicTrack[]` annotation still pins the union at
    // COMPILE time (a renamed/dropped member is a type error here); "4 distinct .wav
    // files" is pinned against the real MUSIC export in tests/shell/music-channel.
    const emitted = new Set<string>([
      // run start -> space theme
      ...musicTracks(stepGame(playing({ mode: 'attract' }), { ...NO_INPUT, start: true }, DT)),
      // space -> surface: towers theme
      ...musicTracks(
        stepGame(playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA }), NO_INPUT, DT),
      ),
      // surface -> trench: trench theme
      ...musicTracks(
        stepGame(playing({ phase: 'surface', phaseKills: towersForWave(1) }), NO_INPUT, DT),
      ),
      // trench clear into wave 4 (even, >=4): Imperial March replaces the space theme
      ...musicTracks(stepGame(portKill(trenchAtWave(1983, 3)), NO_INPUT, DT)),
    ])
    expect(emitted).toEqual(new Set<string>(MUSIC_TRACKS))
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
    const out = stepGame(playing({ phase: 'surface', phaseKills: towersForWave(1) }), NO_INPUT, DT)
    expect(out.phase).toBe('trench') // the transition actually happened
    expect(out.events).toContainEqual({ type: 'level-clear', next: 'trench' })
    expect(out.events).toContainEqual({ type: 'music', track: 'trench' })
  })
})

describe('music cue — the Imperial March replaces the space theme on ROM waves {4,6,8,...} (AC3)', () => {
  // ROM gate WSMAIN:1421 reads the 0-based GM.WAV: March iff GM.WAV>=3 AND GM.WAV odd
  // = human 1-based wave >= 4 AND even. sw7-2 corrected sw3-5's 1-based {3,5,7,...}
  // misread. The exhaustive wave map lives in tests/core/wave-parity-gates.test.ts.
  it('plays the plain space theme entering wave 2 (even but < 4) after a run clears', () => {
    const out = stepGame(portKill(trenchAtWave(1983, 1)), NO_INPUT, DT)
    expect(out.wave).toBe(2)
    expect(musicTracks(out)).toContain('space')
    expect(musicTracks(out)).not.toContain('imperialMarch')
  })

  it('plays the plain space theme entering wave 3 (odd) — the March needs an EVEN wave', () => {
    const out = stepGame(portKill(trenchAtWave(1983, 2)), NO_INPUT, DT)
    expect(out.wave).toBe(3)
    expect(musicTracks(out)).toContain('space')
    expect(musicTracks(out)).not.toContain('imperialMarch')
  })

  it('plays the Imperial March entering wave 4 (even, >= 4) after a run clears', () => {
    const out = stepGame(portKill(trenchAtWave(1983, 3)), NO_INPUT, DT)
    // The whole run cleared and looped one wave harder into the space phase.
    expect(out.phase).toBe('space')
    expect(out.wave).toBe(4)
    expect(out.events).toContainEqual({ type: 'level-clear', next: 'space' })
    expect(musicTracks(out)).toContain('imperialMarch')
    expect(musicTracks(out)).not.toContain('space')
  })

  it('plays the plain space theme entering wave 5 (odd) — the gate needs EVEN, not just >= 4', () => {
    const out = stepGame(portKill(trenchAtWave(1983, 4)), NO_INPUT, DT)
    expect(out.wave).toBe(5)
    expect(musicTracks(out)).toContain('space')
    expect(musicTracks(out)).not.toContain('imperialMarch')
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
      playing({ phase: 'surface', phaseKills: towersForWave(3), wave: 3 }),
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
    const entered = stepGame(playing({ phase: 'surface', phaseKills: towersForWave(1) }), NO_INPUT, DT)
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
    // Re-seated by sw4-3: wave 2's authored maze is BUNK — bunkers only, ZERO towers
    // — so there is no tower quota to meet and `phaseKills: towersForWave(2)` (= 0)
    // no longer crosses the surface->trench edge (it used to insta-clear the phase on
    // entry and gift a free 50,000; that was the bug). Wave 2 leaves the surface the
    // authentic way: scroll-COMPLETION, once its finite field has swept past. Seat the
    // scroll beyond any authored field depth (deepest maze reaches y=32768 + the
    // SPAWN_DISTANCE lead-in) so this frame IS the edge. The cue under test — the
    // trench theme on a second run — is unchanged.
    const out = stepGame(
      playing({ phase: 'surface', surfaceScrollZ: 100_000, wave: 2 }),
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
        if (s.phase === 'surface') s = { ...s, phaseKills: towersForWave(s.wave) }
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
