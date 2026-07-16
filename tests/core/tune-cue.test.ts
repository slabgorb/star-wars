// tests/core/tune-cue.test.ts
//
// RED-phase suite for Story sw7-8 — "R8 Audio content" (audit findings U-010,
// U-012, U-014). The 1983 cabinet punctuates the run with one-shot POKEY TUNES,
// each fired from exactly one call site in the original "Warp Speed" source:
//
//   moment                        ROM call site                          tune
//   ---------------------------------------------------------------------------
//   proton torpedo FIRED/armed    WSGUNS.MAC:1220  FRPTGN: "JSR PMSF2   deathKnell
//                                 ;SOUND THE DEATH KNELL"                (U-010)
//   Death Star detonates          WSMAIN.MAC:2179  PHIDX1: "JSR PMEND   finale
//                                 ;START END OF DETH STAR MUSIC"         (U-012)
//   space -> surface descent      WSMAIN.MAC:1439  "JSR PMDES" at space  descent
//                                 PH.TIM 400, 20 frames before the       (U-014)
//                                 PH$SP2 descend flip at :1442
//
// ⚠ The knell is fired by FRPTGN — the routine that LAUNCHES the proton torpedo
// (it sets PT.LIV=1 and positions the torpedo) — NOT by the detonation. U-010's
// one-line claim ("firing the proton torpedo into the exhaust port") is easy to
// misread as the kill frame; the routine name and its body settle it. In our sim
// the torpedo comes into existence on the ARMING frame (the bolt that touches the
// port is consumed and becomes the guided torpedo — sim.ts's portTorpedoArmed
// latch, sw3-15), so that frame is the launch and carries the knell. The
// detonation (the port scrolling into the $800 approach window with the latch
// set) carries the finale, exactly the ROM's PMSF2 -> [explosion] -> PMEND order.
//
// DESIGN (TEA's call, mirroring sw2-5 speech / sw3-5 music): a tune is a
// first-class core GameEvent — the core decides WHICH tune and WHEN
// (deterministic, tested here); the shell owns HOW (a one-shot on the tune
// channel, tests/shell/tune-channel.test.ts).
//
//   // src/core/events.ts — added to the GameEvent union (nothing here exists yet)
//   type TuneName = 'deathKnell' | 'cantina' | 'finale' | 'bensTheme' | 'descent'
//   interface TuneEvent { type: 'tune'; tune: TuneName }
//
// 'cantina' (U-011) and 'bensTheme' (U-013) carry NO core trigger: the ROM fires
// them off the high-score check (WSMAIN.MAC:2153-2166 PHEEGM), and qualification
// lives in the SHELL (main.ts owns the table — SH2-13). Their wiring is pinned in
// tests/shell/tune-channel.test.ts against main.ts's game-over edge.
//
// Valid RED: `TuneName`/the `tune` variant do not exist yet (type errors until
// GREEN, the established convention here — see exhaust-port-outcome.test.ts), and
// stepGame emits no `tune` events, so every behavioural assertion fails at runtime.
import { describe, it, expect } from 'vitest'
import type { GameEvent } from '../../src/core/events'
import { stepGame } from '../../src/core/sim'
import {
  initialState,
  SPACE_WAVE_QUOTA,
  towersForWave,
  EXHAUST_PORT_DISTANCE,
  PORT_APPROACH_WINDOW,
  PROJECTILE_TTL,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { NO_INPUT } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'

const DT = 1 / 60

/** A playing-phase state seeded deterministically, with optional overrides. */
function playing(overrides: Partial<GameState> = {}): GameState {
  return { ...initialState(1), ...overrides }
}

/** A fresh trench run with an explicit exhaust port (exhaust-port-outcome idiom). */
const portAt = (pos: Vec3): { pos: Vec3 } => ({ pos })
const trench = (port: { pos: Vec3 } | null, over: Partial<GameState> = {}): GameState => ({
  ...initialState(1983),
  phase: 'trench',
  exhaustPort: port,
  ...over,
})

/** A player bolt parked at a position (stepGame reads pos/vel/ttl). */
const bolt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, -1], ttl: PROJECTILE_TTL })

/** The tune names cued this frame, in event order. */
const tunesOf = (s: GameState): string[] =>
  s.events.filter((e: GameEvent) => e.type === 'tune').map((e) => e.tune)

// The far spawn is genuinely OUTSIDE the $800 approach window — the arming/
// detonation split below depends on it, so pin the geometry the fixtures assume.
it('fixture sanity: the far port spawn sits outside the approach window', () => {
  expect(EXHAUST_PORT_DISTANCE).toBeGreaterThan(PORT_APPROACH_WINDOW)
})

