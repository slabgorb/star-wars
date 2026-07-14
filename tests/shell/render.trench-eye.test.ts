// tests/shell/render.trench-eye.test.ts
//
// Story sw5-6 — RED phase (O'Brien / TEA): the pilot must fly INSIDE the trench.
//
// GROUND TRUTH is WSMAIN.MAC + WSBASE.MAC (~/Projects/star-wars-1983-source-text).
//
// == THE LIVE BUG =============================================================
//
// The trench frame is self-contradictory, and it is not academic — it flies the camera
// through the floor.
//
//   trench-channel.ts (11-6):  the floor is y=0, the walls rise to y=+TRENCH_WALL_H.
//   TRENCH_VIEW_FLOOR (sw3-2): "the eye seats at the trench TOP (y=0) and dives to this
//                               floor" — a NEGATIVE band, [-3328, 0].
//
// Both cannot be true. sw3-2 transcribed the ROM's frame (where the trench top IS height
// 0 and the floor is below it); 11-6 built the channel with y=0 as the floor. The two met
// in render.ts:
//
//   viewMatrix([trenchView[0], TRENCH_SKIM + trenchView[1], trenchView[2]], IDENTITY)
//
// with TRENCH_SKIM = 60 and trenchView[1] clamped to [-3328, 0]. So the eye ranges over
// y ∈ [-3268, +60]: it starts 60 above the floor and every downward yoke input drives it
// UNDER the trench. The pilot spends most of the reachable band outside the geometry.
//
// == WHAT THE ROM SAYS ========================================================
//
// The trench is 0x1000 (4096) deep — top at height 0, floor at -0x1000 (WSBASE.MAC TBSBL;
// see tests/core/trench-rom-geometry.test.ts for that oracle). Within it:
//
//   WSMAIN.MAC `S1MVBS`  — lateral clamp, ±0x1FF:
//       CMPD #1FF   / BLE 35$ / LDD #1FF
//       CMPD #-1FF  / BGE 38$ / LDD #-1FF
//
//   WSMAIN.MAC `SMVG1B`  — the ground→trench transition, which tells us where the pilot
//   SETTLES, in the ROM's own words:
//       LDD M$TZ+M.S1
//       CMPD #-0E00+100      ;JUST ABOVE BOTTOM OF TRENCH
//       IFGT
//       SUBD #100
//       STD M$TZ+M.S1        ;DROP PLAYER INTO TRENCH
//
//   The disassembly's vertical clamp (sub_703B: -257 … -3583) is exactly this band read
//   exclusively: -0xE00 = -3584 is the down limit and -0x100 = -256 the up limit, so the
//   reachable heights are -3583 … -257.
//
// Converted to HEIGHT ABOVE THE FLOOR (floor = -0x1000):
//
//   down limit  -0xE00  ->  0x1000 - 0xE00 = 0x200 =  512   <- minimum ground clearance
//   up limit    -0x100  ->  0x1000 - 0x100 = 0xF00 = 3840
//
// That 0x200 = 512 minimum clearance is the SAME constant the surface phase flies by
// (WSMAIN.MAC `GD$MNT == 200`). The cabinet never lets the ship closer than 512 to the
// ground, in either phase. Ours currently skims at 60 — an order of magnitude below the
// floor clearance the machine enforces.
//
// This suite pins the OBSERVABLE: wherever the yoke is driven, the eye stays inside the
// trench and inside the ROM's band. It does not care how Dev decomposes TRENCH_SKIM and
// trenchView — only where the pilot ends up.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/shell/wireframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shell/wireframe')>()
  return { ...actual, drawWireframe: vi.fn() }
})

import { drawWireframe } from '../../src/shell/wireframe'
import { render } from '../../src/shell/render'
import { initialState, type GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { TRENCH_WALL_H } from '../../src/core/trench-channel'
import type { Model3D } from '../../src/core/models'
import { transform, type Mat4, type Vec3 } from '@arcade/shared/math3d'
import type { Input } from '../../src/core/input'

const W = 800
const H = 600
const DT = 1 / 60

// --- the ROM's eye band, in height ABOVE THE TRENCH FLOOR --------------------

/** WSMAIN.MAC: down limit -0xE00 in a 0x1000-deep trench. Also `GD$MNT == 200`, the
 *  surface phase's minimum ground clearance — the same number, in both phases. */
const ROM_EYE_MIN = 0x1000 - 0xe00 //  512
/** WSMAIN.MAC: up limit -0x100 in a 0x1000-deep trench. */
const ROM_EYE_MAX = 0x1000 - 0x100 // 3840
/** WSMAIN.MAC `S1MVBS`: `CMPD #1FF` / `CMPD #-1FF`. */
const ROM_EYE_HALF_W = 0x1ff //       511
/** WSMAIN.MAC `SMVG1B`: the pilot is dropped until he is at or below -0xE00+0x100,
 *  i.e. he settles "JUST ABOVE BOTTOM OF TRENCH" — between 512 and 768 above it. */
const ROM_EYE_SETTLED_MAX = 0x1000 - (0xe00 - 0x100) // 768

function makeCtx(): CanvasRenderingContext2D {
  const ctx = {
    fillStyle: '', strokeStyle: '', shadowColor: '', shadowBlur: 0, lineWidth: 0,
    font: '700 18px monospace', textAlign: '', textBaseline: '', letterSpacing: '',
    globalCompositeOperation: '',
    fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, moveTo() {},
    lineTo() {}, stroke() {}, save() {}, restore() {}, fillText() {}, arc() {},
  }
  return ctx as unknown as CanvasRenderingContext2D
}

const trenchRun = (): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'trench',
  exhaustPort: { pos: [0, 0, -2400] },
  trenchObstacles: [],
  projectiles: [],
})

