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
// the torpedo comes into existence on the ARMING frame (the LASER lands in the
// PT.LZF box around the porthole and the machine launches the torpedo for the
// pilot — sim.ts's portTorpedoArmed latch, sw3-15), so that frame is the launch
// and carries the knell. The detonation (the port scrolling into the $800 approach
// window with the latch set) carries the finale, exactly the ROM's
// PMSF2 -> [explosion] -> PMEND order.
//
// sw7-17 re-seat: the arming used to be driven here by a bolt hand-parked on the
// port, because the player's gun threw a travelling projectile. It is HITSCAN now
// (audit G-004) — nothing the player fires exists as an object, and the ROM's own
// arming test is the beam's — so the launch is driven by the real thing: aim at the
// port and pull the trigger. Nothing about WHICH tune fires WHEN has changed.
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
  SURFACE_END_SEQ,
  SURFACE_SEQ_SPAN,
  EXHAUST_PORT_DISTANCE,
  PORT_APPROACH_WINDOW,
  TRENCH_SCROLL_SPEED,
  type GameState,
} from '../../src/core/state'
import { TRENCH_EYE_MIN } from '../../src/core/trench-channel'
import { NO_INPUT, type Input } from '../../src/core/input'
import { aimAt, eyeOf, fireAt, release } from '../support/aim'
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

/** The tune names cued this frame, in event order. */
const tunesOf = (s: GameState): string[] =>
  s.events.filter((e: GameEvent) => e.type === 'tune').map((e) => e.tune)

// The far spawn is genuinely OUTSIDE the $800 approach window — the arming/
// detonation split below depends on it, so pin the geometry the fixtures assume.
it('fixture sanity: the far port spawn sits outside the approach window', () => {
  expect(EXHAUST_PORT_DISTANCE).toBeGreaterThan(PORT_APPROACH_WINDOW)
})

