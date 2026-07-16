// tests/core/speech-cues-r8.test.ts
//
// RED-phase suite for Story sw7-8 — the R8 speech wirings (audit findings U-015,
// U-016, U-017). sw2-5 made speech a first-class core event and wired the
// reachable subset; the primary-source audit found four more lines whose moments
// the sim ALREADY reaches, each pinned to its 1983 call site:
//
//   moment                     ROM call site                              line
//   ---------------------------------------------------------------------------
//   exhaust port missed        WSMAIN.MAC:1914 "JSR SPKR2N ;R2 SWEARS AT  r2Scream
//   (and the run continues)    PLAYER FOR MISSING EXHAUST PORT"           (U-015)
//   entering the surface       WSMAIN.MAC:1515 "JSR SPKTHI ;THIS IS RED   redFiveImGoingIn
//                              FIVE, I'M GOING IN"                        (U-016)
//   game over (ANY loss)       WSMAIN.MAC:2143-2144 PHIEGM: "JSR SPKREM   remember,
//                              ;SAY 'REMEMBER...'" then "JSR SPKFOA ;SAY  theForceWillBeWithYou,
//                              FORCE WILL BE WITH YOU ALWAYS"             always (U-017)
//
// ⚠ SPKFOA is not a 24th baked phrase: SNDSPK.MAC:100-103 defines it as a
// SEQUENCE TABLE — `TFOA: .BYTE 15.,16.,0FF` — phrase 15 then phrase 16 of the
// speech ROM, which are exactly our baked `the_force_will_be_with_you` and
// `always` (speech-data.mjs n:15/n:16). So the game-over utterance is THREE cues
// in order: remember, theForceWillBeWithYou, always. The TMS5220 is a single
// serial chip — the cabinet physically cannot overlap phrases — so the shell
// plays queued cues back-to-back (tests/shell/speech-serial.test.ts) and the
// EVENT ORDER here is the spoken order.
//
// ⚠ R2 swears ONLY when you get to try again: WSMAIN.MAC:1905-1914 checks
// `LDA S.GAS / LBLE PHIB0D` BEFORE the swear — a bash that kills the player
// skips SPKR2N and goes to the death phase (whose end-of-game init speaks the
// REM/FOA farewell instead). The fatal-miss test below pins that split.
//
// ⚠ U-016's "the cabinet speaks BOTH SPKTHI and, shortly after, SPKSIZ" reads
// the source generously: WSMAIN.MAC:1505-1517 SKIPS SPKTHI exactly when the
// first-time wave-five-select path will speak SPKSIZ (:1543-1550) — on the
// cabinet they are alternatives keyed to a wave-select our sim does not have.
// The story context and the finding's remediation both say "sequence SPKTHI
// then SPKSIZ on the surface entry", so that is the pinned contract (deviation
// logged in the session file): both lines cue on the edge, THI first — the
// serial shell plays them back-to-back.
//
// SPKFOR/SPKALW (WSMAIN.MAC:387/394) are NOT wired here: they are COIN-INSERT
// reactions (IFRAME's $$CRDT/COINSPK machine — first credit speaks "The Force
// will be with you", the next speaks "always"). The clone has no coin seam; see
// the session's Delivery Findings.
//
// Valid RED: the four SpeechLine members below don't exist yet (type errors
// until GREEN, the established convention), and stepGame cues none of them.
import { describe, it, expect } from 'vitest'
import type { GameEvent } from '../../src/core/events'
import { stepGame } from '../../src/core/sim'
import {
  initialState,
  SPACE_WAVE_QUOTA,
  towersForWave,
  PROJECTILE_TTL,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { NO_INPUT } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'

const DT = 1 / 60

function playing(overrides: Partial<GameState> = {}): GameState {
  return { ...initialState(1), ...overrides }
}

const portAt = (pos: Vec3): { pos: Vec3 } => ({ pos })
const trench = (port: { pos: Vec3 } | null, over: Partial<GameState> = {}): GameState => ({
  ...initialState(1983),
  phase: 'trench',
  exhaustPort: port,
  ...over,
})

const bolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })

/** The speech lines cued this frame, in event order (= spoken order). */
const spokenLines = (s: GameState): string[] =>
  s.events.filter((e: GameEvent) => e.type === 'speech').map((e) => e.line)

/** The game-over farewell, in the ROM's PHIEGM order (SPKREM then TFOA's 15,16). */
const FAREWELL = ['remember', 'theForceWillBeWithYou', 'always']