const yoke = (aimX: number, aimY: number): Input => ({ aimX, aimY, fire: false })

/**
 * The pilot's position in WORLD space, recovered from the frame the shell actually drew.
 *
 * The trench channel is handed to drawWireframe with the VIEW matrix as its modelView
 * (render.ts: `drawWireframe(ctx, trenchChannel(...), view, ...)`) — its vertices are
 * already world-space. The trench camera is IDENTITY-oriented, so `view` is a pure
 * translation by −eye, and transforming any world point p gives p − eye.
 *
 * So the eye falls straight out of a floor vertex (world y = 0):
 *     transform(view, [x, 0, z]) = [x, 0, z] − eye   ⇒   eyeHeightAboveFloor = −(that).y
 */
function pilot(state: GameState): { above: number; lateral: number } {
  vi.mocked(drawWireframe).mockClear()
  render(makeCtx(), state, W, H)
  const call = vi
    .mocked(drawWireframe)
    .mock.calls.find((c) => (c[1] as Model3D)?.name === 'Trench Channel')
  expect(call, 'render() draws the trench channel during a trench run').toBeTruthy()
  const view = call![2] as Mat4

  const origin = transform(view, [0, 0, 0] as Vec3) // = −eye
  return { above: -origin[1], lateral: -origin[0] }
}

/** Fly the trench for `frames` ticks on a fixed yoke, then report where the pilot is. */
function flyThen(aimX: number, aimY: number, frames: number) {
  let s = trenchRun()
  for (let i = 0; i < frames; i++) s = stepGame(s, yoke(aimX, aimY), DT)
  return pilot(s)
}

describe('sw5-6 — the pilot flies INSIDE the trench', () => {
  beforeEach(() => vi.mocked(drawWireframe).mockClear())

  it('never sinks below the floor, however hard the yoke is pushed DOWN', () => {
    // THE BUG, stated as a test. Today: trenchView[1] clamps to [-3328, 0] and the shell
    // adds TRENCH_SKIM=60, so five seconds of down-yoke puts the eye at y = -3268 — more
    // than three thousand units UNDER the trench floor, looking up at the underside of
    // the world.
    const deep = flyThen(0, -1, 300) // 5s of full down
    expect(deep.above, 'the eye is ABOVE the trench floor').toBeGreaterThan(0)
  })

  it('never climbs out through the top of the trench', () => {
    const high = flyThen(0, 1, 300) // 5s of full up
    expect(high.above, 'the eye is BELOW the trench top').toBeLessThan(TRENCH_WALL_H)
  })

  it('stays within the ROM\'s vertical band — 512..3840 above the floor', () => {
    // The band is the cabinet's, not ours: -0xE00..-0x100 inside a 0x1000-deep trench.
    // The lower bound is the machine's minimum ground clearance (GD$MNT = 0x200 = 512),
    // the same clearance the surface phase enforces.
    for (const aimY of [-1, -0.5, 0, 0.5, 1]) {
      const p = flyThen(0, aimY, 300)
      expect(p.above, `yoke ${aimY}: at/above the ROM floor clearance`)
        .toBeGreaterThanOrEqual(ROM_EYE_MIN)
      expect(p.above, `yoke ${aimY}: at/below the ROM ceiling`)
        .toBeLessThanOrEqual(ROM_EYE_MAX)
    }
  })

  it('settles "JUST ABOVE BOTTOM OF TRENCH" with the yoke neutral', () => {
    // WSMAIN.MAC SMVG1B drops the player into the trench until he is at or below
    // -0xE00+0x100, so a hands-off pilot rides low in the channel — 512..768 above the
    // floor — and must CLIMB to see over things. He does not start halfway up the wall.
    const p = pilot(trenchRun())
    expect(p.above).toBeGreaterThanOrEqual(ROM_EYE_MIN)
    expect(p.above, 'the pilot enters low, "just above bottom of trench"')
      .toBeLessThanOrEqual(ROM_EYE_SETTLED_MAX)
  })

  it('stays within the ROM\'s lateral clamp of ±0x1FF, and inside the walls', () => {
    for (const aimX of [-1, 1]) {
      const p = flyThen(aimX, 0, 300)
      expect(Math.abs(p.lateral), `yoke ${aimX}: within ±511`)
        .toBeLessThanOrEqual(ROM_EYE_HALF_W)
    }
  })
})
