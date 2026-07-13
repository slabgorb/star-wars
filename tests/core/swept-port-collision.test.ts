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
// ⚠ RE-SEATED BY sw5-4 — read the first bullet as history, not as a live constraint.
// The octagon it pinned 70 against was an AUTHORED shape (the disassembly held no
// vertex table for the port). WSOBJ.MAC `.WP PORT` does, so sw5-4 swaps in the real
// object and the radius is re-tuned to the ROM porthole (70 → 96-136). What sw4-4
// actually cares about is UNTOUCHED and still enforced below: anti-tunnelling must be
// achieved by SWEEPING the bolt's path, never by inflating the sphere. The ceiling
// that forbids inflation is now the porthole/berm rather than the literal 120 — which,
// against the real hole, would have forbidden a correct radius.
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
  TRENCH_SCROLL_SPEED,
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

/**
 * The visible target's reach. RE-SEATED BY sw5-4: EXHAUST_PORT was an authored octagon
 * lying flat in the XZ plane (reach ~69.5); it is now the ROM's `PORT` — three
 * concentric squares flat in z=0, facing the pilot. The hole the player shoots is the
 * innermost (`.WGD PORT`'s red `;PORTHOLE` pen); the berm and base are the lip and the
 * Death Star surface around the shaft. Derived from the model so this contract cannot
 * rot if it is ever re-ported again.
 */
const PORTHOLE_HALF_WIDTH = 96 // `.PH 0C,0C,0` × .S=8 — the hole
const BERM_HALF_WIDTH = 160 //    `.PH 14,14,0` × .S=8 — the lip
const BASE_HALF_WIDTH = 256 //    `.PH 20,20,0` × .S=8 — Death Star surface
/** The porthole's corner reach — the WYSIWYG ceiling. ~135.8. */
const PORTHOLE_REACH = Math.hypot(PORTHOLE_HALF_WIDTH, PORTHOLE_HALF_WIDTH)

/** What the port model ACTUALLY ships, read in the plane the ROM plate lies in.
 *  Checked against the ROM constants above by the guard test — never used in their
 *  place, so a shrunken or re-authored port can never quietly satisfy the bounds. */
