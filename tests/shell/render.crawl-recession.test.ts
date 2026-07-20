// tests/shell/render.crawl-recession.test.ts
//
// sw7-10 REWORK RED — H-018: the intro crawl's RECESSION DIRECTION.
//
// WHY THIS FILE EXISTS (round-1 blocking finding F1). `src/core/attract.ts`'s
// `CrawlLine` docstring stated the INVERSE of the convention its own code implements,
// and NOTHING in 1751 tests could tell: re-inverting `render.ts`'s
// `const remaining = 1 - line.size` to `line.size` left the whole suite GREEN. The
// pre-existing shell suite (`render.intro-crawl.test.ts:61`) pins every line at a
// CONSTANT `size: 0.4`, so it never varies the axis and structurally cannot observe
// direction. This inversion had ALREADY shipped once in this story and was caught only
// by a human driving the running game — so it gets a real guard, not another comment.
//
// GROUND TRUTH — the ROM settles the direction without needing the AVG scale field's
// polarity at all. Three lines form a closed chain (.RADIX 16 via WSCOMN.MAC:5):
//   * TCMES.MAC:167  `SPECIAL MESSAGE LIST IS FOR MESSAGES THAT RECEDE INTO THE DISTANCE.`
//   * TCMES.MAC:183  (`SPMON`) `LDD #0000 ;SIZE ALWAYS STARTS AT LINEAR SCALE OF 0`
//   * TCMES.MAC:415  the line is RETIRED once the accumulator passes `#0F000`.
// The accumulator starts at 0 and grows across the life of a message the ROM itself
// calls RECEDING, and retirement is at the accumulator's MAXIMUM. Therefore:
//     size 0 = birth  = NEAR the viewer = LARGE and LOW on screen
//     size 1 = retire = the VANISHING POINT = SMALL and high (screen centre)
// Corroborated by polarity too: `COMB ;BRIGHTNESS RELATIVE TO INVERSE OF SCALE`
// (TCMES.MAC:262) makes brightness the complement of the accumulator, so a line DIMS as
// the accumulator grows — and dimming with distance is receding.
//
// (A round-1 auditor argued the opposite — that a line is born tiny AT the vanishing
// point and grows toward the viewer. That is APPROACHING, which contradicts :167
// outright. Refuted in the session file; this suite encodes the refutation.)
//
// THE SEAM. `glowText` (render.ts:1322-1348) maps glyph points to screen with
// `scale = sizePx / CELL_H`, `sx = ox + p.x*scale`, `sy = y - p.y*scale`. So the raw
// canvas coordinates carry BOTH the row and the type size. We feed the font a single
// unit stroke on the baseline (p.y = 0), which makes `sy` exactly the row `y` and the
// captured x-span exactly `CELL_W * sizePx / CELL_H` — an exact recovery of both axes.
// This pins ACTUAL COORDINATES, not a ratio: a ratio is scale-invariant and would miss
// a wrong linear coefficient (the rb4-19 lesson).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '../../src/shell/render'
import { attractOn, withExt } from '../support/sw710-contract'
import type { GameState } from '../../src/core/state'

// `vi.mock` factories are hoisted above every top-level binding, so the cell metrics and
// the probe string have to be created inside `vi.hoisted` for the factory to see them.
const K = vi.hoisted(() => ({
  CELL_W: 16,
  CELL_H: 24,
  /** The one line we let the font emit strokes for, so the capture is unambiguous. */
  PROBE: 'ALWAYS',
}))
const { CELL_W, CELL_H, PROBE } = K
/** `CRAWL_GLOW` (render.ts:403) — the crawl's own stroke colour, used to filter. */
const CRAWL_GLOW = '#ffd60a'

// The font emits a single baseline stroke for PROBE and NOTHING for any other string,
// so the marquee and start prompt contribute zero captured points.
vi.mock('../../src/shell/font', () => ({
  layoutText: (text: string) =>
    text.toUpperCase() === K.PROBE
      ? { strokes: [{ points: [{ x: 0, y: 0 }, { x: K.CELL_W, y: 0 }] }], width: K.CELL_W }
      : { strokes: [], width: K.CELL_W * [...text].length },
  CELL_W: K.CELL_W,
  CELL_H: K.CELL_H,
  hasGlyph: () => true,
  charGlyph: () => ({ strokes: [], advance: K.CELL_H }),
  GLYPH_CHARS: ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-_,/',
}))

const W = 800
const H = 600

interface Pt {
  x: number
  y: number
  style: unknown
}

