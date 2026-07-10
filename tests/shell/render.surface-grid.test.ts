// tests/shell/render.surface-grid.test.ts
//
// Story 11-5 — render the surface phase as the procedural ground GRID, not the
// DEATH_STAR_SURFACE spike. RED phase: EXPECTED TO FAIL until GREEN swaps the
// draw in src/shell/render.ts (today render.ts:~184 strokes DEATH_STAR_SURFACE
// in the surface phase).
//
// This pins the SWAP MECHANISM (AC2/AC5) — which model the surface phase draws —
// not the pixels. Exact grid width/spacing reads as "a wide receding ground with
// a horizon" only by EYEBALL via the 11-4 phase-jump (AC4, the repo's standing
// render convention; see render.ts SURFACE_ORIENT note). The gap that let the
// triangle ship through 11-1/11-2 was an UNVERIFIED render — this guard makes the
// swap itself testable.
//
// We mock drawWireframe and inspect which Model3D each call draws. The rest of
// the wireframe module (project/GLOW_FOR/NEAR/FAR, used by render) stays real via
// importOriginal, so render runs normally and only the draw target is observed.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/shell/wireframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shell/wireframe')>()
  return { ...actual, drawWireframe: vi.fn() }
})

import { drawWireframe } from '../../src/shell/wireframe'
import { render } from '../../src/shell/render'
import { initialState, type GameState } from '../../src/core/state'
import { DEATH_STAR_SURFACE } from '../../src/core/models'

const W = 800
const H = 600

/** Minimal node-side canvas-context stub — render() only needs these to no-op.
 *  Mirrors the established shell-test idiom (render.player-laser.test.ts). The
 *  `as unknown as CanvasRenderingContext2D` is that idiom's deliberate stub. */
function makeCtx(): CanvasRenderingContext2D {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 0,
    font: '700 18px monospace',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    globalCompositeOperation: '',
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    save() {},
    restore() {},
    fillText() {},
    arc() {},
  }
  return ctx as unknown as CanvasRenderingContext2D
}

const surfaceScene: GameState = {
  ...initialState(1983),
  mode: 'playing',
  phase: 'surface',
  turrets: [{ pos: [0, 0, -800] }],
}

describe('Story 11-5 — the surface phase renders the ground grid, not the spike', () => {
  beforeEach(() => {
    vi.mocked(drawWireframe).mockClear()
  })

  it('does NOT draw DEATH_STAR_SURFACE in the surface phase', () => {
    render(makeCtx(), surfaceScene, W, H)
    const names = vi.mocked(drawWireframe).mock.calls.map((c) => c[1].name)
    expect(names.length).toBeGreaterThan(0) // the scene actually drew something
    expect(names).not.toContain(DEATH_STAR_SURFACE.name)
  })

  it('draws a wide, flat (y=0) ground grid with more lines than the spike has edges', () => {
    render(makeCtx(), surfaceScene, W, H)
    const models = vi.mocked(drawWireframe).mock.calls.map((c) => c[1])
    const grid = models.find(
      (m) =>
        m.vertices.length > 0 &&
        m.vertices.every((v) => v[1] === 0) && // a floor, flat on y=0
        m.edges.length > DEATH_STAR_SURFACE.edges.length, // a grid, not a lone tile/spike
    )
    expect(grid).toBeDefined()
  })
})
