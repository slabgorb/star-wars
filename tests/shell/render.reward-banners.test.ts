// tests/shell/render.reward-banners.test.ts
//
// Story sw7-4 (R4) — RED phase, shell half. Two authentic REWARD banners the
// 1983 cabinet draws that the clone does not:
//
//   S-013  the per-surviving-shield bonus banner MS.BRE — "BONUS FOR REMAINING
//          ENERGY" over "5,000  X <shields>" (TCMES.MAC:611-612), shown in the
//          end-of-wave VEWNXT sequence right after DEATH STAR DESTROYED
//          (WSMAIN.MAC:3305-3308).
//   H-021  the all-towers reward banner MS.RWD — "50,000 FOR SHOOTING ALL TOWERS"
//          (TCMES.MAC:609, ROM:E039), swapped in by VWMTWR when the towers-left
//          count hits zero (WSMAIN.MAC:3505-3510). Its `tower-bonus` scoring event
//          already exists in core (events.ts); only the banner is missing.
//
// These are DISTINCT banners (the story description conflated them; the ROM does
// not — see the TEA deviation log). Both dwell off a state stamp, exactly like the
// existing "Use the Force" / "DEATH STAR DESTROYED" banners
// (render.ts drawTrenchBanners, keyed on forceBonusAwardedAt / deathStarDestroyedAt).
//
// The `*BonusAwardedAt` stamps are added to GameState by Dev in GREEN; the render
// draws no such banner today, so `texts()` lacks the strings -> RED. We assert the
// string handed to layoutText (the SH2-5 seam convention), not glyph geometry.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '../../src/shell/render'
import { initialState, type GameState } from '../../src/core/state'

// Record the strings handed to layoutText; return trivial-but-valid geometry so
// render strokes without NaN and without the shared font package resolving.
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

/** Proxy ctx: every method no-ops, every property settable; measureText width 0. */
function makeCtx(): CanvasRenderingContext2D {
  const target: Record<string | symbol, unknown> = { canvas: { width: W, height: H } }
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'measureText') return () => ({ width: 0 })
      if (prop in t) return t[prop]
      return () => {}
    },
    set(t, prop, value) {
      t[prop] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

const texts = () => font.calls.map((c) => c.text)

/** A won-run trench frame carrying the reward stamps under test (shieldBonusAwardedAt /
 *  towerBonusAwardedAt are real GameState fields, so a plain Partial override suffices —
 *  same pattern as the sibling core fixtures). */
const rewarded = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'trench',
  wave: 2,
  lives: 4,
  trenchScrollZ: 0,
  exhaustPort: null,
  t: 1,
  ...over,
})

beforeEach(() => {
  font.calls.length = 0
})

describe('sw7-4 — reward banners flow through layoutText', () => {
  it('S-013: the per-shield bonus shows the authentic "BONUS FOR REMAINING ENERGY" banner (MS.BRE)', () => {
    render(makeCtx(), rewarded({ shieldBonusAwardedAt: 0.5 }), W, H, [])
    expect(texts()).toContain('BONUS FOR REMAINING ENERGY')
    // "5,000  X <shields>" — the per-unit value appears (exact "X N" spacing is an
    // eyeball concern per the repo's colour-family/topology convention).
    expect(texts().some((t) => t.includes('5,000'))).toBe(true)
  })

  it('H-021: clearing every tower shows the "50,000 FOR SHOOTING ALL TOWERS" banner (MS.RWD, ROM:E039)', () => {
    render(makeCtx(), rewarded({ towerBonusAwardedAt: 0.5 }), W, H, [])
    expect(texts()).toContain('50,000 FOR SHOOTING ALL TOWERS')
  })
})
