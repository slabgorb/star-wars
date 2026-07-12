// tests/core/swept-port-collision.test.ts
//
// Story sw4-4 — swept/substepped bolt-vs-port collision (RED phase).
//
// THE BUG this suite pins: the exhaust-port hit test is a per-frame POINT-in-sphere
// snapshot — `collides(port, bolt.pos, PORT_HIT_RADIUS)` (src/core/sim.ts) samples
// only the bolt's position at the END of each frame. sw4-1 restores the player bolt
// to 12,000 u/s = 200 units/frame at 60fps, but the visible port sphere is only
// PORT_HIT_RADIUS = 70 (a 140-unit diameter). So a fast bolt can leap CLEAN OVER the
// sphere between two consecutive frames — in front of it one frame, past it the next —
// and the snapshot never catches it. The finish becomes unwinnable at speed. That is
// classic collision TUNNELLING.
//
// THE FIX sw4-4 asks for: decouple anti-tunnelling from the hit radius. Replace the
// snapshot with a SEGMENT-SWEPT (or SUBSTEPPED) bolt-vs-target test so the bolt's
// per-frame PATH is tested against the port sphere, not just its endpoint. A fast
// bolt whose path passes through the small port registers — WITHOUT inflating the
// radius. Hard constraints (SM Assessment / story title):
//   • PORT_HIT_RADIUS STAYS 70 — sw3-15's octagon-tight value. Do NOT restore 120.
//   • Keep sw3-15's $800 approach-window gate (the hit only resolves near the cockpit).
//   • Keep the core pure & deterministic (no wall-clock, no Math.random).
//
// Why these tests hand-place FAST bolts instead of firing them: sw4-4 branches off
// `develop`, where sw4-1 has NOT landed, so PROJECTILE_SPEED is still 5,000 (~83
// u/frame — under the port diameter, so a real fired bolt does not tunnel yet). To
// exercise the anti-tunnelling contract that sw4-1's fast bolt will later depend on,
// we construct the fast bolt directly (exactly as the sibling suites hand-place their
// `bolt()` for pinned geometry). sw4-4 lands the swept collision first; sw4-1 then
// rebases its 12,000 u/s bolt on top and no longer tunnels.
//
// Like the sibling suites (exhaust-port-outcome, exhaust-port-challenge, force-bonus)
// these drive behaviour through the pure surface — stepGame(state, input, dt) and the
// GameState/events it returns — asserting observable gameplay, never internal shape,
// and obey the sacred boundary: no DOM, no time except dt, no randomness except the
// seeded RNG in state.

import { describe, it, expect } from 'vitest'
import {
  initialState,
  PORT_HIT_RADIUS,
  PORT_APPROACH_WINDOW,
  PROJECTILE_TTL,
  type GameState,
  type Projectile,
} from '../../src/core/state'
import { EXHAUST_PORT } from '../../src/core/models'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import type { GameEvent } from '../../src/core/events'
import type { Vec3 } from '@arcade/shared/math3d'

/** A live exhaust port at a world position — the hit-test reads `.pos`. */
const portAt = (pos: Vec3): { pos: Vec3 } => ({ pos })

/** A fresh trench run with an explicit exhaust port. */
const trench = (
  port: { pos: Vec3 } | null,
  over: Partial<GameState> = {},
  seed = 1983,
): GameState => ({ ...initialState(seed), phase: 'trench', exhaustPort: port, ...over })

/** One real 60fps frame. */
const FRAME = 1 / 60

/** The port hit sphere's diameter — the widest per-frame step a POINT-snapshot test
 *  can still catch. A bolt stepping more than this in one frame can tunnel. */
const PORT_DIAMETER = PORT_HIT_RADIUS * 2

/** The visible octagon's outer reach (EXHAUST_PORT is stroked flat in the XZ plane).
 *  Derived from the model so the octagon-tight contract can't rot if it's re-authored. */
const OCTAGON_REACH = Math.max(...EXHAUST_PORT.vertices.map((v) => Math.hypot(v[0], v[2])))

const hit = (events: GameEvent[]): boolean => events.some((e) => e.type === 'death-star-destroyed')

/**
 * A trench run whose ONLY bolt is centred on the port but stepping so fast that, in
 * one 60fps frame, it jumps from `stepDist/2` in FRONT of the port to `stepDist/2`
 * BEHIND it — straddling the hit sphere so NEITHER sampled endpoint lands inside it.
 * With `stepDist > PORT_DIAMETER` this is a genuine tunnel: a point-in-sphere test on
 * either the start or the end position alone misses; only a swept path test catches it.
 */
