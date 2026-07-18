// tests/shell/tune-channel.test.ts
//
// RED-phase suite for Story sw7-8 (shell side) — the one-shot TUNE channel, the
// two dedicated SFX (U-021/U-022), and the event->audio wiring for the five
// newly-baked 1983 tunes (U-010..U-014). The core decides WHICH tune and WHEN
// (tests/core/tune-cue.test.ts); the shell owns HOW:
//
//   TUNES  — logical tune -> R2 filename, under the SAME music/ prefix as the
//            looping tracks (they are sound-board music, baked by the same
//            tools/music-bake pipeline; see tools/music-bake/tune-data.test.mjs).
//   playTune(name) — a ONE-SHOT on a single shared 'tune' channel. The 1983
//            sound board has ONE tune player (SNDPM's PKDR voices): starting a
//            tune replaces whatever tune was ringing — so all five share one
//            channel and voice-steal each other, and that channel is NOT the
//            looping 'music' channel (a knell must not kill the phase loop;
//            the loop is our sw3-5 adaptation and keeps its own channel).
//
//   SOUNDS — gains the two dedicated effects the audit found aliased:
//            deathStarBoom (AUDDF, "DETH STAR FINAL EXPLOSION", SNDAUD.MAC:1004)
//            for death-star-destroyed, and fireballHit (AUDSS, "PLAYER SHOT
//            DOWN AN ALIEN SHOT", SNDAUD.MAC:1028) for fireball-destroyed —
//            both currently reuse enemy_explosion.wav (main.ts:203 / :177).
//
// main.ts bootstraps a canvas and cannot be imported in the node test env, so
// the event->audio wiring is pinned by reading it as text (Vite `?raw`) — the
// established sw3-5 idiom (music-channel.test.ts). Each wiring pin asserts the
// NEW call AND the absence of the OLD one in the same arm, so the pins bite on
// today's code (RED) and on any regression, not just on tokens.
//
// Valid RED: TUNES / TuneName / TUNE_CHANNELS / playTune do not exist yet (the
// value import throws, type errors until GREEN), SOUNDS lacks the two new keys,
// and main.ts still aliases both events to enemyDeath.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createAudioEngine,
  MUSIC_CHANNELS,
  TUNES,
  TUNE_CHANNELS,
  SOUNDS,
  CHANNELS,
  type TuneName,
  type SoundName,
} from '../../src/shell/audio'
// main.ts as text for the wiring pins (cannot be imported: it boots a canvas).
import mainSrc from '../../src/main.ts?raw'

const MUSIC_R2 = 'https://arcade-assets.slabgorb.com/star-wars/music/'
const SFX_R2 = 'https://arcade-assets.slabgorb.com/star-wars/sfx/'

// The one-shot tunes the core's `tune` GameEvent can cue (sw7-18 adds
// finishGround / PMREB). Typed as TuneName[], this is a COMPILE-TIME assertion
// that the TUNES manifest declares a file for each (TuneName ⊆ keyof TUNES), and
// the pump's playTune(event.tune) type-checks against it.
const REQUIRED_TUNES: TuneName[] = ['deathKnell', 'cantina', 'finale', 'bensTheme', 'descent', 'finishGround']

// The exact R2 filenames — the contract the bake/upload and the fetch layer
// meet at. snake_case like every other baked asset.
const TUNE_FILES: Record<string, string> = {
  deathKnell: 'death_knell.wav',
  cantina: 'cantina.wav',
  finale: 'finale.wav',
  bensTheme: 'bens_theme.wav',
  descent: 'descent.wav',
  finishGround: 'finish_ground.wav',
}

// Minimal Web Audio stub (audio.test.ts idiom). state='running' keeps resume()
// from awaiting; the fetch CALL is synchronous so URLs are captured by return.
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
    return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })
  })
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sw7-8 — the TUNES manifest (U-010..U-014)', () => {
  it('declares every tune with its exact baked filename', () => {
    for (const tune of REQUIRED_TUNES) {
      expect(TUNES[tune], `TUNES.${tune}`).toBe(TUNE_FILES[tune])
    }
  })

  it('carries no stray keys — the manifest IS exactly the cue-able tunes', () => {
    // A "tune" with no core cue and no bake would be dead manifest weight
    // fetched on every boot; the union stays honest.
    expect(Object.keys(TUNES).sort()).toEqual([...REQUIRED_TUNES].sort())
  })

  it('loads every tune under the music/ R2 prefix on resume', () => {
    createAudioEngine().resume()
    for (const tune of REQUIRED_TUNES) {
      const url = MUSIC_R2 + TUNE_FILES[tune]
      expect(fetched, `expected resume() to fetch ${url}`).toContain(url)
    }
  })

  it('a custom SFX base URL does not drag the tunes off the music prefix', () => {
    // The music-channel guard, extended: tunes are music-pipeline assets and
    // must resolve under MUSIC_R2 even when the SFX base is overridden.
    createAudioEngine('https://cdn.test/x/').resume()
    const tuneFiles = new Set(Object.values(TUNE_FILES))
    const tuneFetches = fetched.filter((u) => tuneFiles.has(u.split('/').pop() ?? ''))
    expect(tuneFetches.length).toBeGreaterThanOrEqual(REQUIRED_TUNES.length)
    for (const url of tuneFetches) expect(url.startsWith(MUSIC_R2)).toBe(true)
  })
})

