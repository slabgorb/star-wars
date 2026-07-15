// tests/core/wave-parity-gates.test.ts
//
// RED-phase suite for Story sw7-2 — "R2 Wave-parity family: GM.WAV is 0-based,
// ours 1-based". The primary-source audit (2026-07-15) found ONE root defect with
// four faces: the ROM gates its wave-sensitive music and speech on the ZERO-based
// hardware wave counters GM.WAV / BS.WAV, but our clone tests the same predicates
// against the ONE-based `state.wave`. The two numberings differ by one, so every
// gated cue rides a wave set that is disjoint from — or the exact inverse of — the
// cabinet's. This suite pins the ROM-correct maps for all four cues (U-005..U-008),
// mutation-proof: it fails on the shipped predicates and passes only once the wave
// base is reconciled.
//
// ── The ROM ground truth (WSMAIN.MAC, "Warp Speed" 1983 source) ─────────────────
// GM.WAV and BS.WAV are 0-based (WSMAIN:1868 "BEGIN WITH WAVE 0"; BS.WAV = clamped
// GM.WAV, WSMAIN:1702-1707). Human 1-based wave = GM.WAV + 1.
//
//   MUSIC  (WSMAIN:1421-1430)  PMDAR (Imperial/Darth March) replaces PMTH5 iff
//     LDA GM.WAV / CMPA #4-1 / IFGE  → GM.WAV >= 3   ("?WAVE 4 OR HIGHER?")
//     ANDA #1   / IFNE               → GM.WAV odd     ("?ANDIF EVEN (ODD-1) WAVE?")
//     ⇒ human waves {4,6,8,...}   (>= 4 AND even).      [U-005]
//
//   SPEECH (WSMAIN:1919-1926)  SPKGRE "Great shot kid..." on the winning port shot,
//     the IDENTICAL 0-based gate; the else-branch is silent (BRA 80$).
//     ⇒ human waves {4,6,8,...}. Ours fires it UNCONDITIONALLY.   [U-006]
//
//   TRENCH VOICE (WSMAIN:1868-1891)  LDA BS.WAV / LSRA / IFCC:
//     carry clear = BS.WAV EVEN ⇒ human ODD {1,3,5,...}: SPKTRU "Luke, trust me" @16,
//        SPKYAU "Yahoo, you're all clear kid" @24.
//     else BS.WAV ODD ⇒ human EVEN {2,4,6,...}: SPKLET "Let go Luke" @16,
//        SPKSTR "The Force is strong with this one" @22.
//     Ours reads 1-based `state.wave % 2`, so our even/odd sets are INVERTED, and
//     the odd branch is missing "Let go Luke" @16 entirely.       [U-007, U-008]
//
// The trench-timer *rate* (word_4B0E @ 20.508 Hz) was already reconciled by sw7-1
// (T-008); this story touches ONLY the wave base / parity — never the timing.
//
// Valid RED against the shipped code:
//   - musicTrackFor tests `wave >= 3 && wave % 2 === 1` (1-based) → set {3,5,7,...},
//     DISJOINT from ROM {4,6,8,...} — so waves 3,4,5 all assert wrong.
//   - the "Great shot kid" push is unconditional → every silent-wave assertion fails.
//   - TRENCH_VOICE_CUES gate on `state.wave % 2` → the even/odd sets are inverted and
//     `letGoLuke` is not a SpeechLine member yet (a COMPILE error until GREEN).
import { describe, it, expect } from 'vitest'
import type { SpeechLine } from '../../src/core/events'
import { stepGame, enterPhase } from '../../src/core/sim'
import { initialState, PROJECTILE_TTL, type GameState } from '../../src/core/state'
import { NO_INPUT } from '../../src/core/input'

const DT = 1 / 60
/** ROM game-frame rate (WSINT.MAC:147) — the rate word_4B0E advances at (sw7-1). */
const ROM_GAME_FRAME_HZ = 246.094 / 12 // 20.508 Hz
const STEPS = 90 // 1.5 s — past the last trench threshold (24/20.508 = 1.17 s)

/** A clean trench run at a chosen 1-based `wave` (the parity source). Wall obstacles
 *  cleared so a catwalk crash can't cut the run short (mirrors the sibling suites). */
