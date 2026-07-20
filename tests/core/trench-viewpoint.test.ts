// tests/core/trench-viewpoint.test.ts
//
// Story sw3-2 — "Trench pilotable viewpoint (sub_703B band)". RED phase.
//
// Today the trench cockpit is the immovable constant COCKPIT = [0,0,0]
// (src/core/sim.ts stepTrench): aimX/aimY only steer the firing ray, never the
// ship, and cameraView() lifts the trench eye to a FIXED TRENCH_SKIM. So the
// single catwalk (station 4, y=200, CATWALK_HIT_RADIUS=240) collides on every
// pass — a guaranteed shield loss with zero counterplay, byte-identical run to
// run (audit docs/sw2-6-disassembly-fidelity-audit.md §4).
//
// ROM `sub_703B` flies the viewpoint within a clamped band — ±511 lateral,
// −257…−3583 vertical — so the pilot can dive under (or slip past) the catwalk.
//
// ⚠ RE-SEATED BY sw5-6. This suite was written when "the ROM↔world-unit conversion is
// still unresolved", and it therefore pinned the band by SIGN rather than by magnitude:
// the eye seated at [0,0,0] and could only ever go NEGATIVE ("no frame ever rose above
// the seat"). sw5-6 resolves the conversion — it is 1:1 — and that reading turns out to
// be wrong in two ways:
//
//   1. The ROM's band is not a dive-only band. −257…−3583 is a range the pilot flies
//      BOTH ways inside a 0x1000-deep trench; he climbs as well as dives. The old
//      `Math.min(0, …)` clamp forbade climbing outright.
//   2. The sign convention collided with trench-channel.ts, which builds the floor at
//      y=0 and the walls UP. A negative "dive" band added to TRENCH_SKIM=60 flew the
//      camera to y = −3268 — three thousand units UNDER the trench floor. (Measured;
//      see tests/shell/render.trench-eye.test.ts.)
//
// sw5-6 resolves the frame: `trenchView[1]` is the eye's HEIGHT ABOVE THE TRENCH FLOOR,
// a positive quantity clamped to the ROM's band, and the shell's TRENCH_SKIM fudge is
// retired. The assertions below are re-expressed against the SEAT and the band constants
// instead of against zero. Every one of their original INTENTS is preserved — responds to
// the yoke, saturates at a finite bound, no overshoot, no wrap, symmetric laterally.
//
//   • CONTRACT: `trenchView: Vec3` is the pilotable eye. Trench entry seats it at
//     TRENCH_EYE_SEAT — the ROM's own entry height ("JUST ABOVE BOTTOM OF TRENCH",
//     WSMAIN.MAC SMVG1B) — and the yoke flies it within [TRENCH_EYE_MIN, TRENCH_EYE_MAX],
//     with no overshoot and no wrap. stepTrench collides the catwalk against `trenchView`.
//
//   • BEHAVIOUR: a sustained dive dodges the catwalk (no crash, no shield), while neutral
//     input still costs exactly one shield (hazard preserved).
//
// The two BEHAVIOURAL tests at the bottom are untouched. They target OUTCOMES, so they
// survive the re-frame — and they now do real work: they are what forces the re-anchored
// catwalk (AC-5) to sit at a height the seated pilot actually hits and a diving pilot
// actually clears. If Dev rescales the catwalk to a naive fraction of the taller wall,
// they fail.

import { describe, it, expect } from 'vitest'
import { initialState, type GameState, type TrenchObstacle } from '../../src/core/state'
import { stepGame, enterPhase } from '../../src/core/sim'
import { NO_INPUT, type Input } from '../../src/core/input'
import {
  TRENCH_HALF_W,
  TRENCH_EYE_MIN,
  TRENCH_EYE_MAX,
  TRENCH_EYE_SEAT,
} from '../../src/core/trench-channel'

// Yoke presets. +aimY is UP (input.ts); the catwalk hangs overhead, so a DIVE (aimY < 0)
// is the maneuver that opens clearance beneath it. sw5-6 re-anchors the catwalk's height
// to the pinned trench, so it is no longer named here as a literal — the behavioural tests
// below take it from the obstacle table, whatever it becomes.
const DOWN: Input = { aimX: 0, aimY: -1, fire: false }
const LEFT: Input = { aimX: -1, aimY: 0, fire: false }
const RIGHT: Input = { aimX: 1, aimY: 0, fire: false }