describe("tune cue — the death knell fires when the torpedo ARMS, not when it lands (U-010, WSGUNS.MAC:1220 FRPTGN)", () => {
  it('cues deathKnell on the frame a bolt reaches the far port and becomes the torpedo', () => {
    // Port far down the trench — outside the window — with a bolt parked on it:
    // this frame ARMS (FRPTGN, the launch) but cannot detonate (no window).
    const far: Vec3 = [0, 0, -EXHAUST_PORT_DISTANCE]
    const s1 = stepGame(trench(portAt(far), { projectiles: [bolt(far)] }), NO_INPUT, DT)
    expect(s1.portTorpedoArmed).toBe(true) // the launch actually happened
    expect(tunesOf(s1)).toContain('deathKnell')
    // The run has NOT resolved — no detonation, no finale, no run-clear.
    expect(s1.events.map((e) => e.type)).not.toContain('death-star-destroyed')
    expect(tunesOf(s1)).not.toContain('finale')
  })

  it('the knell is a ONE-SHOT: the armed torpedo does not re-knell on later frames', () => {
    const far: Vec3 = [0, 0, -EXHAUST_PORT_DISTANCE]
    const s1 = stepGame(trench(portAt(far), { projectiles: [bolt(far)] }), NO_INPUT, DT)
    expect(tunesOf(s1)).toContain('deathKnell') // fired on the arming frame…
    const s2 = stepGame(s1, NO_INPUT, DT)
    expect(s2.portTorpedoArmed).toBe(true) // still armed…
    expect(tunesOf(s2)).not.toContain('deathKnell') // …but silent (PT.LZF latch)
  })

  it('an ordinary trench shot that hits nothing is NOT a torpedo launch', () => {
    // A bolt mid-trench, nowhere near the port: no arming, no knell. The ROM's
    // knell belongs to FRPTGN (the proton torpedo), never to laser fire.
    const far: Vec3 = [0, 0, -EXHAUST_PORT_DISTANCE]
    const s1 = stepGame(
      trench(portAt(far), { projectiles: [bolt([300, 0, -1200])] }),
      NO_INPUT,
      DT,
    )
    expect(s1.portTorpedoArmed).toBe(false)
    expect(tunesOf(s1)).not.toContain('deathKnell')
  })
})

describe('tune cue — the finale fires when the Death Star detonates (U-012, WSMAIN.MAC:2179 PHIDX1)', () => {
  it('cues finale on the detonation frame of a pre-armed run', () => {
    // Armed on an earlier frame (latch set), port now inside the window with no
    // bolt in flight: this frame detonates — the ROM's PH$DX1 entry, whose init
    // starts the end-of-Death-Star music.
    const s0 = trench(portAt([0, 0, -300]), { portTorpedoArmed: true })
    const s1 = stepGame(s0, NO_INPUT, DT)
    expect(s1.events.map((e) => e.type)).toContain('death-star-destroyed')
    expect(tunesOf(s1)).toContain('finale')
    expect(tunesOf(s1)).not.toContain('deathKnell') // armed long ago — no re-launch
  })

  it('arming inside the window fires BOTH, knell before finale (the ROM call order)', () => {
    // The degenerate same-frame case: the bolt reaches the port after the port is
    // already inside the window. Launch and detonation collapse onto one frame;
    // both cues fire and the launch precedes the resolution, as WSGUNS.MAC:1220
    // precedes WSMAIN.MAC:2179 in every real run.
    const near: Vec3 = [0, 0, -300]
    const s1 = stepGame(trench(portAt(near), { projectiles: [bolt(near)] }), NO_INPUT, DT)
    const tunes = tunesOf(s1)
    expect(tunes).toContain('deathKnell')
    expect(tunes).toContain('finale')
    expect(tunes.indexOf('deathKnell')).toBeLessThan(tunes.indexOf('finale'))
  })

  it('a port MISS is not a finale — the lost run cues no tune', () => {
    // The port reaches the cockpit un-destroyed: exhaust-port-missed fires, the
    // ROM plays a crash + R2's swear (speech-cues-r8.test.ts) — never PMEND.
    const s1 = stepGame(trench(portAt([0, 0, 0]), { lives: 3 }), NO_INPUT, DT)
    expect(s1.events.map((e) => e.type)).toContain('exhaust-port-missed')
    expect(tunesOf(s1)).not.toContain('finale')
    expect(tunesOf(s1)).not.toContain('deathKnell')
  })
})

describe('tune cue — the descent plays on the space -> surface edge (U-014, WSMAIN.MAC:1439)', () => {
  it('cues descent when the space wave clears into the surface', () => {
    const s1 = stepGame(playing({ phase: 'space', phaseKills: SPACE_WAVE_QUOTA }), NO_INPUT, DT)
    expect(s1.phase).toBe('surface') // the transition actually happened
    expect(tunesOf(s1)).toContain('descent')
    // The towers loop still opens the phase (sw3-5's contract is untouched): the
    // descent tune rides OVER the loop start, the closest our un-sequenced sim
    // gets to PMDES(:1439) -> descend(:1442) -> PM4TH(:1636). The full timed
    // choreography is sw7-9 / A-019.
    expect(s1.events).toContainEqual({ type: 'music', track: 'towers' })
  })

  it('does NOT cue descent on the surface -> trench edge', () => {
    const s1 = stepGame(
      playing({ phase: 'surface', phaseKills: towersForWave(1) }),
      NO_INPUT,
      DT,
    )
    expect(s1.phase).toBe('trench')
    expect(tunesOf(s1)).not.toContain('descent')
  })

  it('does NOT cue descent on a run start, nor on the port-kill warp to the next wave', () => {
    // Run start: attract -> playing opens the space theme, no descent.
    const started = stepGame(playing({ mode: 'attract' }), { ...NO_INPUT, start: true }, DT)
    expect(tunesOf(started)).not.toContain('descent')
    // Port kill: the trench clears back to the NEXT wave's space phase — that
    // edge belongs to the finale, not the descent.
    const s0 = trench(portAt([0, 0, -300]), { portTorpedoArmed: true })
    const won = stepGame(s0, NO_INPUT, DT)
    expect(won.phase).toBe('space')
    expect(tunesOf(won)).not.toContain('descent')
  })

  it('a frame that merely STAYS in a phase cues no tune at all', () => {
    // The cousin of sw3-5's 60x-a-second stutter guard: tunes fire on moments,
    // never on residence in a phase.
    const s1 = stepGame(playing({ phase: 'space', phaseKills: 0 }), NO_INPUT, DT)
    const s2 = stepGame(s1, NO_INPUT, DT)
    expect(tunesOf(s1)).toEqual([])
    expect(tunesOf(s2)).toEqual([])
  })
})
