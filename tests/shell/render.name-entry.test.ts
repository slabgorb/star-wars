// tests/shell/render.name-entry.test.ts
//
// SH2-13 RED — AC-1 for the game that never had an entry screen: when the
// entry is armed on the game-over screen, render must actually SHOW the typed
// initials (star-wars presents the entry screen; it does not silently tag).
// The only post-SH2-5 seam where text is identifiable is the layoutText
// boundary, so this mocks the local './font' re-export (the font-text-seam
// pattern) and pins that the typed buffer reaches layoutText. Placement,
// styling, and the prompt copy stay eyeball criteria (per-cabinet NUMBERS).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '../../src/shell/render'
import { initialState, type GameState } from '../../src/core/state'
import type { HighScoreTable } from '@arcade/shared/highscore'

const font = vi.hoisted(() => {
  const calls: { text: string }[] = []
  return {
    calls,
    layoutText(text: string, opts?: { letterSpacing?: number }) {
      calls.push({ text })
      const n = [...text].length
      const sp = opts?.letterSpacing ?? 0
      return {
        strokes: [{ points: [{ x: 0, y: 0 }, { x: 16, y: 0 }] }],
        width: 16 * n + sp * n,
      }
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

/** Proxy ctx: every method no-ops, every property is settable. */
function makeCtx(): CanvasRenderingContext2D {
  const target: Record<string | symbol, unknown> = { canvas: { width: W, height: H } }
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop === 'measureText') return () => ({ width: 0 })
      if (prop in t) return t[prop]
      return () => undefined
    },
    set(t, prop, value) {
      t[prop] = value
      return true
    },
  })
  return proxy as unknown as CanvasRenderingContext2D
}

/** A qualifying game-over with the entry armed and QZJ typed (QZJ appears in
 *  no HUD/framing copy, so a hit is unambiguously the entry buffer). */
function armedGameOver(initials: string): GameState {
  const s = { ...initialState(11), score: 4200, wave: 3, lives: 0, gameOver: true }
  ;(s as unknown as { mode: string }).mode = 'gameover'
  ;(s as unknown as { entry: { initials: string } | null }).entry = { initials }
  return s
}

const NO_SCORES: HighScoreTable<'wave'> = []

beforeEach(() => {
  font.calls.length = 0
})

describe('the armed entry screen draws the typed initials (AC-1)', () => {
  it('hands the typed buffer to layoutText', () => {
    render(makeCtx(), armedGameOver('QZJ'), W, H, NO_SCORES)
    expect(font.calls.length).toBeGreaterThan(0) // the seam recorder is live
    const texts = font.calls.map((c) => c.text)
    expect(
      texts.some((t) => t.includes('QZJ')),
      `no layoutText call contained the typed initials; saw: ${JSON.stringify(texts)}`,
    ).toBe(true)
  })

  it('detector honesty: the initials do NOT appear when no entry is armed', () => {
    const bare = armedGameOver('QZJ')
    ;(bare as unknown as { entry: unknown }).entry = null
    render(makeCtx(), bare, W, H, NO_SCORES)
    expect(font.calls.some((c) => c.text.includes('QZJ'))).toBe(false)
  })
})
