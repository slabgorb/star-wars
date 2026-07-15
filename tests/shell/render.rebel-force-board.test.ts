// tests/shell/render.rebel-force-board.test.ts
//
// sw7-3 RED — the high-score board's authentic framing, asserted at the ONLY
// text-identifiable seam (layoutText; the canvas sees anonymous strokes). Mirrors
// the font-text-seam mock (render.ts imports layoutText from './font'). Covers:
//
//   H-011  the board TITLE is the ROM's message RF2 <PRINCESS LEIA'S REBEL FORCE>
//          (TCMES.MAC:605), NOT 'HIGH SCORES'.
//          CRITICAL (refutation): there is NO bare <REBEL FORCE> message — RF1 is
//          `.NEXTMESS` which only RE-CENTRES the SAME title for the half-screen
//          initials layout; a lone 'REBEL FORCE' string is a fabrication.
//   H-020  board scores are comma-grouped (VW8DIG inserts VJNUMS commas —
//          TCMES.MAC:791), not the raw `String(e.score).padStart(6)` integer.
//
// Apostrophe caveat: the shared VGMSGA font has NO apostrophe glyph (GLYPH_CHARS
// is " 0123456789A-Z-,/_"; charGlyph degrades "'" to a blank space). So the
// on-screen title cannot carry the apostrophe in-scope — the title assertion
// therefore accepts LEIA'S or LEIAS. Raised as a Delivery Finding (adding the
// glyph is an out-of-scope @arcade/shared change).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '../../src/shell/render'
import { initialState, type GameState } from '../../src/core/state'
import type { HighScoreTable } from '@arcade/shared/highscore'

// Record the strings handed to layoutText. Trivial-but-valid geometry so render
// strokes without NaN and without the shared package needing to resolve.
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

/** Proxy ctx: methods no-op, properties settable, measureText width 0. */
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
const attract = (): GameState => ({ ...initialState(1983), mode: 'attract' })

// The authentic top + bottom seed rows — enough to exercise the title, the name
// display, and comma grouping without importing the (RED, not-yet-created) core
// module. Values are the BCD-decoded ROM ladder ends (OBI high, RLM low).
const BOARD: HighScoreTable<'wave'> = [
  { name: 'OBI', score: 1_285_353, wave: 4 },
  { name: 'RLM', score: 380_655, wave: 1 },
]

beforeEach(() => {
  font.calls.length = 0
})

describe("sw7-3 H-011 — the board title is PRINCESS LEIA'S REBEL FORCE, not HIGH SCORES", () => {
  it('draws the ROM RF2 title above the ladder', () => {
    render(makeCtx(), attract(), W, H, BOARD)
    expect(
      texts().some((t) => /^PRINCESS LEIA'?S REBEL FORCE$/.test(t)),
      `no board title matched PRINCESS LEIA['S] REBEL FORCE; saw: ${JSON.stringify(texts())}`,
    ).toBe(true)
  })

  it('no longer draws the generic HIGH SCORES header', () => {
    render(makeCtx(), attract(), W, H, BOARD)
    expect(texts()).not.toContain('HIGH SCORES')
  })

  it('does NOT draw a bare REBEL FORCE (the .NEXTMESS RF1 fabrication trap)', () => {
    // Guard, per the CRITICAL warning: bites if Dev reads RF1's comment as a
    // separate short string and draws a lone 'REBEL FORCE'. The full title
    // "PRINCESS LEIA'S REBEL FORCE" is a DIFFERENT array element, so this stays
    // green for the correct fix (toContain is exact-element, not substring).
    render(makeCtx(), attract(), W, H, BOARD)
    expect(texts(), 'a lone REBEL FORCE string is not in the ROM').not.toContain('REBEL FORCE')
  })
})

describe('sw7-3 H-020 — board scores are comma-grouped (VW8DIG), not the raw integer', () => {
  it('groups every board score with commas', () => {
    render(makeCtx(), attract(), W, H, BOARD)
    const all = texts().join('\n')
    expect(all, 'top score should read 1,285,353').toContain('1,285,353')
    expect(all, 'low score should read 380,655').toContain('380,655')
    // The seeded names must still show alongside the grouped scores.
    expect(all).toContain('OBI')
    expect(all).toContain('RLM')
  })

  it('does not draw the raw ungrouped integer (String(e.score).padStart)', () => {
    render(makeCtx(), attract(), W, H, BOARD)
    const all = texts().join('\n')
    expect(all).not.toContain('1285353')
    expect(all).not.toContain('380655')
  })
})