/** The wall force-field hazard the viewpoint tests fly against: a LEFT-wall field at
 *  the seated pilot's height, just downrange. MIGRATED (sw7-22 / R6d): force fields are
 *  now STREAMED from the wedge grid, not carried by `spawnTrenchObstacles`, so this
 *  fixture builds the field it needs directly — exactly as trench-force-field-hazard.test.ts
 *  stages it — instead of pulling a placeholder catwalk out of the obstacle table. */
function spawnedCatwalk(): TrenchObstacle {
  return { kind: 'catwalk', pos: [-TRENCH_HALF_W, TRENCH_EYE_SEAT, -2000] }
}

/**
 * A fresh, isolated trench holding ONLY the given obstacles and no exhaust port,
 * so the catwalk crash is the only thing that can cost a shield and the viewpoint
 * is the only thing that moves.
 */
function trenchStart(obstacles: TrenchObstacle[] = []): GameState {
  return {
    ...enterPhase(initialState(), 'trench'),
    mode: 'playing',
    exhaustPort: null,
    trenchObstacles: obstacles.map((o) => ({ kind: o.kind, pos: [...o.pos] as TrenchObstacle['pos'] })),
    projectiles: [],
  }
}

/** Step the yoke held for `frames` at a fixed `dt`, returning the final state. */
function hold(state: GameState, input: Input, frames: number, dt = 0.1): GameState {
  let s = state
  for (let i = 0; i < frames; i++) s = stepGame(s, input, dt)
  return s
}

/** The yoke pushed UP — the ROM pilot climbs as well as dives. */
const UP: Input = { aimX: 0, aimY: 1, fire: false }

describe('sw3-2 — trench pilotable viewpoint exists and responds to the yoke', () => {
  it('seats the eye at the ROM\'s entry height on trench entry', () => {
    // WSMAIN.MAC SMVG1B drops the pilot into the trench until he is "JUST ABOVE BOTTOM OF
    // TRENCH", so he enters riding LOW in the channel — not at some abstract origin. The
    // seat must be inside the band it is later clamped to, or the very first frame is
    // already illegal.
    const s = trenchStart()
    expect(s.trenchView[1]).toBe(TRENCH_EYE_SEAT)
    expect(TRENCH_EYE_SEAT, 'the seat is inside the band').toBeGreaterThanOrEqual(TRENCH_EYE_MIN)
    expect(TRENCH_EYE_SEAT, 'the seat is inside the band').toBeLessThanOrEqual(TRENCH_EYE_MAX)
    expect(s.trenchView[0], 'and dead centre laterally').toBe(0)
  })

  it('flies the eye DOWN when the yoke is pushed down', () => {
    const s = hold(trenchStart(), DOWN, 5)
    expect(s.trenchView[1], 'dove below the seat').toBeLessThan(TRENCH_EYE_SEAT)
  })

  it('flies the eye UP when the yoke is pulled back — the pilot can CLIMB', () => {
    // New in sw5-6. The old clamp was `Math.min(0, …)`: the eye could only ever sink from
    // its seat. The ROM band runs from -0xE00 up to -0x100 — 512 to 3840 above the floor —
    // and the pilot flies all of it. Climbing is how he sees over the trench furniture and
    // gets an angle on a target lying in the floor.
    const s = hold(trenchStart(), UP, 5)
    expect(s.trenchView[1], 'climbed above the seat').toBeGreaterThan(TRENCH_EYE_SEAT)
  })

  it('flies the eye laterally when the yoke is pushed sideways', () => {
    const right = hold(trenchStart(), RIGHT, 5)
    const left = hold(trenchStart(), LEFT, 5)
    expect(right.trenchView[0]).toBeGreaterThan(0)
    expect(left.trenchView[0]).toBeLessThan(0)
  })
})