function trenchAtWave(seed: number, wave: number): GameState {
  return { ...enterPhase(initialState(seed), 'trench'), mode: 'playing', wave, trenchObstacles: [] }
}

/** Park a bolt on the (in-window) exhaust port so the NEXT step destroys it — driving
 *  the winning-shot speech gate AND the trench->next-wave-space music gate. */
function portKill(state: GameState): GameState {
  const p = state.exhaustPort!.pos
  const port: typeof p = [p[0], p[1], -300] // sw3-15: seat it in the near-cockpit window
  return {
    ...state,
    exhaustPort: { pos: port },
    projectiles: [{ pos: [port[0], port[1], port[2]], vel: [0, 0, -1], ttl: PROJECTILE_TTL }],
  }
}

const musicTracks = (s: GameState): string[] =>
  s.events.filter((e) => e.type === 'music').map((e) => (e.type === 'music' ? e.track : ''))
const spokenLines = (s: GameState): string[] =>
  s.events.filter((e) => e.type === 'speech').map((e) => (e.type === 'speech' ? e.line : ''))

/** The music cued as the run loops INTO 1-based `wave` — a port kill on the prior
 *  wave clears to `wave` and opens its space theme (`musicTrackFor('space', wave)`). */
function musicEnteringWave(seed: number, wave: number): { out: GameState; tracks: string[] } {
  const out = stepGame(portKill(trenchAtWave(seed, wave - 1)), NO_INPUT, DT)
  return { out, tracks: musicTracks(out) }
}

/** The speech cued by a winning port shot taken ON 1-based `wave`. */
function speechOnPortKill(seed: number, wave: number): string[] {
  return spokenLines(stepGame(portKill(trenchAtWave(seed, wave)), NO_INPUT, DT))
}

/** Every trench voice line cued across a full run at 1-based `wave`, first-fire time (s). */
function trenchCueTimes(seed: number, wave: number): Record<string, number> {
  let s = trenchAtWave(seed, wave)
  const at: Record<string, number> = {}
  let t = 0
  for (let i = 0; i < STEPS; i++) {
    s = stepGame(s, NO_INPUT, DT)
    t += DT
    for (const e of s.events) if (e.type === 'speech' && at[e.line] === undefined) at[e.line] = t
  }
  return at
}

// ── U-005: Imperial March music gate — {4,6,8,...}, not {3,5,7,...} ──────────────
describe('U-005 · Imperial March replaces the space theme on ROM waves {4,6,8,...} (WSMAIN:1421)', () => {
  // wave -> does the Imperial March open it? march ⟺ (wave >= 4 && wave even).
  const CASES: ReadonlyArray<{ wave: number; march: boolean }> = [
    { wave: 2, march: false }, // even but < 4
    { wave: 3, march: false }, // odd — the SHIPPED bug plays the March here
    { wave: 4, march: true }, // even & >= 4 — the SHIPPED bug plays the PLAIN theme here
    { wave: 5, march: false }, // odd — the SHIPPED bug plays the March here
    { wave: 6, march: true },
    { wave: 8, march: true },
  ]
  for (const { wave, march } of CASES) {
    it(`wave ${wave}: ${march ? 'Imperial March' : 'plain space theme'} opens the space phase`, () => {
      const { out, tracks } = musicEnteringWave(1983, wave)
      expect(out.wave).toBe(wave) // the run really looped into this wave
      if (march) {
        expect(tracks).toContain('imperialMarch')
        expect(tracks).not.toContain('space')
      } else {
        expect(tracks).toContain('space')
        expect(tracks).not.toContain('imperialMarch')
      }
    })
  }

  it('wave 1 (run start) opens the PLAIN space theme (odd but < 4)', () => {
    const out = stepGame(
      { ...initialState(1), mode: 'attract' },
      { ...NO_INPUT, start: true },
      DT,
    )
    expect(out.wave).toBe(1)
    expect(musicTracks(out)).toContain('space')
    expect(musicTracks(out)).not.toContain('imperialMarch')
  })

  it('the March set across waves 1..10 is exactly {4,6,8,10} — the boundary at 3→4 is not off by one', () => {
    const marchWaves: number[] = []
    for (let w = 2; w <= 10; w++) {
      if (musicEnteringWave(1983, w).tracks.includes('imperialMarch')) marchWaves.push(w)
    }
    expect(marchWaves).toEqual([4, 6, 8, 10])
  })
})