describe('sw7-8 — one tune player, exactly like the cabinet (channel design)', () => {
  it('every tune shares ONE channel — a new tune replaces the last, never stacks', () => {
    const channels = REQUIRED_TUNES.map((t) => TUNE_CHANNELS[t])
    expect(new Set(channels).size).toBe(1)
  })

  it("the tune channel is NOT the looping 'music' channel — a knell must not kill the phase loop", () => {
    const tuneChannel = TUNE_CHANNELS[REQUIRED_TUNES[0]]
    for (const loopChannel of Object.values(MUSIC_CHANNELS)) {
      expect(tuneChannel).not.toBe(loopChannel)
    }
  })

  it('playTune degrades silently when WebAudio is unavailable (the engine-wide contract)', () => {
    vi.stubGlobal('AudioContext', undefined)
    const engine = createAudioEngine()
    engine.resume()
    expect(() => engine.playTune('deathKnell')).not.toThrow()
  })

  it('playTune before resume/decode is a silent no-op, not a crash', () => {
    const engine = createAudioEngine()
    expect(() => engine.playTune('finale')).not.toThrow()
  })
})

describe('sw7-8 — the two dedicated SFX exist in the manifest (U-021/U-022)', () => {
  it('SOUNDS declares deathStarBoom and fireballHit with their baked filenames', () => {
    expect(SOUNDS.deathStarBoom).toBe('death_star_boom.wav')
    expect(SOUNDS.fireballHit).toBe('fireball_hit.wav')
  })

  it('each gets its own voice-stealing channel (the Record<SoundName, string> convention)', () => {
    // A missing key is a compile error via the CHANNELS record type; pin the
    // runtime shape too so a `as` escape can't hollow it out.
    const boom: SoundName = 'deathStarBoom'
    const hit: SoundName = 'fireballHit'
    expect(typeof CHANNELS[boom]).toBe('string')
    expect(typeof CHANNELS[hit]).toBe('string')
    expect(CHANNELS[boom]).not.toBe(CHANNELS[hit])
  })

  it('loads both under the sfx/ R2 prefix on resume', () => {
    createAudioEngine().resume()
    expect(fetched).toContain(SFX_R2 + 'death_star_boom.wav')
    expect(fetched).toContain(SFX_R2 + 'fireball_hit.wav')
  })
})

// ── main.ts wiring pins (?raw idiom — main.ts boots a canvas) ────────────────
//
// Slice each `case 'x':` arm out of the pump so the assertions are scoped to
// the arm, not the whole file — a call that merely appears SOMEWHERE in main.ts
// cannot satisfy them.
const armOf = (label: string): string => {
  const start = mainSrc.indexOf(`case '${label}':`)
  expect(start, `main.ts has a pump arm for '${label}'`).toBeGreaterThan(-1)
  const rest = mainSrc.slice(start + 1)
  const next = rest.search(/case '|default:/)
  return rest.slice(0, next === -1 ? undefined : next)
}

describe('sw7-8 — main.ts pump wiring (?raw pins)', () => {
  it("has a 'tune' arm that plays the cued tune one-shot", () => {
    const arm = armOf('tune')
    expect(arm).toMatch(/playTune\(\s*event\.tune\s*\)/)
  })

  it('death-star-destroyed fires the dedicated AUDDF boom, and no longer the TIE explosion (U-021)', () => {
    const arm = armOf('death-star-destroyed')
    expect(arm).toMatch(/play\(\s*'deathStarBoom'\s*\)/)
    expect(arm).not.toMatch(/play\(\s*'enemyDeath'\s*\)/) // bites TODAY (main.ts:203)
  })

  it('fireball-destroyed fires the dedicated AUDSS hit, and no longer the TIE explosion (U-022)', () => {
    const arm = armOf('fireball-destroyed')
    expect(arm).toMatch(/play\(\s*'fireballHit'\s*\)/)
    expect(arm).not.toMatch(/play\(\s*'enemyDeath'\s*\)/) // bites TODAY (main.ts:177)
  })

  it('trench-obstacle-destroyed keeps the generic explosion — AUDSS is the alien-shot hit, not wall furniture', () => {
    // U-022's other citation (TCHSCR.MAC:588) is the initials-entry RUB reuse,
    // not the trench obstacles; the obstacle arm stays as it is.
    const arm = armOf('trench-obstacle-destroyed')
    expect(arm).toMatch(/play\(\s*'enemyDeath'\s*\)/)
    expect(arm).not.toMatch(/fireballHit/)
  })

  it('the game-over edge routes the ROM fork: cantina with an entry, Ben without (U-011/U-013)', () => {
    // WSMAIN.MAC:2153-2166 PHEEGM: new high score -> PH$ENT (whose init PHIENT
    // plays PMCNT, :1164); no luck -> "JSR PMBEN ;BEN'S THEME WHEN LOSE GAME
    // WITH NO HIGH SCORE" (:2161). Our qualification edge lives in main.ts
    // (SH2-13) — slice that block and demand both forks.
    const start = mainSrc.indexOf('qualifiesForHighScore(highScores, state.score)')
    expect(start, 'main.ts computes qualification on the game-over edge').toBeGreaterThan(-1)
    const block = mainSrc.slice(start, start + 600)
    expect(block).toMatch(/playTune\(\s*'cantina'\s*\)/)
    expect(block).toMatch(/else\s*\{?[^]*?playTune\(\s*'bensTheme'\s*\)/)
    // The fork is exclusive: Ben consoles, the cantina celebrates — never both.
    expect(block.indexOf("playTune('cantina')")).toBeLessThan(
      block.indexOf("playTune('bensTheme')"),
    )
  })
})
