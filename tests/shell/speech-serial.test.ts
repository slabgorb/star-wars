// tests/shell/speech-serial.test.ts
//
// RED-phase suite for Story sw7-8 (shell side) — SERIAL speech playback.
//
// The cabinet's voice is a TMS5220 — ONE speech chip fed one LPC frame at a
// time. Two phrases physically cannot overlap; the sound board SEQUENCES them
// (SNDSPK.MAC:100-103's SPKFOA is literally a table — `TFOA: .BYTE 15.,16.,0FF`
// — "speak phrase 15, then phrase 16"). sw7-8 wires moments that cue MULTIPLE
// lines on one frame:
//
//   game over        remember -> theForceWillBeWithYou -> always   (U-017, TFOA)
//   surface entry    redFiveImGoingIn -> lookAtTheSizeOfThatThing  (U-016)
//
// Today's speak() starts every decoded buffer immediately, so same-frame cues
// ring on top of each other — three Lukes talking at once, which no cabinet
// ever did. The contract pinned here: speak() while a line is PLAYING queues
// the new line and starts it when the current one ends (source.onended). Cue
// order is spoken order. This is the shell HOW that makes the core's ordered
// speech events (tests/core/speech-cues-r8.test.ts) audible as authored.
//
// Valid RED: speak() has no queue — the first test's "exactly one source
// playing" assertion fails against today's overlap.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createAudioEngine, SPEECH } from '../../src/shell/audio'

/** A started buffer-source the fake context handed out: which decoded buffer it
 *  carries, and the onended hook the queue must use to chain. */
interface FakeSource {
  buffer: { url: string } | null
  started: boolean
  onended: (() => void) | null
}

let sources: FakeSource[]

/** Sources actually STARTED, by the .wav filename their buffer decoded from. */
const startedFiles = (): string[] =>
  sources.filter((s) => s.started && s.buffer).map((s) => s.buffer!.url.split('/').pop()!)

// Web Audio stub with a real createBufferSource: decode tags each buffer with
// the URL its bytes were fetched from, so a started source names its line.
class FakeAudioContext {
  state = 'running'
  destination = {}
  createGain() {
    return { gain: { value: 0 }, connect() {} }
  }
  createBufferSource(): FakeSource & { connect(): void; start(): void } {
    const src = {
      buffer: null as { url: string } | null,
      started: false,
      onended: null as (() => void) | null,
      connect() {},
      start() {
        src.started = true
        sources.push(src)
      },
    }
    return src
  }
  decodeAudioData(data: { __url: string }) {
    return Promise.resolve({ url: data.__url })
  }
  resume() {
    return Promise.resolve()
  }
}

beforeEach(() => {
  sources = []
  vi.stubGlobal('fetch', (input: string) =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve({ __url: input }) }),
  )
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Let the fetch -> arrayBuffer -> decode -> play promise chains settle. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

/** The last started source — the one whose `onended` ends the current line. */
const current = (): FakeSource => sources[sources.length - 1]

describe('sw7-8 — speech is SERIAL, like the chip that spoke it', () => {
  it('a line cued while idle still plays immediately (no over-queueing)', async () => {
    const engine = createAudioEngine()
    engine.resume()
    engine.speak('remember')
    await settle()
    expect(startedFiles()).toEqual([SPEECH.remember])
  })

  it('two lines cued on one frame play ONE at a time, in cue order', async () => {
    const engine = createAudioEngine()
    engine.resume()
    engine.speak('redFiveImGoingIn')
    engine.speak('lookAtTheSizeOfThatThing')
    await settle()
    // The TMS5220 has one throat: the first line rings ALONE…
    expect(startedFiles()).toEqual([SPEECH.redFiveImGoingIn])
    // …and the second starts only when it ends.
    current().onended?.()
    await settle()
    expect(startedFiles()).toEqual([SPEECH.redFiveImGoingIn, SPEECH.lookAtTheSizeOfThatThing])
  })

  it('the game-over farewell chains all three lines across ended events (TFOA order)', async () => {
    const engine = createAudioEngine()
    engine.resume()
    engine.speak('remember')
    engine.speak('theForceWillBeWithYou')
    engine.speak('always')
    await settle()
    expect(startedFiles()).toEqual([SPEECH.remember])
    current().onended?.()
    await settle()
    expect(startedFiles()).toEqual([SPEECH.remember, SPEECH.theForceWillBeWithYou])
    current().onended?.()
    await settle()
    expect(startedFiles()).toEqual([
      SPEECH.remember,
      SPEECH.theForceWillBeWithYou,
      SPEECH.always,
    ])
  })

  it('a line cued AFTER the previous one ended plays without waiting on anything', async () => {
    // The queue must drain completely — a stuck "busy" latch after the last
    // onended would silence every later line in the run.
    const engine = createAudioEngine()
    engine.resume()
    engine.speak('useTheForceLuke')
    await settle()
    current().onended?.()
    await settle()
    engine.speak('r2Scream')
    await settle()
    expect(startedFiles()).toEqual([SPEECH.useTheForceLuke, SPEECH.r2Scream])
  })
})
