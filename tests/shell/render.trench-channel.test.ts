// tests/shell/render.trench-channel.test.ts
//
// Story 11-6 — render the trench phase as the procedural WALLED CHANNEL, not the
// flat TRENCH tile. RED phase: EXPECTED TO FAIL until GREEN swaps the draw in
// src/shell/render.ts (today render.ts:~226 strokes the flat TRENCH model in the
// trench phase).
//
// This pins the SWAP MECHANISM (AC2) and the scroll WIRING (AC3) — which model
// the trench phase draws and that it is fed the live accumulator — not the pixels.
// Whether it reads as "a long walled corridor receding to a vanishing point"
// (AC4) is an EYEBALL check via the 11-4 phase-jump in dev (:5274), the repo's
// standing render convention (see render.ts SURFACE_ORIENT note). The defect that
// shipped a flat sliver through Wave 3 was an UNVERIFIED render — this guard makes
// the swap itself testable.
//
// We mock drawWireframe and inspect which Model3D each call draws. The rest of the
// wireframe module (project/GLOW_FOR/NEAR/FAR, used by render) stays real via
// importOriginal, so render runs normally and only the draw target is observed —
// the established shell-test idiom (render.surface-grid.test.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/shell/wireframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shell/wireframe')>()
  return { ...actual, drawWireframe: vi.fn() }
})

import { drawWireframe } from '../../src/shell/wireframe'
import { render } from '../../src/shell/render'
import { initialState, EXHAUST_PORT_DISTANCE, type GameState } from '../../src/core/state'
import { TRENCH, EXHAUST_PORT, type Model3D } from '../../src/core/models'

const W = 800
const H = 600

/** Minimal node-side canvas-context stub — render() only needs these to no-op.
 *  Mirrors the established shell-test idiom (render.surface-grid.test.ts). The
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

const trenchScene: GameState = {
  ...initialState(1983),
  mode: 'playing',
  phase: 'trench',
  exhaustPort: { pos: [0, 0, -EXHAUST_PORT_DISTANCE] },
  // Seeded explicitly so render's trenchChannel(state.trenchScrollZ) has a value
  // even before initialState() carries the field (RED).
  trenchScrollZ: 0,
}

/** The walled-channel model among a render's draw calls: a model that rises off
 *  the y=0 floor (a wall) — the flat tile and the flat octagonal port do not. */
function drawnChannel(): Model3D | undefined {
  return vi
    .mocked(drawWireframe)
    .mock.calls.map((c) => c[1])
    .find((m) => m.vertices.length > 0 && m.vertices.some((v) => v[1] > 0))
}

describe('Story 11-6 — the trench phase renders the walled channel, not the flat tile', () => {
  beforeEach(() => {
    vi.mocked(drawWireframe).mockClear()
  })

  it('does NOT draw the flat TRENCH tile in the trench phase', () => {
    render(makeCtx(), trenchScene, W, H)
    const names = vi.mocked(drawWireframe).mock.calls.map((c) => c[1].name)
    expect(names.length).toBeGreaterThan(0) // the scene actually drew something
    expect(names).not.toContain(TRENCH.name)
  })

  it('draws a WALLED channel (rises off the y=0 floor) with more edges than the flat tile', () => {
    render(makeCtx(), trenchScene, W, H)
    const channel = vi
      .mocked(drawWireframe)
      .mock.calls.map((c) => c[1])
      .find(
        (m) =>
          m.vertices.length > 0 &&
          m.vertices.some((v) => v[1] > 0) && // a side wall rises off the floor
          m.edges.length > TRENCH.edges.length, // a channel, not the flat tile
      )
    expect(channel).toBeDefined()
  })

  it('still seats the exhaust port (the run’s target rides inside the channel)', () => {
    render(makeCtx(), trenchScene, W, H)
    const names = vi.mocked(drawWireframe).mock.calls.map((c) => c[1].name)
    expect(names).toContain(EXHAUST_PORT.name)
  })

  it('scrolls the channel by trenchScrollZ (feeds the live accumulator, not a hardcoded 0)', () => {
    // Two scenes differing ONLY in trenchScrollZ must draw DIFFERENT channel
    // geometry. Three sub-period offsets guard against a single unlucky multiple
    // of the (unknown-here) rib period recycling back to the base geometry.
    const channelFor = (scroll: number): Model3D | undefined => {
      vi.mocked(drawWireframe).mockClear()
      render(makeCtx(), { ...trenchScene, trenchScrollZ: scroll }, W, H)
      return drawnChannel()
    }
    const base = channelFor(0)
    expect(base).toBeDefined()
    const moved = [80, 137.5, 250].map((s) => channelFor(s))
    expect(moved.some((m) => JSON.stringify(m) !== JSON.stringify(base))).toBe(true)
  })
})
