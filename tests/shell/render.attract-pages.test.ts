// tests/shell/render.attract-pages.test.ts
//
// sw7-10 RED — H-017: the INSTRUCTIONS and SCORING attract pages render (shell half).
//
// Ground truth (TCMES.MAC:553-581, verified firsthand; .RADIX 16 file, ASCII in <...>
// is literal text):
//   INSTRUCTIONS (MS.FLI..FLZ, RED): header <FLIGHT INSTRUCTIONS TO RED FIVE>, then a
//   numbered brief (<1.  YOUR X-WING IS EQUIPPED WITH AN> … <UP THE DEATH STAR.>).
//   SCORING (MS.SCR..SCZ, PURPLE): header <SCORING> then the per-enemy point table —
//   TIE FIGHTERS 1,000 / DARTH VADER'S SHIP 2,000 / LASER BUNKERS 200 / LASER TOWERS 200 /
//   TRENCH TURRETS 100 / FIREBALLS 33 / EXHAUST PORT 25,000 / DESTROYING ALL TOWER TOPS 50,000.
//
// Text asserted at the layoutText seam (the framing-prompts idiom): `texts()` is what
// render REQUESTED, captured before the font drops any glyph — so periods/apostrophes
// in the request survive even though the shared VGMSGA font blanks them on screen.
// render() draws the ONE static attract screen today regardless of page → neither page's
// copy appears → red.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '../../src/shell/render'
import { attractOn } from '../support/sw710-contract'

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

const texts = (): string[] => font.calls.map((c) => c.text)
/** Does any requested string contain `sub`? (Dev may pack name+value per ROM line.) */
const has = (sub: string): boolean => texts().some((t) => t.includes(sub))

beforeEach(() => {
  font.calls.length = 0
})

describe('sw7-10 H-017 — the SCORING page shows the ROM header + per-enemy point table', () => {
  it('renders SCORING and the eight authentic score rows', () => {
    render(makeCtx(), attractOn('scoring'), W, H, [])
    expect(has('SCORING')).toBe(true)
    // Names (tolerant of the apostrophe the font blanks) …
    expect(has('TIE FIGHTERS')).toBe(true)
    expect(has('LASER BUNKERS')).toBe(true)
    expect(has('LASER TOWERS')).toBe(true)
    expect(has('TRENCH TURRETS')).toBe(true)
    expect(has('FIREBALLS')).toBe(true)
    expect(has('EXHAUST PORT')).toBe(true)
    expect(has('DESTROYING ALL TOWER TOPS')).toBe(true)
    // … and their authentic values (TCMES.MAC:574-581).
    expect(has('1,000')).toBe(true) // TIE FIGHTERS
    expect(has('2,000')).toBe(true) // DARTH VADER'S SHIP
    expect(has('200')).toBe(true) //   LASER BUNKERS / TOWERS
    expect(has('100')).toBe(true) //   TRENCH TURRETS
    expect(has('33')).toBe(true) //    FIREBALLS
    expect(has('25,000')).toBe(true) // EXHAUST PORT
    expect(has('50,000')).toBe(true) // ALL TOWER TOPS
  })

  it('the scoring page is NOT the instructions page', () => {
    render(makeCtx(), attractOn('scoring'), W, H, [])
    expect(has('FLIGHT INSTRUCTIONS TO RED FIVE')).toBe(false)
  })
})

describe('sw7-10 H-017 — the INSTRUCTIONS page shows the ROM flight brief', () => {
  it('renders the header and representative brief lines', () => {
    render(makeCtx(), attractOn('instructions'), W, H, [])
    expect(has('FLIGHT INSTRUCTIONS TO RED FIVE')).toBe(true)
    expect(has('YOUR X-WING IS EQUIPPED WITH AN')).toBe(true) // line 1 (TCMES.MAC:554)
    expect(has('UP THE DEATH STAR')).toBe(true) //                closer   (TCMES.MAC:568)
  })

  it('the instructions page is NOT the scoring page', () => {
    render(makeCtx(), attractOn('instructions'), W, H, [])
    expect(has('SCORING')).toBe(false)
  })
})
