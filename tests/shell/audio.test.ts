// tests/shell/audio.test.ts
//
// RED-phase suite for Story 8-7 — the shell-side WebAudio SFX engine and the
// event->sound wiring. Mirrors tempest's proven audio pattern (the story's
// stated reuse target) adapted to star-wars' sound set.
//
// The engine (shell/audio.ts) is IO, not simulation: it loads the game's `.wav`
// samples from Cloudflare R2 and plays them by name, and EVERY failure mode
// (no WebAudio, blocked autoplay, failed fetch, undecodable sample) degrades
// silently rather than throwing. The pure core never imports it.
//
// Nothing here exists yet: `src/shell/audio.ts` is absent, so the value imports
// below fail to resolve and the whole file is RED today (valid RED).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAudioEngine, SPEECH, type SoundName, type SpeechName } from '../../src/shell/audio'
// Read main.ts as text (Vite `?raw`) for the event->sound wiring check below —
// main.ts bootstraps a canvas, so it cannot be imported in the node test env.
import mainSrc from '../../src/main.ts?raw'
// The AUTHENTIC line inventory: the baked TMS5220 catalogue (tools/speech-bake),
// read as text so the "all 23 listed" check is single-sourced to the real data
// rather than a hand-copied list that could drift (sw2-5 AC1).
import speechDataSrc from '../../tools/speech-bake/speech-data.mjs?raw'

// star-wars SFX live under their own prefix on the shared arcade assets host
// (mirrors tempest's '/tempest/sfx/' layout).
const R2 = 'https://arcade-assets.slabgorb.com/star-wars/sfx/'

// The logical sound names the event->sound pump plays. Typed as SoundName[],
// this is a COMPILE-TIME assertion that the audio manifest declares each key —
// a missing key is a type error, not a silent pass. One per audio-bearing event.
const REQUIRED_SOUNDS: SoundName[] = [
  'fire',
  'enemyFire',
  'enemyDeath',
  'playerDeath',
  'levelClear',
  'playerSpawn',
  'terrainCrash',
]

// The speech lines the CORE cues (sw2-5 phase-edge subset + sw3-4 trench timer).
// Typed as SpeechName[], this is a COMPILE-TIME assertion that the SPEECH
// catalogue declares a filename for each core-emittable line — a missing key is a
// type error, not a silent pass, and the shell pump's `speak(event.line)`
// type-checks against it. The event->speak pump is generic, so wiring sw3-4's
// three trench lines needed no pump change — only their catalogue coverage here.
const REQUIRED_SPEECH: SpeechName[] = [
  'useTheForceLuke',
  'redFiveStandingBy',
  'lookAtTheSizeOfThatThing',
  'greatShotKidThatWasOneInAMillion',
  // sw3-4 — trench voice-line timer (word_4B0E, parity-gated by wave)
  'lukeTrustMe', // trench timer 16, even run
  'youreAllClearKid', // trench timer 24, even run
  'theForceIsStrongInThisOne', // trench timer 22, odd run
]

// The authentic baked line names (snake_case → `${name}.wav`), scraped from the
// speech-bake catalogue that generated the R2 files. The cabinet has 23.
const BAKED_NAMES: string[] = [...speechDataSrc.matchAll(/name:\s*["']([^"']+)["']/g)].map(
  (m) => m[1],
)

// The engine builds an AudioContext lazily in resume(), reading the constructor
// off globalThis. Node's test env has no Web Audio, so we stub a minimal fake.
// state='running' keeps resume() from awaiting ctx.resume(); the fetch CALL in
// load() is synchronous, so the requested URLs are captured by the time resume()
// returns (the decode chain that follows is async).
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

let fetched: string[]