describe("speech cue — R2 swears when you miss the port and live to retry (U-015, WSMAIN.MAC:1914)", () => {
  it('cues r2Scream on the miss frame when the run continues', () => {
    const s1 = stepGame(trench(portAt([0, 0, 0]), { lives: 3 }), NO_INPUT, DT)
    expect(s1.events.map((e) => e.type)).toContain('exhaust-port-missed')
    expect(s1.gameOver).toBe(false) // the ROM's S.GAS survived — trench retry
    expect(spokenLines(s1)).toContain('r2Scream')
  })

  it('a FATAL miss skips the swear — the ROM checks S.GAS before SPKR2N', () => {
    const s1 = stepGame(trench(portAt([0, 0, 0]), { lives: 1 }), NO_INPUT, DT)
    expect(s1.events.map((e) => e.type)).toContain('exhaust-port-missed')
    expect(s1.gameOver).toBe(true)
    expect(spokenLines(s1)).not.toContain('r2Scream')
  })

  it('an ordinary trench frame with the port still ahead cues no scream', () => {
    const s1 = stepGame(trench(portAt([0, 0, -2400]), { lives: 3 }), NO_INPUT, DT)
    expect(spokenLines(s1)).not.toContain('r2Scream')
  })
})

describe("speech cue — 'Red Five, I'm going in' leads the surface entry (U-016, WSMAIN.MAC:1515)", () => {
  const surfaceEntry = (): GameState =>
    stepGame(playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA }), NO_INPUT, DT)

  it('cues redFiveImGoingIn on the space -> surface edge', () => {
    const s1 = surfaceEntry()
    expect(s1.phase).toBe('surface')
    expect(spokenLines(s1)).toContain('redFiveImGoingIn')
  })

  it("still cues 'Look at the size of that thing', AFTER Red Five (spoken order)", () => {
    // Both halves in one test so neither can pass alone: sw2-5's line survives
    // (keep-behavior) AND the new line precedes it (the ROM speaks THI at the
    // approach init, SIZ at the hyper-in init that follows).
    const lines = spokenLines(surfaceEntry())
    expect(lines).toContain('redFiveImGoingIn')
    expect(lines).toContain('lookAtTheSizeOfThatThing')
    expect(lines.indexOf('redFiveImGoingIn')).toBeLessThan(
      lines.indexOf('lookAtTheSizeOfThatThing'),
    )
  })

  it('the trench edge is untouched — Use the Force, and no Red Five', () => {
    // Guard the neighbouring edge against a shotgun wiring: SPKTHI belongs to
    // the surface entry only (the trench keeps SPKUSE — speech-cues.test.ts).
    const s1 = stepGame(
      playing({ phase: 'surface', phaseKills: towersForWave(1) }),
      NO_INPUT,
      DT,
    )
    expect(s1.phase).toBe('trench') // the transition actually happened
    expect(spokenLines(s1)).toContain('useTheForceLuke')
    expect(spokenLines(s1)).not.toContain('redFiveImGoingIn')
  })
})

describe('speech cue — the farewell speaks on EVERY game over (U-017, WSMAIN.MAC:2143-2144)', () => {
  it('a fatal hit in space cues remember / the Force will be with you / always, in order', () => {
    const s0 = playing({ lives: 1, enemyShots: [bolt([0, 0, 0])] })
    const s1 = stepGame(s0, NO_INPUT, DT)
    expect(s1.gameOver).toBe(true)
    expect(spokenLines(s1)).toEqual(FAREWELL)
  })

  it('a fatal port miss cues the same farewell — the trio belongs to the DEATH, not the cause', () => {
    // The ROM reaches PHIEGM from every loss path; a Dev wiring it into one
    // death branch only fails here.
    const s1 = stepGame(trench(portAt([0, 0, 0]), { lives: 1 }), NO_INPUT, DT)
    expect(s1.gameOver).toBe(true)
    expect(spokenLines(s1)).toEqual(FAREWELL)
  })

  it('the farewell is a ONE-SHOT: later game-over frames stay silent', () => {
    const dead = stepGame(playing({ lives: 1, enemyShots: [bolt([0, 0, 0])] }), NO_INPUT, DT)
    const idle = stepGame(dead, NO_INPUT, DT)
    expect(spokenLines(idle)).toEqual([])
  })

  it('surviving a hit is NOT a farewell', () => {
    const s1 = stepGame(playing({ lives: 2, enemyShots: [bolt([0, 0, 0])] }), NO_INPUT, DT)
    expect(s1.gameOver).toBe(false)
    expect(spokenLines(s1)).toEqual([])
  })
})
