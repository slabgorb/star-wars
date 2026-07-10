// tests/shell/font-shared-resolution.test.ts
//
// RED-phase suite for Story SH2-5, the dependency-pin contract: star-wars must
// consume @arcade/shared at a ref whose exports map carries the /font subpath
// AND whose glyph table covers the audited star-wars character set — notably
// ',' (en-US toLocaleString grouping in formatScore and the force-bonus
// banner), the SH2-3 gap glyph absent from every tag up to v0.6.0. The current
// pin (v0.5.0) has no /font subpath at all, so this fails until Dev re-pins
// (tag v0.7.0, cut at SH2-3's f9676be, is the clean target).
//
// Isolated in its own file, and imported through a VARIABLE specifier with
// @vite-ignore, so the unresolvable subpath surfaces as this one test's
// failure — not a module-graph crash that would silence sibling tests (which
// is exactly what a static `import('@arcade/shared/font')` did to the
// mechanism suite on the first RED run).

import { describe, it, expect } from 'vitest'

// Runtime-only resolution: keep the specifier out of Vite's static analysis.
const SHARED_FONT_SUBPATH = '@arcade/shared/font'

interface SharedFontModule {
  layoutText: (
    text: string,
    opts?: { letterSpacing?: number },
  ) => { strokes: { points: { x: number; y: number }[] }[]; width: number }
  hasGlyph: (ch: string) => boolean
  GLYPH_CHARS: string
}

describe('SH2-5 — @arcade/shared/font resolves with the star-wars glyph set', () => {
  it('resolves the /font subpath and covers every audited character', async () => {
    const font = (await import(
      /* @vite-ignore */ SHARED_FONT_SUBPATH
    )) as unknown as SharedFontModule
    expect(typeof font.layoutText).toBe('function')
    // Full alphabet + digits (high-score names can be any A-Z) and the ','
    // that formatScore / the force-bonus banner render via toLocaleString —
    // the SH2-3 audit's star-wars gap glyph, absent from tags <= v0.6.0.
    const NEEDED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789,'
    for (const ch of NEEDED) {
      expect(font.hasGlyph(ch), `shared font missing glyph ${JSON.stringify(ch)}`).toBe(true)
    }
    expect(font.GLYPH_CHARS).toContain(',')
    // Representative banner text (comma + spaces) lays out to real geometry.
    const laid = font.layoutText('12,066 FOR USING THE FORCE')
    expect(laid.strokes.length).toBeGreaterThan(0)
    expect(laid.width).toBeGreaterThan(0)
  })
})