function makeCtx(pts: Pt[]): CanvasRenderingContext2D {
  const target: Record<string | symbol, unknown> = {
    canvas: { width: W, height: H },
    strokeStyle: '',
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    moveTo(x: number, y: number) {
      pts.push({ x, y, style: target.strokeStyle })
    },
    lineTo(x: number, y: number) {
      pts.push({ x, y, style: target.strokeStyle })
    },
  }
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p]
      return () => {}
    },
    set(t, p, v) {
      t[p] = v
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

/** A banner frame carrying exactly one crawl line, at `size`. Starfield emptied so no
 *  backdrop marks can drift into the capture. */
function bannerAt(size: number): GameState {
  return withExt(attractOn('banner'), {
    starfield: [],
    attract: { page: 'banner', pageAge: 6, crawl: [{ text: PROBE, size }] },
  })
}

/** Render one crawl line at `size` and recover the row y and the type size in px.
 *
 *  `glowText` traces the SAME geometry up to three times (two additive glow passes at
 *  different shadowBlur, then the core pass — render.ts:1353-1363), so the capture is
 *  N x 2 points. We assert every pass is geometrically identical before measuring: that
 *  is both a sanity check on the glow and a pollution detector, since anything else
 *  drawing in the crawl colour would break the uniformity rather than silently shift the
 *  numbers. */
function measure(size: number): { y: number; px: number } {
  const pts: Pt[] = []
  render(makeCtx(pts), bannerAt(size), W, H, [])
  const crawl = pts.filter((p) => p.style === CRAWL_GLOW)
  expect(crawl.length, `expected whole 2-point strokes in the crawl colour at size ${size}`)
    .toBeGreaterThanOrEqual(2)
  expect(crawl.length % 2, 'captured points must pair into moveTo/lineTo strokes').toBe(0)

  const passes: Pt[][] = []
  for (let i = 0; i < crawl.length; i += 2) passes.push([crawl[i], crawl[i + 1]])
  for (const p of passes) {
    expect(p[0].x, 'every glow pass must trace identical geometry').toBeCloseTo(passes[0][0].x, 6)
    expect(p[0].y, 'every glow pass must trace identical geometry').toBeCloseTo(passes[0][0].y, 6)
    expect(p[1].x, 'every glow pass must trace identical geometry').toBeCloseTo(passes[0][1].x, 6)
  }

  const [a, b] = passes[0]
  expect(a.y, 'the baseline stroke must be flat').toBeCloseTo(b.y, 6)
  return { y: a.y, px: (Math.abs(b.x - a.x) * CELL_H) / CELL_W }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sw7-10 F1 — the crawl RECEDES as `size` grows (TCMES.MAC:167 + :183 + :415)', () => {
  it('a newborn line (size 0) is drawn LARGER than a retiring one (size ~1)', () => {
    const born = measure(0)
    const retiring = measure(0.99)
    // Direction. Inverting `remaining = 1 - size` flips this and MUST redden.
    expect(
      born.px,
      'size 0 is BIRTH (near the viewer, large); size 1 is the vanishing point (small)',
    ).toBeGreaterThan(retiring.px)
  })

  it('a newborn line is drawn LOWER on screen than a retiring one', () => {
    const born = measure(0)
    const retiring = measure(0.99)
    // Screen y grows DOWNWARD, so "lower on screen" is a LARGER y.
    expect(born.y, 'the crawl is born low and recedes UP toward the vanishing point').toBeGreaterThan(
      retiring.y,
    )
  })

  it('both size and row decrease MONOTONICALLY across the whole life', () => {
    const samples = [0, 0.25, 0.5, 0.75, 0.99].map((s) => ({ s, ...measure(s) }))
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1]
      const cur = samples[i]
      expect(cur.px, `type size must shrink from size ${prev.s} to ${cur.s}`).toBeLessThan(prev.px)
      expect(cur.y, `the row must rise from size ${prev.s} to ${cur.s}`).toBeLessThan(prev.y)
    }
  })

  // ABSOLUTE endpoints, not just ordering. A ratio or a strict ordering is invariant to a
  // constant multiplier, so neither can catch a wrong linear coefficient — these bands can.
  // Deliberately generous (the px/row endpoints are shell tuning, not ROM constants), but
  // fatal to an inversion, to a collapsed range, or to a gross mis-scale.
  it('the newborn line sits at the BOTTOM of the screen and is legibly large', () => {
    const born = measure(0)
    expect(born.y, 'a newborn line enters at/below the bottom edge').toBeGreaterThan(H * 0.9)
    expect(born.px, 'a newborn line is large type').toBeGreaterThan(18)
  })

  it('the retiring line converges on the VANISHING POINT and is small', () => {
    const retiring = measure(0.99)
    expect(retiring.y, 'a retiring line is at the vanishing point, near screen centre').toBeGreaterThan(
      H * 0.35,
    )
    expect(retiring.y, 'a retiring line has not passed the vanishing point').toBeLessThan(H * 0.6)
    expect(retiring.px, 'a retiring line is small type').toBeLessThan(16)
  })

  it('the crawl spans a REAL range — it does not collapse to one size or one row', () => {
    const born = measure(0)
    const retiring = measure(0.99)
    // Guards the degenerate "both endpoints equal" implementation, which would satisfy
    // neither ordering assertion by failing them, but would satisfy a sloppier `>=` pair.
    expect(born.px - retiring.px, 'the type must visibly shrink').toBeGreaterThan(4)
    expect(born.y - retiring.y, 'the row must visibly travel').toBeGreaterThan(H * 0.25)
  })
})
