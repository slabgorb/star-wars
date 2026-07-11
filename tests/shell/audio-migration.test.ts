// tests/shell/audio-migration.test.ts
//
// SH2-17 (epic SH2) — RED phase (O'Brien / TEA). star-wars migrates its shell-side
// SFX engine onto the shared @arcade/shared/audio `createAudioEngine` (SH2-16, released
// v0.12.0), keeping its per-cabinet NUMBERS (the SOUNDS manifest, the R2 base) AND its
// TMS5220 LPC speech subsystem (`speak()` + the 23-line SPEECH catalogue) game-side.
//
// Contract-altitude guards, mirroring the SH2-8 glow-adoption idiom — they assert the
// migration HAPPENED, not HOW the engine is composed. The game's existing
// tests/shell/audio.test.ts (SFX loading, silent-degrade, lazy speech, main.ts wiring)
// is the behavioural PARITY net and must stay green through the migration.
//
//   1. adoption     — src/shell/audio.ts imports from @arcade/shared/audio
//                     (fails today: star-wars hand-rolls its own SFX engine).
//   2. resolution   — the pinned @arcade/shared exposes ./audio with createAudioEngine
//                     (fails today: the pin #v0.11.0 predates /audio — Dev bumps the
//                     pin to >= v0.12.0 and reinstalls to turn this GREEN).
//   3. body-deleted — the local SFX buffer store is gone (the shared engine owns SFX
//                     buffers now; only the speech buffers, keyed by SpeechName, remain).
//   4. guardrails   — the per-cabinet NUMBERS (SOUNDS + R2 base) and the whole speech
//                     subsystem (SPEECH catalogue + speak) stay in the game.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const audioPath = fileURLToPath(new URL('../../src/shell/audio.ts', import.meta.url))
const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url))
const audioSrc = (): string => readFileSync(audioPath, 'utf8')

const AUDIO_IMPORT = /from\s+['"]@arcade\/shared\/audio['"]/

describe('SH2-17 — star-wars adopts @arcade/shared/audio (AC-1)', () => {
  it('src/shell/audio.ts imports the shared audio engine (SFX no longer hand-rolled)', () => {
    expect(
      AUDIO_IMPORT.test(audioSrc()),
      'src/shell/audio.ts does not import @arcade/shared/audio — the shared SFX engine was not adopted',
    ).toBe(true)
  })

  it('the pinned @arcade/shared exposes ./audio with createAudioEngine', async () => {
    // Non-literal + @vite-ignore so the missing subpath does not fail this file at
    // COLLECTION time (which would suppress every other driver below) — it must reject
    // at RUNTIME, as its own granular miss, until Dev bumps the pin and reinstalls.
    const spec = '@arcade/shared/audio'
    const audio = await import(/* @vite-ignore */ spec)
    expect(
      typeof audio.createAudioEngine,
      'createAudioEngine must be exported by the pinned @arcade/shared/audio — bump the pin to >= v0.12.0 and reinstall',
    ).toBe('function')
  })

  it('deletes the local SFX buffer store (the shared engine owns SFX buffers now)', () => {
    // The hand-rolled SFX engine kept `new Map<SoundName, AudioBuffer>()`. After the
    // migration the shared engine holds the SFX buffers; only the speech buffers (keyed
    // by SpeechName) remain game-side, so a SoundName-keyed buffer store must be gone.
    expect(
      audioSrc(),
      'a local Map<SoundName, AudioBuffer> SFX store still exists — the local SFX engine body was not deleted',
    ).not.toMatch(/Map<\s*SoundName\s*,\s*AudioBuffer\s*>/)
  })

  it('keeps the per-cabinet NUMBERS in the game (SOUNDS manifest + R2 base)', () => {
    const src = audioSrc()
    expect(src, 'the SOUNDS manifest must stay a star-wars-local constant').toMatch(/const\s+SOUNDS\s*=/)
    expect(src, "the star-wars R2 SFX base ('.../star-wars/sfx/') must stay local").toMatch(/star-wars\/sfx\//)
  })

  it('keeps the TMS5220 speech subsystem game-side (SPEECH catalogue + speak())', () => {
    const src = audioSrc()
    expect(src, 'the SPEECH catalogue must stay game-side — speech is out of scope for the shared engine').toMatch(
      /export\s+const\s+SPEECH\s*=/,
    )
    expect(src, 'speak() must stay game-side').toMatch(/\bspeak\s*\(/)
  })

  it('pins @arcade/shared as a git-URL dependency', () => {
    expect(readFileSync(pkgPath, 'utf8')).toMatch(/"@arcade\/shared":\s*"github:slabgorb\/arcade-shared#/)
  })
})