const MODEL_RINGS = [...new Set(EXHAUST_PORT.vertices.map((v) => Math.abs(v[0])))].sort(
  (a, b) => a - b,
)

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

  it("sw4-1's restored 12,000 u/s bolt (200 u/frame) detonates the port", () => {
    // The exact shot this story exists to unblock: 12,000 u/s ÷ 60fps = 200 units/frame.
    //
    // RE-SEATED BY sw5-4 — and CORRECTED, not just re-narrated. The first draft of this
    // comment claimed that, since `STEP(200) > PORT_DIAMETER(216)` no longer holds now
    // that PORT_HIT_RADIUS is 108, "sw4-1's bolt was never going to tunnel through the
    // port the cabinet actually has." THAT CLAIM IS FALSE — IT STILL TUNNELS. Proof:
    // `straddleState` places the bolt's frame-end sample at stepDist/2 = 100u behind the
    // port's position AT THE START of the frame. But the port itself scrolls
    // TRENCH_SCROLL_SPEED toward the bolt over that same frame — 500/60 ≈ 8.33u — so by
    // the time the frame resolves, the true separation between the bolt's end sample and
    // the port's (now-scrolled) position is 100 + 8.33 = 108.33u — a hair OUTSIDE
    // PORT_HIT_RADIUS (108). A plain point-in-sphere snapshot on the bolt's end position
    // genuinely misses by 0.33u; only the sweep still catches it. (Verified empirically:
    // reverting sweptCollides to a point-in-sphere check on `pos` alone fails this exact
    // test.) So the OLD premise — "one frame carries the bolt clean past the whole
    // sphere" — no longer holds at this speed, but the port's own per-frame scroll
    // reopens a razor-thin gap the sweep still has to close.
    //
    // What sw4-4 genuinely owns is untouched and still proven: the sweep catches a bolt
    // that overshoots the sphere by a wide margin at 2×, 4× and 7× the diameter, in the
    // it.each above. This case keeps its other half — the real shot, at the real speed,
    // still wins.
    const PORT_Z = -300
    const STEP = 200
    // Anti-vacuous: pin the margin itself, in the ROM's own units. If a future tuning of
    // PORT_HIT_RADIUS or TRENCH_SCROLL_SPEED erases this ~0.33u gap, THIS fires — rather
    // than the assertions below silently degrading into a snapshot-equivalent no-op that
    // would still pass, but for the wrong reason (the bolt landing inside the sphere on
    // its own, with the sweep never actually exercised).
    expect(STEP / 2 + TRENCH_SCROLL_SPEED * FRAME).toBeGreaterThan(PORT_HIT_RADIUS)
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
// The fix must SWEEP, not WIDEN — the target-tight radius & $800 window hold
// (sw5-4: the visible target is now the ROM porthole, not the authored octagon)
// ---------------------------------------------------------------------------

describe('sw4-4 — the swept fix preserves the target-tight radius and the approach window', () => {
  it('PORT_HIT_RADIUS stays target-tight (≤ the porthole you see) — the fix must SWEEP, not WIDEN', () => {
    // The story's headline constraint: anti-tunnelling must be decoupled from the hit
    // radius. Papering over the tunnel by inflating the sphere is forbidden — that would
    // re-break sw3-15's WYSIWYG finish.
    //
    // RE-SEATED BY sw5-4. The old literal ceiling was 120 ("never restore the fat sphere
    // sw3-15 removed"), which was meaningful only against the authored octagon's ~70. The
    // ROM porthole reaches ~135.8, so 120 is now TIGHTER than the target and the old
    // ceiling would forbid a CORRECT radius. The intent — the sphere may never swell out
    // past the hole onto the surrounding structure — is preserved by ceiling it at the
    // porthole and the berm, which is what "don't widen" always meant.
    // The guard: the bounds are stated in the ROM's units, so they only mean anything
    // if the port we draw and collide against IS the ROM plate. If the model is ever
    // re-authored (as the octagon was), this fires first and the bound can be re-read
    // rather than silently rotting.
    expect(MODEL_RINGS, 'the port model is the ROM plate').toEqual([
      PORTHOLE_HALF_WIDTH,
      BERM_HALF_WIDTH,
      BASE_HALF_WIDTH,
    ])
    expect(PORT_HIT_RADIUS).toBeLessThanOrEqual(Math.ceil(PORTHOLE_REACH))
    expect(PORT_HIT_RADIUS, 'never out onto the berm').toBeLessThan(BERM_HALF_WIDTH)
  })

  it('a FAST bolt whose whole path stays wider than the hit radius still misses (swept, not widened)', () => {
    // A fast bolt offset laterally just past the sphere sweeps straight down the trench
    // without ever coming within PORT_HIT_RADIUS of the port. A correct swept test
    // (perpendicular distance to the path) misses it; a lazy "just widen the radius" fix
    // would wrongly catch it. Keeps GREEN honest.
    //
    // The offset is derived from the radius, so it re-seats itself: it is a NEAR miss —
    // outside the sphere, but still on the plate rather than a wild shot down the trench.
    const OFFSET = PORT_HIT_RADIUS + 25
    expect(OFFSET).toBeGreaterThan(PORT_HIT_RADIUS)
    expect(OFFSET, 'still on the plate — a near miss, not a wild shot').toBeLessThanOrEqual(BASE_HALF_WIDTH)
    const stepDist = PORT_DIAMETER * 3
    const s0: GameState = {
      ...trench(portAt([0, 0, -300]), { trenchShotsFired: 2 }),
      projectiles: [
        { pos: [OFFSET, 0, -300 + stepDist / 2], vel: [0, 0, -stepDist / FRAME], ttl: PROJECTILE_TTL },
      ],
    }
    const s1 = stepGame(s0, NO_INPUT, FRAME)
    expect(hit(s1.events)).toBe(false) // off the visible porthole → no hit, however fast
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
