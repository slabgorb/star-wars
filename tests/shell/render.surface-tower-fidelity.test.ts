// tests/shell/render.surface-tower-fidelity.test.ts
//
// Story sw3-11 — RED phase (O'Brien / TEA): the cabinet's surface palette.
//
// GROUND TRUTH (WSGRND.MAC GDVIEW, historicalsource/star-wars @ 5355b76):
//
//   LDD #VGCYLW*100+VGCOPC  ;THEN ASSUME VISIBLE NORMALLY   <- tower BASE color
//   LDD #VGCWHT*100+VGCOPC  ;SO DRAW IT SPECIAL WHITE       <- the tower's HAT
//   LDD #VGCRED*100+VGCOPC-20                               <- lone undamaged BUNKER
//
// The tower column is YELLOW, its cap is WHITE, and ground bunkers are RED.
// Today render.ts inverts this: the body strokes GLOW_FOR['Surface Tower']
// (#ff3b30 red — the story's "red ship-hull" read) and the cube top strokes
// yellow. There is no bunker draw at all.
//
// Mechanism pins only, per the sw2-3 idiom (render.surface-tower-cube.test.ts):
// drawWireframe is mocked and the (model, glow) pairs inspected. Exact hue and
// world scale stay an eyeball concern in the dev server.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/shell/wireframe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shell/wireframe')>()
  return { ...actual, drawWireframe: vi.fn() }
})

import { drawWireframe } from '../../src/shell/wireframe'
import { render } from '../../src/shell/render'
import { initialState, type GameState, type Turret } from '../../src/core/state'
import type { Model3D } from '../../src/core/models'
import type { Vec3 } from '@arcade/shared/math3d'

const W = 800
const H = 600

/** Minimal node-side canvas-context stub (render.surface-tower-cube.test.ts). */
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

const site: Vec3 = [0, 0, -800]

/** A surface scene holding exactly one ground object, no fireballs (so tower /
 *  cap / bunker strokes are the only color candidates besides the steel grid). */
const sceneWith = (turret: Turret): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'surface',
  turrets: [turret],
  enemyShots: [],
})

const towerScene = () => sceneWith({ pos: site })
const bunkerScene = () => sceneWith({ pos: site, kind: 'bunker' } as Turret)

// --- color classifiers (hex → rgb; thresholds reject each other's hues) --------

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

/** VGCYLW: strong red + green, weak blue. Rejects red #ff3b30, white, steel. */
function isYellow(hex: string): boolean {
  const c = rgb(hex)
  return !!c && c[0] >= 180 && c[1] >= 150 && c[2] <= 120
}

/** VGCWHT: all channels bright and near-equal. Rejects yellow (blue too low). */
function isWhite(hex: string): boolean {
  const c = rgb(hex)
  if (!c) return false
  const [r, g, b] = c
  return r >= 200 && g >= 200 && b >= 200 && Math.max(r, g, b) - Math.min(r, g, b) <= 55
}

/** VGCRED: red-dominant (render.enemy-fireball.test.ts convention). */
function isRed(hex: string): boolean {
  const c = rgb(hex)
  return !!c && c[0] >= 180 && c[1] <= 110 && c[2] <= 110
}

type DrawCall = { model: Model3D; glow: string }
const drawCalls = (): DrawCall[] =>
  vi.mocked(drawWireframe).mock.calls.map((c) => ({ model: c[1] as Model3D, glow: c[6] as string }))

describe('sw3-11 — surface palette matches GDVIEW (yellow column, white cap, red bunker)', () => {
  beforeEach(() => {
    vi.mocked(drawWireframe).mockClear()
  })

  it('strokes the tower COLUMN yellow (VGCYLW), not the red ship-hull', () => {
    render(makeCtx(), towerScene(), W, H)
    const towerCalls = drawCalls().filter((c) => /surface\s*tower/i.test(c.model.name))
    expect(towerCalls.length).toBeGreaterThan(0) // the tower drew at all
    for (const c of towerCalls) expect(isYellow(c.glow)).toBe(true)
  })

  it('strokes a WHITE element on the tower — the cap (VGCWHT, "DRAW IT SPECIAL WHITE")', () => {
    render(makeCtx(), towerScene(), W, H)
    const glows = drawCalls().map((c) => c.glow)
    expect(glows.length).toBeGreaterThan(0)
    expect(glows.some(isWhite)).toBe(true)
  })

  it('draws a bunker-kind ground object with a BUNKER model stroked red (VGCRED)', () => {
    render(makeCtx(), bunkerScene(), W, H)
    const bunkerCalls = drawCalls().filter((c) => /bunker/i.test(c.model.name))
    expect(bunkerCalls.length).toBeGreaterThan(0) // a bunker model is drawn for it
    for (const c of bunkerCalls) expect(isRed(c.glow)).toBe(true)
  })

  it('a bunker site does not wear the tower cap (no white stroke on a shorty)', () => {
    render(makeCtx(), bunkerScene(), W, H)
    const calls = drawCalls()
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.some((c) => isWhite(c.glow))).toBe(false)
  })
})

describe('sw3-11 — color classifier self-checks (guard the guard)', () => {
  it('the three classifiers reject each other\'s cabinet hues', () => {
    const yellow = '#ffd60a'
    const white = '#ffffff'
    const red = '#ff3b30'
    const steel = '#5a6b8c'
    expect(isYellow(yellow)).toBe(true)
    expect(isYellow(white)).toBe(false)
    expect(isYellow(red)).toBe(false)
    expect(isYellow(steel)).toBe(false)
    expect(isWhite(white)).toBe(true)
    expect(isWhite(yellow)).toBe(false)
    expect(isWhite(red)).toBe(false)
    expect(isWhite(steel)).toBe(false)
    expect(isRed(red)).toBe(true)
    expect(isRed(yellow)).toBe(false)
    expect(isRed(white)).toBe(false)
    expect(isRed(steel)).toBe(false)
  })
})
