// tests/shell/render.framing-prompts.test.ts
//
// sw7-3 RED — the framing-screen prompt copy + the game-over score, at the ONLY
// text-identifiable seam (layoutText). Mirrors the font-text-seam mock. Covers:
//
//   H-010  the start prompt is the ROM's message STR <PULL TRIGGER TO START>
//          (TCMES.MAC:549), not 'PRESS START' — at BOTH sites: the attract screen
//          AND the game-over screen (render.ts:993 and :1020).
//   H-012 (ruling) the initials-entry prompt reads 'ENTER YOUR INITIALS'. The ROM's HSZ is
//          <SHOOT YOUR INITIALS> (TCMES.MAC:603), but that assumes the shoot-a-letter-grid entry
//          (H-013); our clone uses keyboard entry, so ENTER matches the input — accepted divergence.
//   H-020  the game-over final score is comma-grouped (VW8DIG — TCMES.MAC:791),
//          not the raw `SCORE ${state.score}` integer.
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
      return { strokes: [{ points: [{ x: 0, y: 0 }, { x: 16, y: 0 }] }], width: 16 * n + sp * n }
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
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop === 'measureText') return () => ({ width: 0 })
      if (prop in t) return t[prop]
      return () => {}
    },
    set(t, prop, value) {
      t[prop] = value
      return true
    },
  })
  return proxy as unknown as CanvasRenderingContext2D
}

const texts = (): string[] => font.calls.map((c) => c.text)

const NO_SCORES: HighScoreTable<'wave'> = []
const attract = (): GameState => ({ ...initialState(1983), mode: 'attract' })
// A game-over screen with the entry NOT armed (start prompt + board branch).
const gameOver = (score = 128_535): GameState => ({
  ...initialState(1983),
  mode: 'gameover',
  score,
  entry: null,
})
// A game-over screen with the initials entry armed (the ENTER YOUR INITIALS branch).
const gameOverEntry = (initials: string): GameState => ({
  ...initialState(1983),
  mode: 'gameover',
  score: 128_535,
  entry: { initials },
})

beforeEach(() => {
  font.calls.length = 0
})

describe('sw7-3 H-010 — the start prompt is PULL TRIGGER TO START, not PRESS START', () => {
  it('attract screen', () => {
    render(makeCtx(), attract(), W, H, NO_SCORES)
    expect(texts()).toContain('PULL TRIGGER TO START')
    expect(texts()).not.toContain('PRESS START')
  })

  it('game-over screen (entry not armed)', () => {
    render(makeCtx(), gameOver(), W, H, NO_SCORES)
    expect(texts()).toContain('PULL TRIGGER TO START')
    expect(texts()).not.toContain('PRESS START')
  })
})

describe('sw7-3 H-012 (ruling) — the initials prompt reads ENTER YOUR INITIALS (keyboard entry, not the ROM shoot-a-grid SHOOT)', () => {
  it('the armed game-over entry screen', () => {
    // Accepted divergence: the ROM's HSZ is <SHOOT YOUR INITIALS> (shoot-a-letter-grid),
    // but our clone uses keyboard entry (H-013 accepted), so ENTER matches the input model.
    render(makeCtx(), gameOverEntry('AB'), W, H, NO_SCORES)
    expect(texts()).toContain('ENTER YOUR INITIALS')
    expect(texts()).not.toContain('SHOOT YOUR INITIALS')
  })
})

describe('sw7-3 H-020 — the game-over final score is comma-grouped, not raw', () => {
  it('draws SCORE 128,535, never the ungrouped 128535', () => {
    render(makeCtx(), gameOver(128_535), W, H, NO_SCORES)
    const all = texts().join('\n')
    expect(all, 'the game-over score should be comma-grouped').toContain('128,535')
    expect(all, 'the raw ungrouped integer must not appear').not.toContain('128535')
  })
})
