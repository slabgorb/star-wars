// tests/shell/render.intro-crawl.test.ts
//
// sw7-10 RED — H-018: the receding intro crawl renders (shell half).
//
// The core carries the live lines on `state.attract.crawl` (see the core suite). This
// proves the SHELL draws their text. Text is asserted at the layoutText seam (the
// requested string, captured before the font blanks a glyph). The apostrophe in
// "THE EMPIRE'S DEATH STAR" is authentic but unrenderable by the shared VGMSGA font,
// so it is matched TOLERANTLY (the sw7-3 LEIA'S precedent); the render-fidelity gap is
// a Delivery Finding, not a reason to force an unrenderable char.
//
// render() draws the static attract screen today and ignores `attract.crawl` → red.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '../../src/shell/render'
import { attractOn, withExt } from '../support/sw710-contract'
import type { GameState } from '../../src/core/state'

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

const allText = (): string => font.calls.map((c) => c.text).join('\n')

/** A banner-page attract frame with these crawl lines live at mid-recession. */
function bannerWithCrawl(...lines: string[]): GameState {
  return withExt(attractOn('banner'), {
    attract: { page: 'banner', pageAge: 6, crawl: lines.map((text) => ({ text, size: 0.4 })) },
  })
}

beforeEach(() => {
  font.calls.length = 0
})

describe('sw7-10 H-018 — the crawl lines render on the banner page', () => {
  it('draws the opening and closing crawl lines verbatim', () => {
    render(makeCtx(), bannerWithCrawl('OBI-WAN KENOBI IS GONE BUT HIS', 'ALWAYS'), W, H, [])
    expect(allText()).toContain('OBI-WAN KENOBI IS GONE BUT HIS')
    expect(allText()).toContain('ALWAYS')
  })

  it('draws the apostrophe line tolerantly (font blanks the apostrophe)', () => {
    render(makeCtx(), bannerWithCrawl("THE EMPIRE'S DEATH STAR, UNDER THE"), W, H, [])
    // Accept with or without the unrenderable apostrophe — the sw7-3 tolerant pin.
    expect(allText()).toMatch(/THE EMPIRE'?S DEATH STAR, UNDER THE/)
  })
})
