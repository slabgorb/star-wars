// tests/shell/font-migration.test.ts
//
// RED-phase suite for Story SH2-5: migrate star-wars' HUD/framing text off the
// vendored "Vector Battle" TTF (ctx.font + ctx.fillText via glowText) onto
// @arcade/shared/font stroke-vectors (layoutText -> stroked glyph geometry),
// keeping glowText's ~0.1em tracking through layoutText's `letterSpacing` opt.
// Mirrors asteroids' SH2-4 suite (tests/font-migration.test.ts there) — the
// third per-game migration after tempest (SH2-2) and asteroids (SH2-4).
//
// The migration DELETES the text-as-string canvas signal from the game surface:
// post-migration NO game text reaches ctx.fillText — every HUD/framing glyph is
// stroked like the wireframes. So the testable seams are (1) a recording ctx
// that proves render() never touches fillText / ctx.font / ctx.letterSpacing
// and that banner text becomes stroke geometry, (2) fs + source-text scans that
// the TTF asset and its FontFace loader are gone (comment-INCLUSIVE — AC-2
// forbids any remaining 'Vector Battle'/FontFace reference, even in comments),
// and (3) the real @arcade/shared/font resolving with star-wars' full audited
// character set (SH2-3: A C D E F G H I L M N O P R S T U V W X Y, 0-9, space,
// and ',' from en-US toLocaleString score/bonus grouping — the ',' glyph exists
// only from arcade-shared f9676be / tag v0.7.0 on; the current v0.5.0 pin has
// no /font subpath at all, so the resolution test is the re-pin forcing test).
//
// SCOPE (TEA ruling, logged as a deviation in the session file): the no-text-API
// mandate covers the GAME surface (render.ts). The dev-only diagnostic surfaces
// (src/shell/debug-overlay.ts, src/tools/*Sheet.ts) keep plain fillText labels —
// their strings need characters the caps-only VGMSGA alphabet deliberately lacks
// — but the src-wide scans below still purge 'Vector Battle' / FontFace /
// loadVectorFont from them, so the TTF and its loader leave the repo entirely.
//
// Position / size / glow stay eyeball criteria at http://localhost:5274/ per the
// epic's render guardrail — these tests pin MECHANISM, never coordinates.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { render } from '../../src/shell/render'
import { initialState, PORT_AHEAD_RANGE, type GameState } from '../../src/core/state'
import type { HighScoreTable } from '@arcade/shared/highscore'

const W = 800
const H = 600

// ---- recording ctx: flags every fillText / ctx.font / ctx.letterSpacing touch,
// counts stroked segments. Every other member no-ops (Proxy) so this suite does
// not break when Dev touches an unrelated ctx call. ---------------------------
function recCtx() {
  const rec = {
    fillTextCalls: [] as string[],
    fontSets: [] as unknown[],
    letterSpacingSets: [] as unknown[],
    segments: 0,
    canvas: { width: W, height: H },
  }
  const target = rec as unknown as Record<string | symbol, unknown>
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop === 'fillText' || prop === 'strokeText') {
        return (s: unknown) => {
          rec.fillTextCalls.push(String(s))
        }
      }
      if (prop === 'lineTo') {
        return () => {
          rec.segments += 1
        }
      }
      if (prop === 'measureText') return () => ({ width: 0 })
      if (prop in t) return t[prop]
      return () => {}
    },
    set(t, prop, value) {
      if (prop === 'font') rec.fontSets.push(value)
      if (prop === 'letterSpacing') rec.letterSpacingSets.push(value)
      t[prop] = value
      return true
    },
  })
  return { ctx: proxy as unknown as CanvasRenderingContext2D, rec }
}

// ---- states: one per text-drawing surface ------------------------------------

const playing = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  score: 12066, // formats to "12,066" — the audited star-wars comma path
  wave: 2,
  lives: 3,
  ...over,
})

/** Trench state with BOTH banners lit: the port inside PORT_AHEAD_RANGE and the
 *  force bonus freshly awarded — the '5,000 FOR USING THE FORCE' comma path. */
const trenchBanners = (over: Partial<GameState> = {}): GameState =>
  playing({
    phase: 'trench',
    exhaustPort: { pos: [0, 0, -(PORT_AHEAD_RANGE - 100)] },
    trenchScrollZ: 0,
    t: 1,
    forceBonusAwardedAt: 0.5,
    ...over,
  })

const attractState = (): GameState => ({ ...initialState(1983), mode: 'attract' })
const gameOverState = (): GameState => ({
  ...initialState(1983),
  mode: 'gameover',
  score: 2500,
})

const SCORES: HighScoreTable<'wave'> = [{ name: 'LUKE', score: 9000, wave: 6 }]

const allModes = (): [string, GameState, HighScoreTable<'wave'>][] => [
  ['playing/space', playing(), []],
  ['playing/trench+banners', trenchBanners(), []],
  ['attract (board)', attractState(), SCORES],
  ['attract (empty board)', attractState(), []],
  ['gameover', gameOverState(), SCORES],
]

// ---- (1) mechanism: game text is stroked, never drawn through the text API ----