describe('sw3-2 — the viewpoint is clamped to the band (no overshoot, no wrap)', () => {
  it('a sustained dive saturates at the ROM floor clearance and holds there', () => {
    const entered = trenchStart()
    const a = hold(entered, DOWN, 2000) // ~200s of sim — well past any sane band depth
    const b = hold(a, DOWN, 2000) // holding longer must not push it any deeper
    expect(b.trenchView[1]).toBe(a.trenchView[1]) // saturated: no further travel
    expect(b.trenchView[1], 'the floor is the ROM\'s minimum ground clearance').toBe(TRENCH_EYE_MIN)
    expect(Number.isFinite(b.trenchView[1])).toBe(true) // a real bound, not ±Infinity/NaN
    expect(b.trenchView[1], 'and it is ABOVE the trench floor, not below it').toBeGreaterThan(0)
  })

  it('a sustained climb saturates at the ROM ceiling and holds there', () => {
    const entered = trenchStart()
    const a = hold(entered, UP, 2000)
    const b = hold(a, UP, 2000)
    expect(b.trenchView[1]).toBe(a.trenchView[1])
    expect(b.trenchView[1], 'the ceiling is the ROM\'s up limit').toBe(TRENCH_EYE_MAX)
  })

  it('clamps a single oversized step to the floor instead of overshooting past it', () => {
    const entered = trenchStart()
    const floor = hold(entered, DOWN, 2000).trenchView[1]
    // One giant dt=100s step would integrate to -rate*100 with no clamp; the band
    // must cap it at the SAME floor a long hold reaches.
    const oneBigStep = stepGame(entered, DOWN, 100).trenchView[1]
    expect(oneBigStep).toBe(floor)
  })

  it('never wraps: a very long dive stays inside the band the whole way', () => {
    // The original intent — no wrap-around, no NaN, no escape — kept. What is dropped is
    // its accidental corollary ("no frame ever rose above the seat"), which was an artifact
    // of the dive-only clamp and would now forbid the ROM's own climb.
    let s = trenchStart()
    for (let i = 0; i < 3000; i++) {
      s = stepGame(s, DOWN, 0.1)
      expect(s.trenchView[1]).toBeGreaterThanOrEqual(TRENCH_EYE_MIN)
      expect(s.trenchView[1]).toBeLessThanOrEqual(TRENCH_EYE_MAX)
    }
  })

  it('the lateral clamp is symmetric — a full-left bound mirrors a full-right bound', () => {
    const left = hold(trenchStart(), LEFT, 2000).trenchView[0]
    const right = hold(trenchStart(), RIGHT, 2000).trenchView[0]
    expect(right).toBeGreaterThan(0)
    expect(left).toBeCloseTo(-right, 5) // ROM ±511 about centre → symmetric in world units
  })
})

describe('sw7-19 (B-012) — the catwalk is a side-gated wall force field: grazes, but costs no shield', () => {
  it('steering to the OPPOSITE wall dodges the wall force field — no crash, no shield', () => {
    // The catwalk is now a LEFT-wall force field (B-012), dodged LATERALLY — steer to the
    // RIGHT wall (the opposite side of `IFLE ;?ON LEFT SIDE?`) and it cannot reach you. This
    // replaces sw3-2's dive-under: with the wall band, a dive stays on the left and still
    // grazes; the authentic dodge is the far wall.
    let s = trenchStart([spawnedCatwalk()])
    const lives0 = s.lives
    let crashed = false
    const dt = 1 / 60
    for (let i = 0; i < 600 && s.trenchObstacles.length > 0; i++) {
      s = stepGame(s, RIGHT, dt)
      if (s.events.some((e) => e.type === 'terrain-crash')) crashed = true
    }
    expect(crashed).toBe(false) // steered to the far wall — the graze never fires
    expect(s.lives).toBe(lives0) // no shield lost
    expect(s.trenchObstacles).toHaveLength(0) // the field scrolled harmlessly past
  })

  it('neutral input GRAZES it (terrain-crash) but costs NO shield — a graze is not a shield hit (B-012)', () => {
    // A hands-off run rides centre = the ROM's left side, so it grazes the left-wall field:
    // the crash sound fires (hazard preserved), but WSPANL's contact is a graze — the shield
    // accounting rides WSGLOW (score-shields scope), so no shield is spent here (was: −1).
    let s = trenchStart([spawnedCatwalk()])
    const lives0 = s.lives
    let crashed = false
    for (let i = 0; i < 600 && s.trenchObstacles.length > 0; i++) {
      s = stepGame(s, NO_INPUT, 1 / 60)
      if (s.events.some((e) => e.type === 'terrain-crash')) crashed = true
    }
    expect(crashed).toBe(true) // an un-piloted run still grazes the field...
    expect(s.lives).toBe(lives0) // ...but a graze costs NO shield
    expect(s.trenchObstacles).toHaveLength(0)
  })
})
