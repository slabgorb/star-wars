// tests/shell/render.moving-eye.test.ts
//
// sw8-1 RED — "The moving eye": the space viewpoint must MOVE, so the Death Star
// can leave frame instead of being pinned dead-centre and merely scaling up.
//
// GROUND TRUTH (1983 "Warp Speed" source, quoted verbatim in src/core/starfield.ts:6-13):
//   * `VWSTAR` loads the viewer-translation vector ST.UX/UY/UZ into the Math Box every
//     frame (WSSTAR.MAC:96-103) — the whole world slides past the eye.
//   * in flight ST.UX is driven STRAIGHT off the frame counter
//     (`LDD FRAME / JSR LSLD7 / STD ST.UX`, WSMAIN.MAC:2525-2528).
// The cabinet therefore flies a MOVING eye; our space camera is a fixed identity
// matrix (render.ts:346 `return IDENTITY // space: the camera sits at the origin`),
// which CANNOT put the Death Star out of frame (the design's evidence anchor: longplay
// ~wave 4, score 352,171, the DS entirely off-screen).
//
// SEAM-AGNOSTIC ON PURPOSE. AC1 ("settle translation vs rotation from the disasm") and
// the design's open question #4 ("does the moving eye belong in core or shell?") are
// ruled by Dev in GREEN — so these tests must NOT pin the ST.UX = FRAME<<7 SLOPE, nor
// whether the eye lives in `core` state or is derived in `cameraView`. They drive the
// REAL sim (`stepGame` from `initialState()`, which starts in mode:'playing' /
// phase:'space' / frame:0) and assert only the cabinet-OBSERVABLE outcome: the space
// camera stops being frame-invariant, and the Death Star departs screen centre. Any
// correct port — translation or rotation, core-eye or shell-derived — turns these
// green; the magnitude of the drift is Dev's tuning to rule, not this suite's to fix.
import { describe, it, expect } from 'vitest'
import { cameraView, deathStarPlacement } from '../../src/shell/render'
import { initialState, type GameState } from '../../src/core/state'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { transform, type Mat4 } from '@arcade/shared/math3d'

// A render-cadence step (1/60 s) sits below the ≈20.5 Hz game-frame tick, so no game
// frame is ever skipped and the accumulator never clamps (sim.ts MAX_CATCHUP_FRAMES).
const DT = 1 / 60

/** Step the real sim `steps` render frames on neutral input. With NO_INPUT the player
 *  never kills a TIE, so `phaseKills` stays 0 and the run stays in the space phase the
 *  whole time — only `frame` and the world (starfield, any moving eye) advance. */
function advance(s0: GameState, steps: number): GameState {
  let s = s0
  for (let i = 0; i < steps; i++) s = stepGame(s, NO_INPUT, DT)
  return s
}

/** The Death Star's lateral position in the camera's view space: project its world
 *  seat through the current camera. With the fixed identity camera (DS seated at
 *  x=0), this is exactly 0 every frame — the DS is welded to the optical axis. */
function deathStarViewX(state: GameState): number {
  return transform(cameraView(state), deathStarPlacement(state).pos)[0]
}

/** Largest absolute element-wise difference between two 4×4 matrices. */
function matMaxDelta(a: Mat4, b: Mat4): number {
  let d = 0
  for (let i = 0; i < 16; i++) d = Math.max(d, Math.abs(a[i] - b[i]))
  return d
}

describe('sw8-1 — the space camera is a MOVING eye', () => {
  it('AC2: the space view matrix changes as the frame counter advances', () => {
    // A dozen seconds of flight ≈ 246 game frames — plenty for any real viewer drift
    // to register, while pinning nothing about its rate.
    const start = initialState(1983)
    const later = advance(start, 720)

    // The camera must no longer be frame-invariant. Today both are IDENTITY → delta 0.
    expect(matMaxDelta(cameraView(start), cameraView(later))).toBeGreaterThan(1e-6)
  })

  it('AC3: the Death Star leaves screen centre over the space run', () => {
    // Anchor: at frame 0 the eye has not drifted, so the DS is dead-centre.
    const start = initialState(1983)
    expect(Math.abs(deathStarViewX(start))).toBeLessThan(1e-6)

    // Sample the DS lateral offset across the run. Today it is pinned at 0 forever
    // (identity camera, DS seated at x=0) → spread 0. A moving eye slides the DS off
    // the optical axis, so the spread grows well past render noise. The 25-world-unit
    // floor is a "the DS actually moved" tripwire, NOT the ST.UX slope — Dev tunes the
    // magnitude so the DS reads off-frame like the longplay (manual QA owns the pixels).
    let s = start
    let min = Infinity
    let max = -Infinity
    for (let c = 0; c < 12; c++) {
      s = advance(s, 60) // ~one second of frames per checkpoint
      const x = deathStarViewX(s)
      min = Math.min(min, x)
      max = Math.max(max, x)
    }
    expect(max - min).toBeGreaterThan(25)
  })

  it('AC5: the camera path is deterministic AND non-constant (same seed → same moving path)', () => {
    // Two independent runs from the same seed must trace the SAME camera path (the
    // moving eye stays pure, seeded-deterministic — CLAUDE.md core rule). Collect the
    // view matrix at one-second checkpoints from each run.
    const pathOf = (seed: number): Mat4[] => {
      let s = initialState(seed)
      const path: Mat4[] = []
      for (let c = 0; c < 8; c++) {
        s = advance(s, 60)
        path.push(cameraView(s))
      }
      return path
    }
    const a = pathOf(1983)
    const b = pathOf(1983)

    // Determinism: identical seed → identical path (holds today and after).
    for (let c = 0; c < a.length; c++) expect(matMaxDelta(a[c], b[c])).toBeLessThan(1e-9)

    // ...and the path actually MOVES — some checkpoint differs from the first. Today
    // every checkpoint is IDENTITY → this is the red bite. A frozen "deterministic"
    // camera is not a moving eye.
    const moved = a.some((m) => matMaxDelta(m, a[0]) > 1e-6)
    expect(moved).toBe(true)
  })

  it('AC7 scope guard: the surface camera stays frame-invariant (the moving eye is space-only)', () => {
    // The story scopes the change to the space branch. The surface camera reads the
    // ship altitude, not the frame counter, so two surface states differing only in
    // `frame` must yield the SAME view. A fix that keys ALL phases off a drifting eye
    // would bleed the space slide into the surface run and trip this guard.
    const base = initialState(1983)
    const surfEarly: GameState = { ...base, phase: 'surface', frame: 0 }
    const surfLate: GameState = { ...base, phase: 'surface', frame: 4096 }
    expect(matMaxDelta(cameraView(surfEarly), cameraView(surfLate))).toBeLessThan(1e-9)
  })
})
