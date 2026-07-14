// tests/shell/render.exhaust-port-orient.test.ts
//
// Story sw5-6 — RED phase (O'Brien / TEA): the exhaust port lies FLAT IN THE TRENCH FLOOR.
//
// ⚠ THIS FILE REPLACES sw5-4's SUITE OF THE SAME NAME, WHICH PINNED THE OPPOSITE CONTRACT.
//
// sw5-4 asserted the port "presents FACE-ON, not edge-on" and warned the next dev off the
// very fix this story lands:
//
//     // The hazard is a well-meaning "fix". A dev who notices the port no longer lies in
//     // the floor may reach for a rotationX(±π/2) to put it back — and that turns the
//     // plate EDGE-ON to a camera that skims just above the floor…
//     expect(sy, 'the plate has HEIGHT — it is not lying flat in the floor').toBeGreaterThan(1)
//
// The ROM refutes it. Three independent facts from the 1983 source:
//
//   1. The ROM's THIRD coordinate is HEIGHT, not depth. Its own macro says so —
//        .MACRO .PGND .A,.B,.C          ;OFFSET HITE TO MID OF PLAYERS HITE
//        .WORD .A'*.S,.B'*.S,.C'*.S-GD$MDT     <- the HEIGHT offset hits the THIRD component
//      and render.ts already knew it (TOWER_ORIENT: "The ROM's up-axis is Z (x is fore/aft,
//      y lateral); ours is Y").
//
//   2. Every one of `.WP PORT`'s twelve points has third component 0 — so the plate is flat
//      in the HEIGHT plane. It is HORIZONTAL.
//
//   3. WSBASE.MAC `BSVPORT` seats it on the floor, in as many words:
//        LDD #-1000
//        STD M.GD+4               ;Z HITE ON BOTTOM OF TRENCH
//        LDD #0
//        STD M.GD+2               ;Y WIDTH IN CENTER
//
// The port is a hole in the trench FLOOR — where the old octagon was. sw5-4 fed the ROM
// triples into our y-up world under TRENCH_ORIENT = IDENTITY, i.e. WITHOUT the axis remap
// TOWER_ORIENT exists to perform, which stood the plate on its edge. Half of it hangs below
// the floor because it is standing up, not because the trench is too short.
//
// == BUT sw5-4's WORRY WAS REAL ===============================================
//
// A floor plate IS an edge-on sliver — at OUR camera height. Measured through this very
// render path, at the port's spawn distance (z = -2400, 800×600):
//
//     eye  60 above floor (TRENCH_SKIM today)   w=124.1  h=  2.8   ratio 0.023   <- a LINE
//     eye 513 above floor (ROM minimum)         w=124.1  h= 24.0   ratio 0.193
//     eye 2048 above floor                      w=124.1  h= 95.7   ratio 0.771
//
// The cabinet can afford a floor plate because its pilot flies 512–3840 units above the
// floor of a 4096-deep trench (WSMAIN.MAC SMVG1B / sub_703B). Ours flew 60 above a 320-deep
// ditch, and sw5-4 compensated by standing the port upright — a third wrong constant
// cancelling two others. So this suite pins BOTH halves, and the readability half is
// exactly sw5-4's intent, preserved: the port must still reach the screen as an aimable
// target. It just gets there by being a floor plate under a pilot who is actually flying
// in the trench, which is what the machine did.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/shell/wireframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shell/wireframe')>()
  return { ...actual, drawWireframe: vi.fn() }
})

import { drawWireframe, project } from '../../src/shell/wireframe'
import { render } from '../../src/shell/render'
import { enterPhase } from '../../src/core/sim'
import { initialState, EXHAUST_PORT_DISTANCE, type GameState } from '../../src/core/state'
import { EXHAUST_PORT, type Model3D } from '../../src/core/models'
import { transform, type Mat4, type Vec3 } from '@arcade/shared/math3d'

const W = 800
const H = 600

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

const trenchScene = (z: number): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'trench',
  exhaustPort: { pos: [0, 0, z] },
  trenchObstacles: [],
  projectiles: [],
})

/** The frame the shell actually drew: the port's modelView, the trench's view, the proj. */
function frame(z: number) {
  vi.mocked(drawWireframe).mockClear()
  render(makeCtx(), trenchScene(z), W, H)
  const calls = vi.mocked(drawWireframe).mock.calls
  const portCall = calls.find((c) => (c[1] as Model3D)?.name === 'Exhaust Port')
  const chanCall = calls.find((c) => (c[1] as Model3D)?.name === 'Trench Channel')
  expect(portCall, 'render() draws the exhaust port during a trench run').toBeTruthy()
  expect(chanCall, 'render() draws the trench channel during a trench run').toBeTruthy()
  return {
    portModel: portCall![1] as Model3D,
    portMV: portCall![2] as Mat4,
    chanModel: chanCall![1] as Model3D,
    view: chanCall![2] as Mat4,
    proj: portCall![3] as Mat4,
  }
}