function straddleState(portZ: number, stepDist: number, over: Partial<GameState> = {}): GameState {
  const startZ = portZ + stepDist / 2 // in front of the port (nearer the cockpit)
  const endZ = portZ - stepDist / 2 // behind the port (deeper down the trench)
  const velZ = (endZ - startZ) / FRAME // advances start → end in exactly one frame
  const boltPos: Vec3 = [0, 0, startZ]
  const bolt: Projectile = { pos: boltPos, vel: [0, 0, velZ], ttl: PROJECTILE_TTL }
  return { ...trench(portAt([0, 0, portZ]), { trenchShotsFired: 2, ...over }), projectiles: [bolt] }
}

/**
 * Fly a single hand-placed fast bolt from `boltPos` at `vel` for a fixed span of sim
 * time, chopped into `frames` equal-dt steps, collecting the event stream and halting
 * the moment the run leaves the trench (a hit warps to space). Same physical shot,
 * different sampling granularity — the essence of frame-rate independence.
 */
function flyAcross(
  port: Vec3,
  boltPos: Vec3,
  vel: Vec3,
  span: number,
  frames: number,
): { state: GameState; events: GameEvent[] } {
  const dt = span / frames
  let s: GameState = {
    ...trench(portAt(port), { trenchShotsFired: 2 }),
    projectiles: [{ pos: boltPos, vel, ttl: PROJECTILE_TTL }],
  }
  const events: GameEvent[] = []
  for (let i = 0; i < frames && s.phase === 'trench'; i++) {
    s = stepGame(s, NO_INPUT, dt)
    events.push(...s.events)
  }
  return { state: s, events }
}

// ---------------------------------------------------------------------------
// The core defect: a fast bolt must sweep the port, not tunnel through it
// ---------------------------------------------------------------------------

describe('sw4-4 — a fast bolt sweeps the exhaust port instead of tunnelling through it', () => {
  it.each([2, 4, 7])(
    'a centred bolt stepping %s× the port diameter in one frame still detonates it (RED: tunnels today)',
    (mult) => {
      // Deep inside the $800 window (so the window never confounds the RADIUS/sweep
      // question), stepped far enough that both sampled positions clear the sphere.
      const PORT_Z = -500
      const stepDist = PORT_DIAMETER * mult
      const startZ = PORT_Z + stepDist / 2
      const endZ = PORT_Z - stepDist / 2
      // Anti-vacuous: BOTH the frame-start and frame-end positions sit OUTSIDE the hit
      // sphere, so a point-in-sphere test on either alone genuinely misses — this is a
      // real tunnel, not a trivially-inside hit. (Margin ≫ the port's ~8u/frame scroll.)
      expect(Math.abs(startZ - PORT_Z)).toBeGreaterThan(PORT_HIT_RADIUS)
      expect(Math.abs(endZ - PORT_Z)).toBeGreaterThan(PORT_HIT_RADIUS)
      const s1 = stepGame(straddleState(PORT_Z, stepDist), NO_INPUT, FRAME)
      expect(hit(s1.events)).toBe(true) // the swept/substepped test catches the crossing
      expect(s1.exhaustPort).toBeNull() // ...and the port is destroyed
    },
  )

  it("sw4-1's restored 12,000 u/s bolt (200 u/frame) no longer leaps over the 140-u port", () => {
    // The exact shot this story exists to unblock: 12,000 u/s ÷ 60fps = 200 units/frame,
    // 1.43× the port diameter — so one frame carries it clean past the whole sphere.
    const PORT_Z = -300
    const STEP = 200
    expect(STEP).toBeGreaterThan(PORT_DIAMETER) // a single frame overshoots the sphere
    const s0 = straddleState(PORT_Z, STEP)
    expect(s0.projectiles[0].vel).toEqual([0, 0, -12000]) // this really is sw4-1's bolt speed
    const s1 = stepGame(s0, NO_INPUT, FRAME)
    expect(hit(s1.events)).toBe(true)
    expect(s1.exhaustPort).toBeNull()
  })

  it('the hit is frame-rate independent — the same shot detonates at both coarse (1-step) and fine (60-step) framing', () => {
    // The anti-tunnelling contract stated as frame-rate independence: one physical shot
    // that flies from in-front-of to behind the port over a fixed span must resolve the
    // SAME way however the span is sampled. Today the fine run catches it (many small
    // samples land inside the sphere) but the coarse run tunnels — the outcome flips
    // with frame rate, which is exactly the bug.
    const PORT: Vec3 = [0, 0, -300]
    const START: Vec3 = [0, 0, -150] // in front of the port, outside the sphere
    const SPAN = FRAME // total sim time the shot is in flight
    const VEL: Vec3 = [0, 0, -18000] // carries the bolt -150 → -450 over SPAN

    const coarse = flyAcross(PORT, START, VEL, SPAN, 1) // one big step — tunnels today
    const fine = flyAcross(PORT, START, VEL, SPAN, 60) // 60 small steps — samples inside today

    expect(hit(fine.events)).toBe(true) // fine sampling already lands the hit (control)
    expect(hit(coarse.events)).toBe(true) // RED: the coarse step must NOT tunnel past it
    expect(hit(coarse.events)).toBe(hit(fine.events)) // outcome is independent of framing
  })
})

