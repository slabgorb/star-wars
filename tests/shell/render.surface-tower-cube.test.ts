// tests/shell/render.surface-tower-cube.test.ts
//
// Story sw2-3 — surface towers wear a YELLOW CUBE TOP (RED phase).
//
// Live-playtest defect: the surface phase strokes each tower entirely in
// surface-turret red (`GLOW_FOR['Surface Tower']` = #ff3b30), so it reads as a
// monochrome grounded turret. Authentic surface towers are tipped with a bright
// yellow cube — the gun the fireball launches from. This pins the render
// MECHANISM (that a distinct yellow element is drawn on the tower), following the
// sibling swap-mechanism idiom in render.surface-grid.test.ts and the fidelity
// convention stated in render.enemy-fireball.test.ts: the exact hue/geometry stay
// an EYEBALL concern in the dev server; we assert only that the tower is no longer
// drawn all-red — a yellow-cube element joins it.
//
// We mock drawWireframe and inspect the glow colour each call passes. The rest of
// the wireframe module stays real via importOriginal, so render() runs normally
// and only the draw colours are observed.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/shell/wireframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shell/wireframe')>()
  return { ...actual, drawWireframe: vi.fn() }
})

import { drawWireframe } from '../../src/shell/wireframe'
import { render } from '../../src/shell/render'
import { initialState, type GameState } from '../../src/core/state'

const W = 800
const H = 600

/** Minimal node-side canvas-context stub — render() only needs these to no-op.
 *  Mirrors the established shell-test idiom (render.surface-grid.test.ts). */
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

/** A surface scene with one tower and NO fireballs (so the only candidate for a
 *  yellow stroke is the tower cube — not the amber fireball glow). */
const surfaceScene: GameState = {
  ...initialState(1983),
  mode: 'playing',
  phase: 'surface',
  turrets: [{ pos: [0, 0, -800] }],
  enemyShots: [],
}

/** High red + high green + low blue == a yellow/amber cube top. Rejects the
 *  surface-turret red (#ff3b30, green too low) and the steel-grey grid
 *  (#5a6b8c, blue too high). */
function isYellow(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return false
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return r >= 180 && g >= 150 && b <= 120
}

describe('Story sw2-3 — the surface tower wears a yellow cube top', () => {
  beforeEach(() => {
    vi.mocked(drawWireframe).mockClear()
  })

  it('draws a distinct YELLOW element on the tower (not an all-red turret)', () => {
    render(makeCtx(), surfaceScene, W, H)
    const glows = vi.mocked(drawWireframe).mock.calls.map((c) => c[6])
    expect(glows.length).toBeGreaterThan(0) // the scene actually drew something
    expect(glows.some(isYellow)).toBe(true) // …and at least one stroke is the yellow cube
  })

  it('still draws a tall tower structure (a model reaching above the y=0 floor)', () => {
    render(makeCtx(), surfaceScene, W, H)
    const models = vi.mocked(drawWireframe).mock.calls.map((c) => c[1])
    const tall = models.find((m) => m.vertices.some((v) => v[1] > 0))
    expect(tall).toBeDefined()
  })
})
