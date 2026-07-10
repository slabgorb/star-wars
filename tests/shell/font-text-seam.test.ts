// tests/shell/font-text-seam.test.ts
//
// RED-phase suite for Story SH2-5, the string-content + tracking contract: after
// the migration the ONLY seam where star-wars' HUD/framing text is identifiable
// as text is the layoutText boundary (the canvas sees anonymous stroke geometry).
// This suite mocks the local './font' re-export module (tempest/asteroids
// precedent — render.ts imports layoutText from './font', which re-exports
// @arcade/shared/font) and pins:
//
//   1. WHICH strings each screen hands to layoutText (HUD header, shield gauge,
//      trench banners, attract, game over, high-score board) — the same strings
//      glowText draws through fillText today, so nothing is lost in migration.
//   2. That every run carries a POSITIVE letterSpacing opt — glowText applies
//      ~0.1em tracking to every run today, and the thin caps-only face reads
//      cramped at zero; requiring it per-run also guards a measure-with-0 /
//      draw-with-N mismatch that would misalign centred/right-aligned text
//      (the SH2-4 per-run contract, carried forward).
//   3. That every string is handed over ALREADY UPPERCASE — the shared VGMSGA
//      face is caps-only; glowText's toUpperCase() must survive the migration
//      or mixed-case input (e.g. a tampered high-score name) drops glyphs.
//
// The mock returns trivial-but-valid geometry, so these assertions are decoupled
// from the shared package resolving (the re-pin is forced by
// tests/shell/font-migration.test.ts) and from real glyph coordinates. Layout /
// position / glow remain eyeball criteria per the epic's render guardrail.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '../../src/shell/render'
import {
  initialState,
  FORCE_BONUS,
  PORT_AHEAD_RANGE,
  type GameState,
} from '../../src/core/state'
import { formatScore, formatLives, formatWave } from '../../src/core/hud'
import type { HighScoreTable } from '@arcade/shared/highscore'

// Record the strings + opts handed to layoutText. Returned geometry is trivial
// but valid so render can stroke it without NaN and without the shared package
// needing to resolve.
const font = vi.hoisted(() => {
  const calls: { text: string; opts: { letterSpacing?: number } | undefined }[] = []
  return {
    calls,
    layoutText(text: string, opts?: { letterSpacing?: number }) {
      calls.push({ text, opts })
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

/** Proxy ctx: every method no-ops, every property is settable; measureText
 *  returns width 0 so any centring math never NaNs. */
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

const texts = () => font.calls.map((c) => c.text)

const playing = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  score: 12066,
  wave: 2,
  lives: 3,
  ...over,
})

const trenchBanners = (): GameState =>
  playing({
    phase: 'trench',
    exhaustPort: { pos: [0, 0, -(PORT_AHEAD_RANGE - 100)] },
    trenchScrollZ: 0,
    t: 1,
    forceBonusAwardedAt: 0.5,
  })

const attractState = (): GameState => ({ ...initialState(1983), mode: 'attract' })
const gameOverState = (): GameState => ({
  ...initialState(1983),
  mode: 'gameover',
  score: 2500,
})

const SCORES: HighScoreTable<'wave'> = [{ name: 'LUKE', score: 9000, wave: 6 }]

beforeEach(() => {
  font.calls.length = 0
})

describe('SH2-5 — the HUD header + shield gauge flow through layoutText', () => {
  it('hands the SCORE label and the comma-grouped value to layoutText', () => {
    render(makeCtx(), playing(), W, H, [])
    expect(texts()).toContain('SCORE')
    expect(texts()).toContain(formatScore(12066)) // "12,066" — the comma path
  })

  it('hands the WAVE label and value to layoutText', () => {
    render(makeCtx(), playing(), W, H, [])
    expect(texts()).toContain('WAVE')
    expect(texts()).toContain(formatWave(2))
  })

  it('hands the SHIELD label and the lives numeral to layoutText', () => {
    render(makeCtx(), playing(), W, H, [])
    expect(texts()).toContain('SHIELD')
    expect(texts()).toContain(formatLives(3))
  })
})

describe('SH2-5 — the trench banners flow through layoutText', () => {
  it('hands EXHAUST PORT AHEAD to layoutText when the port is in range', () => {
    render(makeCtx(), trenchBanners(), W, H, [])
    expect(texts()).toContain('EXHAUST PORT AHEAD')
  })

  it('hands the comma-grouped force-bonus banner to layoutText', () => {
    render(makeCtx(), trenchBanners(), W, H, [])
    const banner = `${FORCE_BONUS.toLocaleString('en-US')} FOR USING THE FORCE`
    expect(banner).toContain(',') // guard: the fixture really exercises the comma
    expect(texts()).toContain(banner)
  })
})

describe('SH2-5 — the framing screens flow through layoutText', () => {
  it('attract: marquee, start prompt, and the high-score board', () => {
    render(makeCtx(), attractState(), W, H, SCORES)
    expect(texts()).toContain('STAR WARS')
    expect(texts()).toContain('PRESS START')
    expect(texts()).toContain('HIGH SCORES')
    const row = texts().find((t) => t.includes('LUKE'))
    expect(row, 'no high-score row mentions the entrant').toBeDefined()
    expect(row).toContain('WAVE 6')
  })

  it('attract with an empty board: the NO SCORES YET placeholder', () => {
    render(makeCtx(), attractState(), W, H, [])
    expect(texts()).toContain('NO SCORES YET')
  })

  it('game over: banner, final score, and start prompt', () => {
    render(makeCtx(), gameOverState(), W, H, SCORES)
    expect(texts()).toContain('GAME OVER')
    expect(texts()).toContain('SCORE 2500')
    expect(texts()).toContain('PRESS START')
  })
})

describe('SH2-5 — every layoutText run honours the tracking + caps contracts', () => {
  const surfaces: [string, () => GameState, HighScoreTable<'wave'>][] = [
    ['playing/space', () => playing(), []],
    ['playing/trench+banners', () => trenchBanners(), []],
    ['attract', () => attractState(), SCORES],
    ['gameover', () => gameOverState(), SCORES],
  ]

  it('every run carries a positive letterSpacing opt', () => {
    for (const [label, state, scores] of surfaces) {
      font.calls.length = 0
      render(makeCtx(), state(), W, H, scores)
      expect(font.calls.length, `${label} drew no text at all`).toBeGreaterThan(0)
      for (const call of font.calls) {
        expect(
          call.opts?.letterSpacing ?? 0,
          `run ${JSON.stringify(call.text)} in ${label} has no positive letterSpacing`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it('every string reaches layoutText already uppercase (the face is caps-only)', () => {
    for (const [label, state, scores] of surfaces) {
      font.calls.length = 0
      render(makeCtx(), state(), W, H, scores)
      for (const call of font.calls) {
        expect(
          call.text,
          `run ${JSON.stringify(call.text)} in ${label} is not caps-only`,
        ).toBe(call.text.toUpperCase())
      }
    }
  })
})
