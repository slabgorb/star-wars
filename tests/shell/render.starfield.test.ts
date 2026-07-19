// tests/shell/render.starfield.test.ts
//
// sw7-10 RED — M-015: the WSSTAR starfield renders (shell half).
//
// The core carries `state.starfield` (see tests/core/starfield.test.ts). This proves
// the SHELL actually draws it. Seam-agnostic: rather than pin Dev's exact dot
// primitive (the ROM star glyph is a single point, `VGSTAR: VON 0,0` WSVROM.MAC:1524),
// count ALL mark-producing canvas calls (arc / fillRect / rect / moveTo) and compare
// a 50-star attract frame to a 0-star one. The delta IS the starfield. render()
// ignores `state.starfield` today, so the delta is 0 → red.
//
// The font is mocked inert (as the framing-prompts suite does), so text draws no
// canvas marks and the count isolates the starfield. Colour (ROM white, VGCWHT) is a
// shell choice left to Dev + the Reviewer's eye — not pinned here.
import { describe, it, expect, vi } from 'vitest'
import { render } from '../../src/shell/render'
import { attractOn, withExt, type Star } from '../support/sw710-contract'

// Inert font: text becomes zero canvas marks, so the mark count is the starfield alone.
vi.mock('../../src/shell/font', () => ({
  layoutText: (text: string) => ({ strokes: [], width: [...text].length * 16 }),
  CELL_W: 16,
  CELL_H: 24,
  hasGlyph: () => true,
  charGlyph: () => ({ strokes: [], advance: 24 }),
  GLYPH_CHARS: ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-_,/',
}))

const W = 800
const H = 600

/** A context that tallies every mark-producing call, whatever primitive Dev picks. */
function markCounter(): { ctx: CanvasRenderingContext2D; marks: () => number } {
  let n = 0
  const target: Record<string | symbol, unknown> = {
    canvas: { width: W, height: H },
    arc: () => { n++ },
    fillRect: () => { n++ },
    rect: () => { n++ },
    moveTo: () => { n++ },
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }
  const proxy = new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p]
      return () => {}
    },
    set(t, p, v) {
      t[p] = v
      return true
    },
  })
  return { ctx: proxy as unknown as CanvasRenderingContext2D, marks: () => n }
}

const fiftyStars: Star[] = Array.from({ length: 50 }, (_, i) => ({
  x: (i % 10) * 40 - 200,
  y: Math.floor(i / 10) * 40 - 100,
  z: 500 + i * 20,
}))

describe('sw7-10 M-015 — the attract screen draws the 50-star field', () => {
  it('a 50-star attract frame draws far more marks than a starless one', () => {
    const withStars = markCounter()
    render(withStars.ctx, withExt(attractOn('hiscore'), { starfield: fiftyStars }), W, H, [])

    const without = markCounter()
    render(without.ctx, withExt(attractOn('hiscore'), { starfield: [] }), W, H, [])

    // 50 stars ⇒ ~50 extra marks. render() ignores `starfield` today ⇒ delta 0 (red).
    expect(withStars.marks() - without.marks()).toBeGreaterThanOrEqual(40)
  })
})