describe('SH2-5 — render() no longer uses the canvas text API', () => {
  it('never calls ctx.fillText / ctx.strokeText in any mode', () => {
    for (const [label, state, scores] of allModes()) {
      const { ctx, rec } = recCtx()
      render(ctx, state, W, H, scores)
      expect(rec.fillTextCalls, `fillText was called for ${label}`).toEqual([])
    }
  })

  it('never sets ctx.font — the TTF face string path is gone', () => {
    for (const [label, state, scores] of allModes()) {
      const { ctx, rec } = recCtx()
      render(ctx, state, W, H, scores)
      expect(rec.fontSets, `ctx.font was set for ${label}`).toEqual([])
    }
  })

  it('never sets ctx.letterSpacing — tracking moved to layoutText opts', () => {
    for (const [label, state, scores] of allModes()) {
      const { ctx, rec } = recCtx()
      render(ctx, state, W, H, scores)
      expect(rec.letterSpacingSets, `ctx.letterSpacing was set for ${label}`).toEqual([])
    }
  })

  it('strokes the force-bonus banner as vector geometry', () => {
    // Two trench frames differing ONLY in forceBonusAwardedAt: lit draws one
    // extra text run ('5,000 FOR USING THE FORCE'); with text as strokes the lit
    // frame must add stroked segments. Pre-migration both runs go through
    // fillText, the counts are equal, and this fails — the RED signal.
    const lit = recCtx()
    render(lit.ctx, trenchBanners(), W, H, [])
    const dark = recCtx()
    render(dark.ctx, trenchBanners({ forceBonusAwardedAt: null }), W, H, [])
    expect(lit.rec.segments).toBeGreaterThan(dark.rec.segments)
  })
})

// ---- (2) the Vector Battle TTF asset + its FontFace loader are gone -----------

const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url))
const RENDER = fileURLToPath(new URL('../../src/shell/render.ts', import.meta.url))
const FONT_TS = fileURLToPath(new URL('../../src/shell/font.ts', import.meta.url))
const MAIN = fileURLToPath(new URL('../../src/main.ts', import.meta.url))
const FONTS_DIR = fileURLToPath(new URL('../../public/fonts/', import.meta.url))
const read = (p: string): string => readFileSync(p, 'utf8')

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = dir + name
    if (statSync(p).isDirectory()) out.push(...tsFiles(p + '/'))
    else if (name.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('SH2-5 — the non-commercial TTF face and its loader are retired', () => {
  it('ships no .ttf under public/fonts/', () => {
    const ttfs = existsSync(FONTS_DIR)
      ? readdirSync(FONTS_DIR).filter((f) => f.toLowerCase().endsWith('.ttf'))
      : []
    expect(ttfs, `stray TTF asset(s): ${ttfs.join(', ')}`).toEqual([])
  })

  it('no source file references FontFace or document.fonts (comments included)', () => {
    const offenders = tsFiles(SRC_DIR).filter((p) => /\bFontFace\b|document\.fonts/.test(read(p)))
    expect(offenders.map((p) => p.replace(SRC_DIR, 'src/'))).toEqual([])
  })

  it('no source file references loadVectorFont (comments included)', () => {
    const offenders = tsFiles(SRC_DIR).filter((p) => /\bloadVectorFont\b/.test(read(p)))
    expect(offenders.map((p) => p.replace(SRC_DIR, 'src/'))).toEqual([])
  })

  it("no source file references the 'Vector Battle' face (comments included)", () => {
    // /Vector ?Battle/ also catches the VectorBattle-e9XO.ttf asset URL.
    const offenders = tsFiles(SRC_DIR).filter((p) => /Vector ?Battle/i.test(read(p)))
    expect(offenders.map((p) => p.replace(SRC_DIR, 'src/'))).toEqual([])
  })

  it('main.ts no longer boots a TTF font load', () => {
    expect(/\bloadVectorFont\b/.test(read(MAIN)), 'main.ts still calls loadVectorFont').toBe(false)
  })
})

// ---- (3) render.ts strokes shared-font glyphs instead of TTF text -------------

describe('SH2-5 — render.ts draws text via @arcade/shared/font layoutText', () => {
  it('uses no canvas text API (fillText / ctx.font / ctx.letterSpacing) in source', () => {
    const src = read(RENDER)
    expect(/\bfillText\b/.test(src), 'render.ts still calls fillText').toBe(false)
    expect(/ctx\.font\b/.test(src), 'render.ts still sets ctx.font').toBe(false)
    // The bare word letterSpacing is ALLOWED (it is the layoutText opt the
    // tracking contract mandates) — only the ctx property is forbidden.
    expect(/ctx\.letterSpacing/.test(src), 'render.ts still sets ctx.letterSpacing').toBe(false)
  })

  it("imports layoutText through the local './font' seam and calls it", () => {
    // The local re-export module is the vi.mock seam every text-observation
    // suite relies on (tempest/asteroids precedent) — render.ts must import
    // from './font', NOT directly from the shared package.
    const src = read(RENDER)
    expect(/from '\.\/font'/.test(src), "render.ts does not import from './font'").toBe(true)
    expect(/\blayoutText\b/.test(src), 'render.ts never references layoutText').toBe(true)
    expect(
      /from '@arcade\/shared\/font'/.test(src),
      'render.ts must go through ./font, not import the shared package directly',
    ).toBe(false)
  })

  it("src/shell/font.ts is the shared re-export, not a loader", () => {
    const src = read(FONT_TS)
    expect(
      /@arcade\/shared\/font/.test(src),
      'font.ts does not re-export @arcade/shared/font',
    ).toBe(true)
  })
})

// ---- (4) the shared font resolves and carries the audited character set -------

describe('SH2-5 — @arcade/shared/font resolves with the star-wars glyph set', () => {
  // RED: the current pin (v0.5.0) has NO /font subpath — this import throws
  // until Dev re-pins @arcade/shared (>= f9676be; tag v0.7.0 is the clean pin).
  it('resolves the /font subpath and covers every audited character', async () => {
    const font = await import('@arcade/shared/font')
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
