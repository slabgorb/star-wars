// tests/shell/render.bonus-row.test.ts
//
// Story sw3-6 — RED phase, shell half. The 1983 cabinet draws a flashing
// yellow/amber bonus/extra-life counter (`byte_4B2C`) directly UNDER the score
// value (`sub_761D` "Display score": score panel, then the flashing counter
// beneath it). A real cabinet screenshot (task-5 report) confirms the row's
// colour (yellow/amber) and position (a third HUD row below the green score
// value) — e.g. "60,681" over a flashing "33". docs ## HUD & framing / Open
// follow-ups #7 call it out as an un-ported gap.
//
// Today drawHudHeader (src/shell/render.ts) draws only SCORE label (red) over
// value (green) and WAVE — NO third row. These guards fail until GREEN adds the
// amber row, gated on the core `state.bonusFlash` (the byte_4B2C flash the core
// suite pins). Pre-GREEN, `bonusFlash` is an unknown property → the row is never
// drawn → no amber strokes → RED.
//
// We assert COLOUR-FAMILY + POSITION (an amber row beneath the green score
// value), not an exact hex or glyph content — matching the repo convention that
// exact glow/blur and glyph layout are an eyeball concern (render.ts
// SURFACE_ORIENT note; sw3-9 "colour-family + topology, not pixels"). The mock
// idiom mirrors render.player-laser.test.ts / render.tie-orient.test.ts.

import { describe, it, expect } from 'vitest'
import { render } from '../../src/shell/render'
import { initialState, type GameState } from '../../src/core/state'

interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

/** Minimal canvas-context stub recording every stroked segment with its colour,
 *  so we can assert what render() draws without a DOM canvas (vitest runs in
 *  node). Same stub the sibling shell tests use; the cast is the established
 *  mock idiom, not a type escape. */
function makeCtx() {
  const segments: Seg[] = []
  let pen: [number, number] = [0, 0]
  let curColor = ''
  const ctx = {
    fillStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 0,
    font: '700 18px monospace',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    globalCompositeOperation: '',
    globalAlpha: 1,
    set strokeStyle(v: string) {
      curColor = v
    },
    get strokeStyle() {
      return curColor
    },
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo(x: number, y: number) {
      pen = [x, y]
    },
    lineTo(x: number, y: number) {
      segments.push({ x1: pen[0], y1: pen[1], x2: x, y2: y, color: curColor })
    },
    stroke() {},
    save() {},
    restore() {},
    fillText() {},
    arc() {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segments }
}

const W = 800
const H = 600

// The SCORE value baseline (render.ts HUD_ROW2_Y = 58). The bonus row must sit
// BENEATH it, so its strokes reach below this line.
const SCORE_VALUE_Y = 58

/** Yellow/amber ink: high red, high green, low blue. Excludes the HUD's red
 *  label (#ff2222, g≈34), its green value/shield (#22e600, r≈34), the cyan
 *  laser, and the death-star boom's #ffdd66 (b=102) — none of which is the
 *  bonus row. A GREEN implementation picking any amber (#ffcc00, #ffd400,
 *  #ffbf00, …) satisfies this without pinning one hex. */
function isAmber(hex: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return false
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return r > 200 && g > 140 && b < 100
}

/** A playing space scene with no world entities, so the only strokes are the
 *  HUD (and the crosshair) — the bonus row under test is unambiguous. */
const scene = (over: Partial<GameState>): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  enemies: [],
  enemyShots: [],
  projectiles: [],
  ...over,
})

const amberSegs = (segs: readonly Seg[]) => segs.filter((s) => isAmber(s.color))
const leftColumn = (s: Seg) => s.x1 < W * 0.45 && s.x2 < W * 0.45

describe('sw3-6 — flashing amber bonus/extra-life HUD row under the score', () => {
  it('draws an amber row beneath the score value when the flash is active', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ score: 60_681, bonusFlash: 0.9 }), W, H)

    const amber = amberSegs(segments)
    expect(amber.length).toBeGreaterThan(0) // the row exists at all
    // It sits BELOW the green score value (a third HUD row), not recoloured onto
    // the score line, and in the score's left column.
    expect(Math.max(...amber.flatMap((s) => [s.y1, s.y2]))).toBeGreaterThan(SCORE_VALUE_Y)
    expect(amber.every(leftColumn)).toBe(true)
  })

  it('draws NO amber row once the flash has decayed to zero (row absent)', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ score: 60_681, bonusFlash: 0 }), W, H)

    // Isolate to the bonus-row region (left column, beneath the score value) so
    // no stray amber elsewhere could vacuously pass; there must be none.
    const rowInk = amberSegs(segments).filter(
      (s) => leftColumn(s) && Math.max(s.y1, s.y2) > SCORE_VALUE_Y,
    )
    expect(rowInk).toHaveLength(0)
  })

  it('leaves the score value itself green — the bonus row is additive ink, not a recolour', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ score: 60_681, bonusFlash: 0.9 }), W, H)

    // The green score value (#22e600 family: low red, high green) must still be
    // present in the upper-left score region — GREEN must ADD the amber row, not
    // repaint the score. Guards against "just flash the existing score amber".
    const isGreen = (hex: string): boolean => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
      if (!m) return false
      const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16))
      return g > 150 && r < 120 && b < 120
    }
    const scoreGreen = segments.filter(
      (s) => isGreen(s.color) && leftColumn(s) && Math.min(s.y1, s.y2) <= SCORE_VALUE_Y,
    )
    expect(scoreGreen.length).toBeGreaterThan(0)
  })
})