// ---------------------------------------------------------------------------
// The fix must SWEEP, not WIDEN — sw3-15's octagon-tight radius & $800 window hold
// ---------------------------------------------------------------------------

describe('sw4-4 — the swept fix preserves the octagon-tight radius and the approach window', () => {
  it('PORT_HIT_RADIUS stays octagon-tight (≤ the ~70 the player sees) — never the fat 120 sphere', () => {
    // The story's headline constraint: anti-tunnelling must be decoupled from the hit
    // radius. Papering over the tunnel by re-inflating the sphere toward the old 120 is
    // forbidden — that would re-break sw3-15's WYSIWYG finish.
    expect(OCTAGON_REACH).toBeGreaterThan(60)
    expect(OCTAGON_REACH).toBeLessThan(80)
    expect(PORT_HIT_RADIUS).toBeLessThanOrEqual(Math.ceil(OCTAGON_REACH))
    expect(PORT_HIT_RADIUS).toBeLessThan(120)
  })

  it('a FAST bolt whose whole path stays wider than the hit radius still misses (swept, not widened)', () => {
    // A fast bolt offset laterally just past the sphere — inside the OLD 120, outside the
    // real 70 — sweeps straight down the trench without ever coming within PORT_HIT_RADIUS
    // of the port. A correct swept test (perpendicular distance to the path) misses it; a
    // lazy "just widen the radius" fix would wrongly catch it. Keeps GREEN honest.
    const OFFSET = PORT_HIT_RADIUS + 25 // outside 70, inside the removed 120
    expect(OFFSET).toBeGreaterThan(PORT_HIT_RADIUS)
    expect(OFFSET).toBeLessThan(120)
    const stepDist = PORT_DIAMETER * 3
    const s0: GameState = {
      ...trench(portAt([0, 0, -300]), { trenchShotsFired: 2 }),
      projectiles: [
        { pos: [OFFSET, 0, -300 + stepDist / 2], vel: [0, 0, -stepDist / FRAME], ttl: PROJECTILE_TTL },
      ],
    }
    const s1 = stepGame(s0, NO_INPUT, FRAME)
    expect(hit(s1.events)).toBe(false) // off the visible octagon → no hit, however fast
    expect(s1.exhaustPort).not.toBeNull()
  })

  it('the sweep stays gated to the $800 approach window — a fast bolt through a port beyond the window does not count', () => {
    // sw3-15's gate: the hit only resolves once the port has scrolled into the narrow
    // near-cockpit window. A swept test must respect that gate — tunnelling a port that
    // is still far up the channel must NOT detonate it (the port survives to scroll into
    // the window on a later frame). Guards against a swept fix that drops the window check.
    const FAR_Z = -(PORT_APPROACH_WINDOW + 400) // -1200: well beyond the near-cockpit window
    expect(FAR_Z).toBeLessThan(-PORT_APPROACH_WINDOW)
    const s1 = stepGame(straddleState(FAR_Z, PORT_DIAMETER * 3), NO_INPUT, FRAME)
    expect(hit(s1.events)).toBe(false) // outside the window → no resolution, swept or not
    expect(s1.exhaustPort).not.toBeNull() // the port survives to be resolved later
  })
})

// ---------------------------------------------------------------------------
// The swept outcome stays a pure, deterministic core
// ---------------------------------------------------------------------------

describe('sw4-4 — the swept collision preserves core purity & determinism', () => {
  it('a swept-hit run is deterministic — identical event stream and terminal state twice over', () => {
    // The swept/substepped math must add NO wall-clock and NO Math.random: the same fast
    // shot resolves bit-identically twice. A time- or RNG-sourced sub-step count would
    // diverge here while a single-step run happened to match.
    const a = stepGame(straddleState(-300, PORT_DIAMETER * 3), NO_INPUT, FRAME)
    const b = stepGame(straddleState(-300, PORT_DIAMETER * 3), NO_INPUT, FRAME)
    expect(a.events).toEqual(b.events)
    expect(a).toEqual(b)
    expect(hit(a.events)).toBe(true) // it actually resolved in a kill (non-vacuous)
  })

  it('resolving a swept hit never mutates the input state', () => {
    const s0 = straddleState(-300, PORT_DIAMETER * 3)
    const beforePort: Vec3 | null = s0.exhaustPort ? ([...s0.exhaustPort.pos] as Vec3) : null
    const beforeBolt: Vec3 = [...s0.projectiles[0].pos] as Vec3
    stepGame(s0, NO_INPUT, FRAME)
    expect(s0.exhaustPort ? s0.exhaustPort.pos : null).toEqual(beforePort) // input port untouched
    expect(s0.projectiles[0].pos).toEqual(beforeBolt) // input bolt untouched
  })
})