beforeEach(() => {
  fetched = []
  vi.stubGlobal('fetch', (input: string) => {
    fetched.push(input)
    return Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })
  })
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('audio engine sample loading (AC3)', () => {
  it('fetches at least one .wav per required sound, all from the R2 base', () => {
    createAudioEngine().resume()
    expect(fetched.length).toBeGreaterThanOrEqual(REQUIRED_SOUNDS.length)
    for (const url of fetched) {
      expect(url.startsWith(R2)).toBe(true)
      expect(url.endsWith('.wav')).toBe(true)
    }
  })

  it('resolves every sample against a custom base URL', () => {
    createAudioEngine('https://cdn.test/x/').resume()
    expect(fetched.length).toBeGreaterThan(0)
    for (const url of fetched) {
      expect(url.startsWith('https://cdn.test/x/')).toBe(true)
      expect(url.endsWith('.wav')).toBe(true)
    }
  })

  it('decodes loaded samples into a ready engine', async () => {
    const engine = createAudioEngine()
    expect(engine.ready()).toBe(false)
    engine.resume()
    // flush the fetch -> arrayBuffer -> decodeAudioData microtask chain
    await vi.waitFor(() => expect(engine.ready()).toBe(true))
  })
})

describe('audio engine graceful degradation (AC3)', () => {
  it('stays silent on a failed fetch without blocking the other samples', async () => {
    // one bad sample must neither throw nor stop the rest from decoding.
    vi.stubGlobal('fetch', (input: string) => {
      fetched.push(input)
      if (input.endsWith('.wav') && fetched.length === 1) {
        return Promise.reject(new Error('network'))
      }
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })
    })
    const engine = createAudioEngine()
    engine.resume()
    await vi.waitFor(() => expect(engine.ready()).toBe(true)) // the others still load
  })

  it('does not throw and stays not-ready when WebAudio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    const engine = createAudioEngine()
    expect(() => engine.resume()).not.toThrow()
    expect(engine.ready()).toBe(false)
    expect(fetched).toEqual([]) // no context => no load attempted
  })

  it('play() is a safe no-op before any sample is loaded', () => {
    const engine = createAudioEngine()
    expect(() => engine.play('fire')).not.toThrow()
  })
})

describe('speech catalogue — all 23 cabinet lines listed (sw2-5 AC1)', () => {
  const R2_SPEECH = 'https://arcade-assets.slabgorb.com/star-wars/speech/'

  it('scrapes the full authentic 23-line catalogue from speech-bake', () => {
    // Guards the guard: if this is not 23, the source-of-truth regex broke and
    // the AC1 check below would be vacuously satisfiable.
    expect(BAKED_NAMES.length).toBe(23)
  })

  it('SPEECH declares an R2 `.wav` for every one of the 23 authentic lines (AC1)', () => {
    // `SPEECH as const` narrows its values to literal filenames; widen to string
    // so a scraped `${name}.wav` (plain string) is a valid `.has()` argument.
    const files = new Set<string>(Object.values(SPEECH))
    for (const name of BAKED_NAMES) {
      expect(files.has(`${name}.wav`)).toBe(true) // e.g. red_five_standing_by.wav
    }
    // Exactly the cabinet set — no phantom lines, no omissions.
    expect(Object.keys(SPEECH).length).toBe(23)
  })

  it('every SPEECH filename resolves under the R2 speech prefix on speak() (AC3)', () => {
    const engine = createAudioEngine()
    engine.resume()
    for (const name of Object.keys(SPEECH) as SpeechName[]) {
      const before = fetched.length
      engine.speak(name)
      const got = fetched.slice(before)
      // First speak of a line fetches exactly one URL, from the speech prefix.
      expect(got.length).toBe(1)
      expect(got[0].startsWith(R2_SPEECH)).toBe(true)
      expect(got[0].endsWith('.wav')).toBe(true)
    }
  })

  it('speaks each CORE-cued line from the R2 speech prefix (AC3)', () => {
    const engine = createAudioEngine()
    engine.resume()
    for (const name of REQUIRED_SPEECH) {
      const before = fetched.length
      engine.speak(name)
      const got = fetched.slice(before)
      expect(got.length).toBe(1)
      expect(got[0].startsWith(R2_SPEECH)).toBe(true)
      expect(got[0].endsWith('.wav')).toBe(true)
    }
  })
})