// ── U-006: "Great shot kid" speech gate — {4,6,8,...}, not every kill ────────────
describe('U-006 · "Great shot kid" is spoken only on ROM waves {4,6,8,...} (WSMAIN:1919)', () => {
  const LINE = 'greatShotKidThatWasOneInAMillion'
  const CASES: ReadonlyArray<{ wave: number; spoken: boolean }> = [
    { wave: 1, spoken: false }, // the SHIPPED bug speaks it on EVERY port kill
    { wave: 2, spoken: false },
    { wave: 3, spoken: false }, // odd — SHIPPED bug speaks it
    { wave: 4, spoken: true }, // even & >= 4 — the reserved "1 in a million" wave
    { wave: 5, spoken: false }, // odd — SHIPPED bug speaks it
    { wave: 6, spoken: true },
  ]
  for (const { wave, spoken } of CASES) {
    it(`wave ${wave}: the winning shot ${spoken ? 'speaks' : 'is SILENT of'} Han's line`, () => {
      const lines = speechOnPortKill(1983, wave)
      expect(lines.includes(LINE)).toBe(spoken)
    })
  }

  it('the spoken set across waves 1..8 is exactly {4,6,8} — never unconditional', () => {
    const spokenWaves: number[] = []
    for (let w = 1; w <= 8; w++) {
      if (speechOnPortKill(1983, w).includes(LINE)) spokenWaves.push(w)
    }
    expect(spokenWaves).toEqual([4, 6, 8])
  })
})

// ── U-007 / U-008: trench voice parity — un-inverted, "Let go Luke" restored ─────
describe('U-007/U-008 · trench voice lines ride the ROM 0-based wave parity (WSMAIN:1868)', () => {
  const F_AT16 = 16 / ROM_GAME_FRAME_HZ // 0.780 s — SPKTRU / SPKLET
  const F_FORCE = 22 / ROM_GAME_FRAME_HZ // 1.073 s — SPKSTR
  const F_YAHOO = 24 / ROM_GAME_FRAME_HZ // 1.170 s — SPKYAU

  it('"Let go Luke" is a wired SpeechLine (U-007 union member)', () => {
    // Compile-time pin: a value typed SpeechLine — a missing/renamed id is a type error,
    // not a silent pass. `letGoLuke` is not in the union on the shipped code (RED).
    const line: SpeechLine = 'letGoLuke'
    expect(line).toBe('letGoLuke')
  })

  // Human ODD waves ⇐ BS.WAV EVEN branch: "Luke, trust me" @16, "Yahoo" @24.
  for (const wave of [1, 3, 5]) {
    it(`wave ${wave} (odd): "Luke, trust me" @16 + "Yahoo, you're all clear" @24, and ONLY those`, () => {
      const at = trenchCueTimes(1983, wave)
      expect(at['lukeTrustMe']).toBeCloseTo(F_AT16, 1)
      expect(at['youreAllClearKid']).toBeCloseTo(F_YAHOO, 1)
      expect(at['letGoLuke'] ?? null).toBeNull()
      expect(at['theForceIsStrongInThisOne'] ?? null).toBeNull()
    })
  }

  // Human EVEN waves ⇐ BS.WAV ODD branch: "Let go Luke" @16, "The Force is strong" @22.
  for (const wave of [2, 4, 6]) {
    it(`wave ${wave} (even): "Let go Luke" @16 + "The Force is strong" @22, and ONLY those`, () => {
      const at = trenchCueTimes(1983, wave)
      expect(at['letGoLuke']).toBeCloseTo(F_AT16, 1)
      expect(at['theForceIsStrongInThisOne']).toBeCloseTo(F_FORCE, 1)
      expect(at['lukeTrustMe'] ?? null).toBeNull()
      expect(at['youreAllClearKid'] ?? null).toBeNull()
    })
  }

  it('the shipped inversion is refuted: wave 2 does NOT speak "Luke, trust me"', () => {
    // The shipped code gates on 1-based `state.wave % 2`, firing the "Luke/Yahoo" set on
    // EVEN waves — the exact inversion of the ROM (whose SPKTRU rides BS.WAV-even = human
    // ODD). This is the single assertion that most sharply separates the two.
    expect(trenchCueTimes(1983, 2)['lukeTrustMe'] ?? null).toBeNull()
  })
})
