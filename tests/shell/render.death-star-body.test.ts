// tests/shell/render.death-star-body.test.ts
//
// Story 11-7 — Death Star body draw order + phase gating. RED phase (O'Brien / TEA).
//
// AC2/AC3 MECHANISM (the half that lives in the shell): render() must, in the
// SPACE phase only, draw the Death Star body BEHIND the TIEs (painter's order —
// stroked first), so the body can never sit on top of a fighter and never enters
// a TIE hit-test. It must NOT be drawn in the surface or trench phases.
//
// We assert the mechanism, not the picture: spy on `drawWireframe` and inspect
// WHICH models are stroked and in WHAT order. Exact seat/scale/orientation are
// eyeball-verified in the dev server (repo convention — render.ts SURFACE_ORIENT
// note), so they are out of scope here.
//
// RED today: the space branch of render() (`else { for (e of enemies) draw TIE }`)
// draws no body at all, so the "body before TIEs" assertions fail. The
// surface/trench "no body" assertions are REGRESSION GUARDS — green today, they
// keep GREEN from drawing the body in the wrong phase.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Replace the wireframe module so drawWireframe becomes a recording spy. The
// other exports render.ts reads at module-eval time (GLOW_FOR) and during a draw
// (project, NEAR, FAR) are stubbed with harmless stand-ins.
vi.mock('../../src/shell/wireframe', () => ({
  drawWireframe: vi.fn(),
  project: () => [0, 0] as [number, number],
  GLOW_FOR: {
    'TIE Fighter': '#30d158',
    'Darth Vader TIE': '#30d158',
    'Death Star Surface': '#5a6b8c',
    'Death Star': '#8a93a8', // body hull — must match the real wireframe.ts shape
    'Surface Tower': '#ff3b30',
    Trench: '#5a6b8c',
    'Exhaust Port': '#ff9f0a',
  } as Record<string, string>,
  DEFAULT_GLOW: '#00e5ff',
  NEAR: 1,
  FAR: 9000,
}))

import { drawWireframe } from '../../src/shell/wireframe'
import { render } from '../../src/shell/render'
import { initialState, type GameState, type Enemy } from '../../src/core/state'
import { IDENTITY } from '../../src/core/math3d'

const W = 800
const H = 600

/** Minimal canvas-context stub recording nothing of interest — render() only needs
 *  the methods to exist (mirrors tests/shell/render.tie-orient.test.ts). */
function makeCtx(): CanvasRenderingContext2D {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    globalCompositeOperation: '',
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    save() {},
    restore() {},
    fillText() {},
    arc() {},
  }
  // safe: minimal canvas stub for node — render() only calls the methods stubbed above.
  return ctx as unknown as CanvasRenderingContext2D
}

/** Names of the models stroked this render, in draw order. */
function drawnModelNames(): string[] {
  // vi.mocked gives a typed view of the spy — no `as unknown as` cast needed.
  return vi.mocked(drawWireframe).mock.calls.map((c) => {
    const m = c[1] as { name?: unknown }
    return typeof m?.name === 'string' ? m.name : ''
  })
}

const isBody = (name: string) => /death\s*star/i.test(name) && !/surface/i.test(name)
const isTie = (name: string) => /tie\s*fighter/i.test(name)

// A real `orient` (IDENTITY) is required — render.ts composes it into the TIE's
// model matrix (`multiply(e.orient, TIE_ORIENT)`), so an undefined orient would
// crash the existing TIE draw and mask the body assertion we are actually testing.
const tie = (): Enemy => ({ pos: [120, 0, -1200], vel: [0, 0, 0], kind: 'tie', orient: IDENTITY })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('11-7 — render draws the Death Star body behind the TIEs, space phase only', () => {
  it('draws the body in the space phase', () => {
    // RED: the space branch strokes TIEs only — no body model is ever drawn.
    render(makeCtx(), { ...initialState(1983), phase: 'space', enemies: [tie()] }, W, H)
    expect(drawnModelNames().some(isBody)).toBe(true)
  })

  it('draws the body BEFORE (behind) every TIE — painter-order isolation from hit-tests', () => {
    render(makeCtx(), { ...initialState(1983), phase: 'space', enemies: [tie(), tie()] }, W, H)
    const names = drawnModelNames()
    const bodyIdx = names.findIndex(isBody)
    const firstTieIdx = names.findIndex(isTie)
    expect(bodyIdx).toBeGreaterThanOrEqual(0) // body is drawn
    expect(firstTieIdx).toBeGreaterThanOrEqual(0) // TIEs are drawn
    expect(bodyIdx).toBeLessThan(firstTieIdx) // body is stroked first → behind
  })

  it('draws the body even when no TIEs are on screen (it is part of the space scene)', () => {
    render(makeCtx(), { ...initialState(1983), phase: 'space', enemies: [] }, W, H)
    expect(drawnModelNames().some(isBody)).toBe(true)
  })

  it('does NOT draw the body in the surface phase (regression guard)', () => {
    const s: GameState = { ...initialState(1983), phase: 'surface', turrets: [{ pos: [0, 0, -1200] }] }
    render(makeCtx(), s, W, H)
    expect(drawnModelNames().some(isBody)).toBe(false)
  })

  it('does NOT draw the body in the trench phase (regression guard)', () => {
    const s: GameState = { ...initialState(1983), phase: 'trench', exhaustPort: { pos: [0, 0, -2400] } }
    render(makeCtx(), s, W, H)
    expect(drawnModelNames().some(isBody)).toBe(false)
  })
})
