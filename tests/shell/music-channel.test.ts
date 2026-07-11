// tests/shell/music-channel.test.ts
//
// RED-phase suite for Story sw3-5 (shell side) — the looping music channel and the
// event->music wiring. The core decides WHICH track and WHEN (a `music` GameEvent,
// see tests/core/music-cue.test.ts); the shell owns HOW: a sustained, looping
// sample on a dedicated `music` channel, played via @arcade/shared/audio's
// startLoop/stopLoop (SH2-16/SH2-17). Voice-stealing on that one channel means
// exactly one music loop rings at a time and the next startLoop swaps it — the
// looping channel the story needs, already built shared; sw3-5 only surfaces it.
//
// shell/audio.ts already CONSTRUCTS the shared engine but its local AudioEngine
// interface only re-exposes resume/play/speak/ready. This story must (a) surface
// startLoop/stopLoop and (b) add a MUSIC manifest (track -> R2 `.wav`). Nothing
// here exists yet: `startLoop`/`stopLoop`/`MUSIC`/`MusicName` are absent, so the
// value import and the API-surface assertions are RED today (valid RED).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAudioEngine, MUSIC, MUSIC_CHANNELS, type MusicName } from '../../src/shell/audio'
// Read main.ts as text (Vite `?raw`) for the event->music wiring check — main.ts
// bootstraps a canvas and cannot be imported in the node test env (as audio.test.ts).
import mainSrc from '../../src/main.ts?raw'

// The four looping tracks the core's `music` GameEvent can cue. Typed as
// MusicName[], this is a COMPILE-TIME assertion that the MUSIC manifest declares a
// file for each — a missing key is a type error, not a silent pass, and the shell
// pump's startLoop(event.track) type-checks against it (MusicTrack ⊆ MusicName).
const REQUIRED_MUSIC: MusicName[] = ['space', 'towers', 'trench', 'imperialMarch']

// Minimal Web Audio stub — Node's test env has none. state='running' keeps
// resume() from awaiting. These tests exercise only the no-op guard paths
// (unavailable / pre-load), so no createBufferSource is needed.
class FakeAudioContext {
  state = 'running'
  destination = {}
  createGain() {
    return { gain: { value: 0 }, connect() {} }
  }
  decodeAudioData() {
    return Promise.resolve({})
  }
  resume() {
    return Promise.resolve()
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', (input: string) =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)), url: input }),
  )
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the music channel is single — exactly one loop rings at a time (AC1)', () => {
  it('maps every track to ONE shared channel, so a new track voice-steals the old', () => {
    // AC1's headline guarantee: all tracks share a single logical channel, so
    // startLoop voice-steals whatever was looping and exactly one music loop plays;
    // a phase edge swaps it. Give ANY track its own channel and two loops could ring
    // at once (the mutation-proven regression this pins: e.g. imperialMarch: 'music'
    // -> 'music-imperial' would let the March play over a phase theme). Read straight
    // off the production MUSIC_CHANNELS map — not a local fixture.
    const channels = Object.values(MUSIC_CHANNELS)
    expect(channels.length).toBe(REQUIRED_MUSIC.length) // one channel mapping per track
    expect(new Set(channels).size).toBe(1) // ...and they are all the SAME channel
  })

  it('declares a channel for exactly the four core tracks (no track left unmapped)', () => {
    expect(new Set(Object.keys(MUSIC_CHANNELS))).toEqual(new Set(REQUIRED_MUSIC))
  })
})

describe('audio engine exposes the looping music channel (AC1)', () => {
  it('surfaces startLoop and stopLoop as functions', () => {
    const engine = createAudioEngine()
    expect(typeof engine.startLoop).toBe('function')
    expect(typeof engine.stopLoop).toBe('function')
  })

  it('startLoop/stopLoop are safe no-ops before any sample has loaded', () => {
    const engine = createAudioEngine()
    // No resume() yet — no AudioContext — must not throw.
    expect(() => engine.startLoop('space')).not.toThrow()
    expect(() => engine.stopLoop('space')).not.toThrow()
  })

  it('startLoop/stopLoop stay silent (no throw) when WebAudio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    const engine = createAudioEngine()
    engine.resume()
    expect(() => engine.startLoop('trench')).not.toThrow()
    expect(() => engine.stopLoop('trench')).not.toThrow()
  })
})

describe('MUSIC manifest — a track per core cue (AC5)', () => {
  it('declares an R2 `.wav` for every one of the four core music tracks', () => {
    for (const track of REQUIRED_MUSIC) {
      expect(typeof MUSIC[track]).toBe('string')
      expect(MUSIC[track].endsWith('.wav')).toBe(true)
    }
  })

  it('declares exactly the four tracks — no phantom entries, no omissions', () => {
    expect(new Set(Object.keys(MUSIC))).toEqual(new Set(REQUIRED_MUSIC))
  })

  it('every manifest file is a distinct `.wav` (each track has its own loop)', () => {
    const files = Object.values<string>(MUSIC)
    for (const f of files) expect(f.endsWith('.wav')).toBe(true)
    expect(new Set(files).size).toBe(files.length)
  })
})

describe('event -> music wiring in main.ts (AC5)', () => {
  // The core emits a `music` GameEvent on each phase edge; the shell pump in
  // main.ts drains state.events and drives the looping channel. Asserted at the
  // source level — main.ts boots a canvas and cannot be imported in node.
  it('handles the `music` event type in the pump', () => {
    expect(mainSrc).toMatch(/case\s+['"]music['"]/)
  })

  it('starts the looping channel from the cued track (startLoop(event.track))', () => {
    // One generic arm, mirroring sw2-5's speak(event.line): startLoop reads the
    // event's `track`, so every current AND future track loops with no shell change.
    expect(mainSrc).toMatch(/\.startLoop\(\s*\w+\.track\s*\)/)
  })
})