/** The port's twelve points in EYE space — the frame the pilot actually sees. */
const portEye = (f: ReturnType<typeof frame>): Vec3[] =>
  EXHAUST_PORT.vertices.map((v) => transform(f.portMV, v as Vec3))

const PORT_SPAWN_Z = -2400 // EXHAUST_PORT_DISTANCE

describe('sw5-6 — the exhaust port is a FLOOR plate, not a wall', () => {
  beforeEach(() => vi.mocked(drawWireframe).mockClear())

  it('the plate\'s normal points STRAIGHT UP — it is horizontal, not vertical', () => {
    // The headline. `.WP PORT` is flat in its own third coordinate, and that coordinate is
    // the ROM's HEIGHT axis — so the plate's normal is the model's +z, and a correct
    // orientation must carry it onto the world's VERTICAL. The trench camera is
    // IDENTITY-oriented, so world-vertical is eye-space y.
    //
    // Under sw5-4's IDENTITY the normal stays on eye-space −z (pointing down the trench at
    // the pilot) and this fails on the very first assertion.
    const f = frame(PORT_SPAWN_Z)
    const at = (v: Vec3) => transform(f.portMV, v)
    const o = at([0, 0, 0])
    // the linear part of the transform applied to the model's up-axis
    const n: Vec3 = [at([0, 0, 1])[0] - o[0], at([0, 0, 1])[1] - o[1], at([0, 0, 1])[2] - o[2]]

    const mag = Math.hypot(n[0], n[1], n[2])
    expect(mag, 'the orientation is a rotation — it does not squash the plate').toBeCloseTo(1, 6)
    expect(Math.abs(n[1]), 'the plate faces UP/DOWN (a floor), not down the trench')
      .toBeCloseTo(1, 6)
    expect(Math.abs(n[2]), 'it is NOT a wall standing across the trench').toBeCloseTo(0, 6)
  })

  it('all twelve points lie in ONE horizontal plane', () => {
    const pts = portEye(frame(PORT_SPAWN_Z))
    const ys = pts.map((p) => p[1])
    expect(Math.max(...ys) - Math.min(...ys), 'the plate has NO extent in height').toBeCloseTo(0, 6)
  })

  it('that plane IS the trench floor — the port is a hole in it', () => {
    // BSVPORT: "Z HITE ON BOTTOM OF TRENCH". Compare the port's plane against the trench
    // channel's own floor vertices, in the SAME frame — so this holds whatever height the
    // pilot happens to be flying at, and can never be satisfied by a coincidence of camera.
    const f = frame(PORT_SPAWN_Z)
    const portY = portEye(f).map((p) => p[1])

    const floorEyeY = f.chanModel.vertices
      .filter((v) => v[1] === 0) // the channel's floor rails/ribs, world y = 0
      .map((v) => transform(f.view, v as Vec3)[1])
    expect(floorEyeY.length, 'the channel has a floor').toBeGreaterThan(0)

    const floor = floorEyeY[0]
    for (const y of floorEyeY) expect(y, 'the floor is one plane').toBeCloseTo(floor, 6)
    for (const y of portY) expect(y, 'the port sits IN the floor plane').toBeCloseTo(floor, 6)
  })

  it('NO part of the port hangs below the trench floor — the reported defect', () => {
    // The bug as the player sees it. Today the plate spans world y = -256 … +256 while the
    // floor is y = 0, so its lower half is buried. A floor plate cannot have a lower half.
    const f = frame(PORT_SPAWN_Z)
    const floor = transform(f.view, [0, 0, 0] as Vec3)[1] // world y=0, in eye space
    for (const [, y] of portEye(f)) {
      expect(y, 'no vertex is below the floor').toBeGreaterThanOrEqual(floor - 1e-6)
    }
  })

  it('spans the trench LATERALLY and DOWNRANGE — 512 × 512 of floor', () => {
    // The ROM plate is 512 across in both of its horizontal axes. Laid flat, that is 512 of
    // trench WIDTH and 512 of trench LENGTH — a patch of floor, not a billboard.
    const pts = portEye(frame(PORT_SPAWN_Z))
    const spread = (i: 0 | 2) => {
      const vals = pts.map((p) => p[i])
      return Math.max(...vals) - Math.min(...vals)
    }
    expect(spread(0), 'lateral extent').toBeCloseTo(512, 6)
    expect(spread(2), 'downrange extent').toBeCloseTo(512, 6)
  })
})

