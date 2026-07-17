// tools/pokey-bake/dedicated-sfx.test.mjs — RED for sw7-8 (U-021 / U-022).
//
// The audit found two moments aliased onto enemy_explosion.wav that the cabinet
// gives BESPOKE effects, both defined in the ORIGINAL sound-board source (the
// 1983 "Warp Speed" tree, SNDAUD.MAC) — a stronger provenance than the
// envelope-matched disassembly entries the first seven effects carry:
//
//   AUDDF  "DEATH STAR FINAL EXPLOSION"   SNDAUD.MAC:1004 -> DF0 tables :315-347
//          -> death_star_boom.wav, for the death-star-destroyed event (U-021)
//   AUDSS  "PLAYER SHOT DOWN AN ALIEN SHOT"  SNDAUD.MAC:1028 -> SS0 tables :364-369
//          -> fireball_hit.wav, for the fireball-destroyed event (U-022)
//
// The .S records transcribe 1:1 into the existing 4-byte swfx format
// ([count, duration, value, delta] — see sfx-data.mjs's header):
//
//   AUDDF: ALL EIGHT channels. Per-channel freq = ONE record
//          `.S 2,144.,<v>.,0` with v = 70,71,72,73,75,76,77,78 (DECIMAL, dotted
//          — and the author SKIPPED 74: a transcription that "fixes" the gap
//          fabricates a note the ROM never played). All eight share one volume
//          chain (DF1C..DF8C fall through to one list, :323-347).
//   AUDSS: ONE channel. freq `.S 1,14.,8,0`; vol (1,2,$41,0) (7,1,$42,1)
//          (3,1,$4A,2) (1,2,$4F,0) — a short rising crackle.
//
// Radix (the recurring trap): SNDAUD's dotted literals are DECIMAL (144., 70.,
// 14.); bare multi-digit values are ambient HEX ($4F, $4A). Refutations inline.
//
// Valid RED: sfx-data.mjs has neither entry — the lookups fail.
import { describe, it, expect } from 'vitest'

import { SFX } from './sfx-data.mjs'
import { bakeSfx } from './bake-sfx.mjs'

const byName = (name) => SFX.find((s) => s.name === name)

describe('sw7-8 — the dedicated Death Star boom exists (U-021, AUDDF)', () => {
  it('ships a death_star_boom effect with original-source provenance', () => {
    const boom = byName('death_star_boom')
    expect(boom, 'sfx-data.mjs entry death_star_boom').toBeTruthy()
    expect(boom.rom.label).toMatch(/AUDDF/i)
    expect(boom.rom.confidence).toMatch(/confirmed/i) // SNDAUD.MAC names it outright
  })

  it('drives all EIGHT channels — the whole sound board rumbles', () => {
    const boom = byName('death_star_boom')
    expect(boom.swfx.channels).toHaveLength(8)
  })

  it('the eight freq values are 70..78 with 74 SKIPPED, held 2 x 144 ticks', () => {
    const boom = byName('death_star_boom')
    const values = boom.swfx.channels.map((ch) => ch.freq[0][2]).sort((a, b) => a - b)
    expect(values).toEqual([70, 71, 72, 73, 75, 76, 77, 78]) // the ROM's gap at 74
    for (const ch of boom.swfx.channels) {
      const [count, duration, , delta] = ch.freq[0]
      expect(count).toBe(2)
      expect(duration).toBe(144) // `.S 2,144.,…` — dotted DECIMAL
      expect(delta).toBe(0)
    }
  })

  it('every channel list terminates with the count-0 end record', () => {
    const boom = byName('death_star_boom')
    for (const ch of boom.swfx.channels) {
      expect(ch.freq[ch.freq.length - 1]).toEqual([0, 0, 0, 0])
      expect(ch.vol[ch.vol.length - 1]).toEqual([0, 0, 0, 0])
    }
  })

  it('bakes to a real, MASSIVE effect — longer than the TIE explosion it replaces', () => {
    const boom = bakeSfx({ ...byName('death_star_boom') })
    const tie = bakeSfx({ ...byName('enemy_explosion') })
    expect(boom.samples.length).toBeGreaterThan(0)
    expect(boom.seconds).toBeGreaterThan(tie.seconds) // 2 x 144 ticks dwarfs the zap
  }, 30_000) // CPU-bound double bake exceeds vitest's 5s default on GitHub's slower runners
})

describe('sw7-8 — the dedicated fireball hit exists (U-022, AUDSS)', () => {
  it('ships a fireball_hit effect with original-source provenance', () => {
    const hit = byName('fireball_hit')
    expect(hit, 'sfx-data.mjs entry fireball_hit').toBeTruthy()
    expect(hit.rom.label).toMatch(/AUDSS/i)
    expect(hit.rom.confidence).toMatch(/confirmed/i)
  })

  it('is a single-channel zap: freq (1, 14., 8, 0) — 14 DECIMAL, not $14', () => {
    const hit = byName('fireball_hit')
    expect(hit.swfx.channels).toHaveLength(1)
    const freq = hit.swfx.channels[0].freq
    expect(freq[0]).toEqual([1, 14, 8, 0])
    expect(freq[0][1]).not.toBe(0x14) // 20 — the hex misreading of `14.`
  })

  it('carries the rising four-record volume crackle, then ends', () => {
    // SS8C: (1,2,$41,0) (7,1,$42,1) (3,1,$4A,2) (1,2,$4F,0) .SZ — bare values
    // are ambient HEX ($4A = 74, not decimal 4A-is-not-a-number; $41/$42/$4F
    // are AUDC bytes: distortion-2 crackle rising through volumes 1..15).
    const vol = byName('fireball_hit').swfx.channels[0].vol
    expect(vol.slice(0, 4)).toEqual([
      [1, 2, 0x41, 0],
      [7, 1, 0x42, 1],
      [3, 1, 0x4a, 2],
      [1, 2, 0x4f, 0],
    ])
    expect(vol[vol.length - 1]).toEqual([0, 0, 0, 0])
  })

  it('bakes to a real effect, and a SHORT one — a zap, not an explosion', () => {
    const hit = bakeSfx({ ...byName('fireball_hit') })
    const tie = bakeSfx({ ...byName('enemy_explosion') })
    expect(hit.samples.length).toBeGreaterThan(0)
    expect(hit.seconds).toBeLessThan(tie.seconds)
  }, 30_000) // CPU-bound double bake exceeds vitest's 5s default on GitHub's slower runners
})
