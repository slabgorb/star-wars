// tests/shell/render.coaching.test.ts
//
// sw7-10 RED — H-022: coaching messages render (shell half).
//
// The core sets `state.coaching` at the ROM moments (see the core suite). This proves
// the SHELL draws that message. Text asserted at the layoutText seam. The strings are
// verbatim from TCMES.MAC (SFB/STF/ACW/BON/SHG). Crucially, BON is "STARTING WAVE BONUS"
// (TCMES.MAC:617) — the shell must NEVER draw the stale "DEATH STAR BONUS EARNED" comment
// (WSMAIN.MAC:3362) the clone inherited at state.ts:171.
//
// render() ignores `state.coaching` today → none of these strings appear → red.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '../../src/shell/render'
import { withExt, COACH, BON_MISLABEL } from '../support/sw710-contract'
import { initialState, type GameState } from '../../src/core/state'

const font = vi.hoisted(() => {
  const calls: { text: string }[] = []
  return {
    calls,
    layoutText(text: string) {
      calls.push({ text })
      return { strokes: [{ points: [{ x: 0, y: 0 }, { x: 16, y: 0 }] }], width: 16 * [...text].length }
    },
  }
})

vi.mock('../../src/shell/font', () => ({
  layoutText: font.layoutText,
  CELL_W: 16,
  CELL_H: 24,
  hasGlyph: () => true,
  charGlyph: () => ({ strokes: [], advance: 24 }),
  GLYPH_CHARS: ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-_,/',
}))

const W = 800
const H = 600

function makeCtx(): CanvasRenderingContext2D {
  const target: Record<string | symbol, unknown> = { canvas: { width: W, height: H } }
  return new Proxy(target, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 0 })
      if (p in t) return t[p]
      return () => {}
    },
    set(t, p, v) {
      t[p] = v
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

const has = (sub: string): boolean => font.calls.some((c) => c.text.includes(sub))

/** A live space frame carrying the given coaching message. */
function coachingFrame(message: string): GameState {
  return withExt(initialState(1983), { coaching: message })
}

beforeEach(() => {
  font.calls.length = 0
})

describe('sw7-10 H-022 — each coaching message renders its ROM text', () => {
  for (const message of [COACH.shootFireballs, COACH.shootTies, COACH.avoidCatwalks, COACH.shieldGone]) {
    it(`draws "${message}"`, () => {
      render(makeCtx(), coachingFrame(message), W, H, [])
      expect(has(message)).toBe(true)
    })
  }
})

describe('sw7-10 H-022 — BON reads STARTING WAVE BONUS, never the stale comment', () => {
  it('draws "STARTING WAVE BONUS" and never "DEATH STAR BONUS EARNED"', () => {
    render(makeCtx(), coachingFrame(COACH.startingWaveBonus), W, H, [])
    expect(has(COACH.startingWaveBonus)).toBe(true)
    expect(has(BON_MISLABEL)).toBe(false)
  })
})