describe("tune cue — the death knell fires when the torpedo ARMS, not when it lands (U-010, WSGUNS.MAC:1220 FRPTGN)", () => {
  it('cues deathKnell on the frame the laser reaches the far port and launches the torpedo', () => {
    // Port far down the trench — outside the window — and the pilot puts the crosshair on
    // it and pulls: this frame ARMS (FRPTGN, the launch) but cannot detonate (no window).
    // sw7-17: the arming used to be a bolt parked on the port. It is the BEAM that arms the
    // torpedo now (WSLAZR.MAC's PT.LZF test), so the launch is a real shot — aimed from the
    // eye the pilot actually flies (768 above the floor: ~17.7° down at this range, well
    // inside the yoke's 30°), through the real resolve. Strictly stronger than the bolt.
    const far: Vec3 = [0, 0, -EXHAUST_PORT_DISTANCE]
    const s0 = trench(portAt(far))
    // The shot is one the yoke can physically make — pinned, not asserted in prose: a
    // launch fixture that needed an impossible crosshair would be the bolt's unbuildable
    // state wearing a beam's clothes.
    expect(aimAt(far, eyeOf(s0)).reachable).toBe(true)
    const s1 = stepGame(s0, fireAt(s0, far), DT)
    expect(s1.portTorpedoArmed).toBe(true) // the launch actually happened
    expect(tunesOf(s1)).toContain('deathKnell')
    // The run has NOT resolved — no detonation, no finale, no run-clear.
    expect(s1.events.map((e) => e.type)).not.toContain('death-star-destroyed')
    expect(tunesOf(s1)).not.toContain('finale')
  })

  it('the knell is a ONE-SHOT: the armed torpedo does not re-knell on later frames', () => {
    const far: Vec3 = [0, 0, -EXHAUST_PORT_DISTANCE]
    const s0 = trench(portAt(far))
    const shot = fireAt(s0, far)
    const s1 = stepGame(s0, shot, DT)
    expect(tunesOf(s1)).toContain('deathKnell') // fired on the arming frame…
    // Trigger released, crosshair still on the port. One pull opens an 8-frame sweep
    // (LZ.EDG), so the beam is STILL ON and still landing in the PT.LZF box this frame —
    // which is what makes this the real latch test: the knell is silenced by PT.LZF, not
    // merely by the laser having gone out.
    const s2 = stepGame(s1, release(shot), DT)
    expect(s2.laserEdge).toBeGreaterThan(0) // the sweep really is still live
    expect(s2.portTorpedoArmed).toBe(true) // still armed…
    expect(tunesOf(s2)).not.toContain('deathKnell') // …but silent (PT.LZF latch)
  })

  it('an ordinary trench shot that hits nothing is NOT a torpedo launch', () => {
    // A shot down the trench, aimed wide of the port (300 off-axis at the port's own
    // range — a reachable yoke, and ~3x the 108 porthole radius away): no arming, no
    // knell. The ROM's knell belongs to FRPTGN (the proton torpedo), never to laser fire.
    // sw7-17: this used to park a bolt mid-trench, which under a hitscan laser cannot arm
    // anything no matter what — it would now pass whatever the beam did. A real miss is
    // what keeps the test discriminating.
    const far: Vec3 = [0, 0, -EXHAUST_PORT_DISTANCE]
    const s0 = trench(portAt(far))
    const s1 = stepGame(s0, fireAt(s0, [300, 0, -EXHAUST_PORT_DISTANCE]), DT)
    expect(s1.laserEdge).toBeGreaterThan(0) // he really did shoot…
    expect(s1.portTorpedoArmed).toBe(false) // …and really did miss
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
    // The collapsed case: the laser only reaches the port AFTER the port is already inside
    // the window, so launch and detonation land on ONE frame. Both cues fire, and the
    // launch precedes the resolution, as WSGUNS.MAC:1220 precedes WSMAIN.MAC:2179 in every
    // real run.
    //
    // sw7-17: this used to park a bolt on a port at -300, which under a hitscan laser is
    // not a shot at all — and it cannot simply become one, because a port at -300 sits
    // 68.7° below a seated pilot and the yoke reaches 30°. The shot exists but it is a
    // sliver: the port lies IN the floor and climbs out of reach as it closes, so the
    // pilot must be flying the floor himself. At TRENCH_EYE_MIN (512, the ROM's minimum
    // ground clearance) with the yoke hard down, the beam grazes the porthole exactly as
    // it crosses the $800 gate — the last frame on which this shot is takeable at all.
    // RE-DERIVED for the ROM scroll (sw7-6 / B-008): the port advances one scroll-step
    // (TRENCH_SCROLL_SPEED × DT ≈ 262 u) between the frame's start and the beam's resolution, so
    // it must be seated one step + a hair OUTSIDE the gate to land just inside the $800 window on
    // the resolution frame — where it both detonates (in-window) and is still within the EYE_MIN
    // hard-down beam's grazing reach (which the port climbs out of as it closes). At the old 500
    // u/s speed it barely moved, so seating it AT the gate sufficed. The 30-unit inset keeps it
    // clear of the window edge without climbing past where the yoke-hard-down beam can reach.
    const atGate: Vec3 = [0, 0, -(PORT_APPROACH_WINDOW + TRENCH_SCROLL_SPEED * DT - 30)]
    const HARD_DOWN: Input = { aimX: 0, aimY: -1, fire: true, aspect: 1 }
    const s0 = trench(portAt(atGate), { trenchView: [0, TRENCH_EYE_MIN, 0] })
    const s1 = stepGame(s0, HARD_DOWN, DT)
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
    // WAVE 2 — wave 1 has no ground phase (D-015); the descent rides the space→surface edge.
    const s1 = stepGame(playing({ phase: 'space', wave: 2, phaseKills: SPACE_WAVE_QUOTA }), NO_INPUT, DT)
    expect(s1.phase).toBe('surface') // the transition actually happened
    expect(tunesOf(s1)).toContain('descent')
    // The towers loop still opens the phase (sw3-5's contract is untouched): the
    // descent tune rides OVER the loop start, the closest our un-sequenced sim
    // gets to PMDES(:1439) -> descend(:1442) -> PM4TH(:1636). The full timed
    // choreography is sw7-9 / A-019.
    expect(s1.events).toContainEqual({ type: 'music', track: 'towers' })
  })

  it('does NOT cue descent on the surface -> trench edge', () => {
    // Seat the wave-2 surface at its traversal completion (gdSeq >= 5, D-019) so the
    // next step crosses to the trench — the descent must NOT ride that edge.
    const s1 = stepGame(
      playing({ phase: 'surface', wave: 2, gdSeq: SURFACE_END_SEQ, surfaceScrollZ: SURFACE_END_SEQ * SURFACE_SEQ_SPAN + 1 }),
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