describe('sw5-6 — and it is still an aimable target (sw5-4\'s intent, preserved)', () => {
  beforeEach(() => vi.mocked(drawWireframe).mockClear())

  /** The port's screen-space footprint, through the real projection. */
  function footprint(z: number) {
    const f = frame(z)
    const pts = portEye(f)
      .map((p) => project(p, f.proj, W, H))
      .filter((p): p is [number, number] => p !== null)
    expect(pts.length, 'the port is on screen at all').toBeGreaterThan(0)
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    return { w, h, ratio: Math.min(w, h) / Math.max(w, h) }
  }

  it('does not collapse into a sliver at the port\'s spawn distance', () => {
    // The numbers are measured, not invented (see the header). At TRENCH_SKIM = 60 the
    // plate is 2.8px tall — a LINE, ratio 0.023. With the pilot flying the ROM's band it
    // is 24px+ and climbing. The thresholds sit in the gap between those two worlds, so
    // this fails loudly if the port is laid flat WITHOUT fixing where the pilot flies.
    const { h, ratio } = footprint(PORT_SPAWN_Z)
    expect(h, 'the target has real height on screen').toBeGreaterThan(8)
    expect(ratio, 'not a 44:1 sliver').toBeGreaterThan(0.1)
  })

  it('opens up as the pilot closes on it', () => {
    const far = footprint(PORT_SPAWN_Z)
    const near = footprint(-600)
    expect(near.h, 'the target grows as it approaches').toBeGreaterThan(far.h)
    expect(near.ratio, 'and reads more squarely head-on').toBeGreaterThan(far.ratio)
  })

  it('the three concentric squares stay concentric and distinct on screen', () => {
    // Kept from sw5-4 (its one assertion that survives the re-port): the thing that makes
    // the port read as a TARGET rather than a smudge is three nested rings sharing a
    // centre. Ring membership comes from the MODEL (96/160/256), so it is independent of
    // whatever the camera did.
    const f = frame(-600)
    const pts = portEye(f)
      .map((p) => project(p, f.proj, W, H))
      .filter((p): p is [number, number] => p !== null)
    expect(pts, 'all twelve corners are on screen').toHaveLength(12)

    const ringOf = (i: number) => Math.abs(EXHAUST_PORT.vertices[i][0])
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length
    const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length
    const meanRadius = (mag: number) => {
      const r = pts
        .filter((_, i) => ringOf(i) === mag)
        .map((p) => Math.hypot(p[0] - cx, p[1] - cy))
      expect(r, `ring ±${mag} has four corners`).toHaveLength(4)
      return r.reduce((a, b) => a + b, 0) / r.length
    }

    const [inner, middle, outer] = [meanRadius(96), meanRadius(160), meanRadius(256)]
    expect(inner, 'porthole inside berm').toBeLessThan(middle)
    expect(middle, 'berm inside base').toBeLessThan(outer)
    expect(inner, 'the porthole is a real, aimable target — not a dot').toBeGreaterThan(0)
  })
})

describe('sw5-6 AC-3 — the port does NOT move', () => {
  it('the REAL spawnPort seats it dead centre, on the floor, at EXHAUST_PORT_DISTANCE', () => {
    // ⚠ THIS TEST WAS VACUOUS IN ROUND 1 and the Thought Police was right to say so. It asserted
    // `trenchScene(z).exhaustPort.pos` — a literal the FIXTURE ITSELF writes three lines up. It
    // was checking my own hand-written `[0, 0, z]` against `[0, 0, …]`. It could not fail. It
    // would have passed if the production spawner returned [999, 999, 0].
    //
    // The real spawner is what AC-3 is about, so drive the real spawner: `enterPhase(…, 'trench')`
    // calls `spawnPort()` (sim.ts), and THAT is the value that must land on the floor centreline.
    const s = enterPhase(initialState(1983), 'trench')
    expect(s.exhaustPort, 'entering the trench spawns the port').not.toBeNull()

    expect(s.exhaustPort!.pos[0], 'BSVPORT: "Y WIDTH IN CENTER"').toBe(0)
    expect(s.exhaustPort!.pos[1], 'BSVPORT: "Z HITE ON BOTTOM OF TRENCH" — our floor is y=0').toBe(0)
    expect(s.exhaustPort!.pos[2], 'seated at EXHAUST_PORT_DISTANCE downrange').toBe(-EXHAUST_PORT_DISTANCE)

    // And the point of AC-3: the ROM never asked for the port to be RAISED, so it did not move.
    // What moved is the PILOT (60 → the ROM's 512..3840 band) — pinned in render.trench-eye.test.ts.
  })
})