describe('audio engine speech (AC6 — TMS5220 lines)', () => {
  // Speech lines live under their own R2 prefix and load LAZILY (on first speak),
  // not eagerly on resume() like the SFX.
  const R2_SPEECH = 'https://arcade-assets.slabgorb.com/star-wars/speech/'

  it('does not eagerly load any speech on resume() (SFX only)', () => {
    createAudioEngine().resume()
    expect(fetched.length).toBeGreaterThan(0) // SFX did load
    for (const url of fetched) expect(url.startsWith(R2_SPEECH)).toBe(false)
  })

  it('lazily fetches a speech line from the R2 speech prefix on first speak()', () => {
    const engine = createAudioEngine()
    engine.resume()
    const before = fetched.length
    engine.speak('useTheForceLuke')
    const speech = fetched.slice(before)
    expect(speech.length).toBe(1)
    expect(speech[0].startsWith(R2_SPEECH)).toBe(true)
    expect(speech[0].endsWith('.wav')).toBe(true)
  })

  it('coalesces repeated speak() of the same line into one in-flight fetch', () => {
    const engine = createAudioEngine()
    engine.resume()
    const before = fetched.length
    engine.speak('useTheForceLuke')
    engine.speak('useTheForceLuke')
    expect(fetched.length - before).toBe(1) // the second cue drops while loading
  })

  it('speak() is a safe no-op when WebAudio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    const engine = createAudioEngine()
    engine.resume()
    expect(() => engine.speak('useTheForceLuke')).not.toThrow()
    expect(fetched).toEqual([]) // no context => no fetch attempted
  })
})

describe('event -> sound wiring in main.ts (AC4)', () => {
  // The core emits GameEvents (story 8-7); the shell's per-frame pump in main.ts
  // drains state.events after stepGame and maps each to a sample. Asserted at the
  // source level — main.ts boots a canvas and cannot be imported in node.
  //
  // NOTE (deviation, see session): the AC says "shell/loop.ts drains
  // state.events". loop.ts is a generic, game-state-agnostic fixed-timestep
  // driver; the pump belongs in main.ts's step callback (where the state lives),
  // matching tempest's architecture.
  it('creates the audio engine', () => {
    expect(mainSrc).toMatch(/createAudioEngine\s*\(/)
  })

  it('unlocks the AudioContext on a user gesture (lazy resume)', () => {
    expect(mainSrc).toMatch(/addEventListener\(\s*['"](pointerdown|mousedown|click|keydown)['"]/)
    expect(mainSrc).toMatch(/\.resume\(\s*\)/)
  })

  it('drains state.events each frame and plays a sample per event', () => {
    expect(mainSrc).toMatch(/\.events\b/)
    expect(mainSrc).toMatch(/\.play\(/)
  })

  it('handles every audio-bearing event type in the pump', () => {
    // Every event the pump maps to an `audio.play(...)` sample. Kept exhaustive:
    // 'fireball-destroyed'/'trench-obstacle-destroyed'/'force-bonus' were added by
    // earlier stories and 'death-star-destroyed'/'exhaust-port-missed' by sw2-4 —
    // all belong here (the pure list of audio.play events; 'speech' routes through
    // its own generic speak() arm, asserted separately below).
    for (const type of [
      'fire',
      'enemy-fire',
      'enemy-death',
      'player-death',
      'level-clear',
      'player-spawn',
      'terrain-crash',
      'fireball-destroyed',
      'trench-obstacle-destroyed',
      'force-bonus',
      'death-star-destroyed',
      'exhaust-port-missed',
    ]) {
      expect(mainSrc).toMatch(new RegExp(`['"]${type}['"]`))
    }
  })

  it('routes CORE speech events to speak() via one generic pump arm (sw2-5 AC3)', () => {
    // sw2-5: speech is now a core GameEvent ({ type:'speech', line }). The pump
    // handles it with a single arm — audio.speak(event.line) — so every current
    // AND future line is spoken without touching the shell. `\w+` matches the
    // switch scrutinee name (e.g. `event.line`).
    expect(mainSrc).toMatch(/case\s+['"]speech['"]/)
    expect(mainSrc).toMatch(/\.speak\(\s*\w+\.line\s*\)/)
  })

  it('no longer hard-codes the trench-approach speak in the shell (sw2-5 AC2)', () => {
    // The iconic line is cued by the CORE on trench entry (see
    // tests/core/speech-cues.test.ts) — NOT by a phase-edge speak() in main.ts.
    // A lingering shell trigger would double-fire it (once from the core event,
    // once from the edge), so the old hard-coded call must be gone.
    expect(mainSrc).not.toMatch(/\.speak\(\s*['"]useTheForceLuke['"]\s*\)/)
  })
})
