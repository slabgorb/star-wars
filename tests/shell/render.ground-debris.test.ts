// tests/shell/render.ground-debris.test.ts
//
// Story sw7-14 — R7b ground debris — RED phase (Han Solo / TEA). The RENDER half.
// Audit finding X-005: the tower/bunker destruction explosion draws each piece a
// scaled ground SHADOW — WHITE for towers, RED for bunkers.
//
// GROUND TRUTH — WSXPLD.MAC (verified against ~/Projects/star-wars-1983-source-text):
//   VWTWN: (:691) `LDA #VGCOLR&0FF00/100+VGCWHT`  — tower shadow is WHITE (VGCWHT)
//   VWBKN: (:695) `LDA #VGCOLR&0FF00/100+VGCRED`  — bunker shadow is RED  (VGCRED)
//   Both position the shadow on the ground (`LDD #0 / STD M.Z0 ;POSITION ON GROUND`,
//   :715-716) at the piece's x/y, scaled to match the ground (`LDA #72 ;SCALE DOWN
//   TO MATCH GRND`, :739). Colour is the SHELL's job (SM handoff: keep colour out of
//   core); the ballistics live in tests/core/ground-debris.test.ts.
//
// PER REPO CONVENTION (sw3-9 fireball, sw3-11 tower-fidelity) we pin colour FAMILY —
// red-dominant vs bright-neutral-white — not exact hex, and prove it by DIFFERENCE:
// render the post-kill frame WITH its debris vs the SAME frame with the debris
// stripped, everything else (grid, HUD, the now-removed object) identical. The only
// ink that can differ is the debris + its shadow, so a red/white surplus after a
// bunker/tower kill is unambiguously the explosion's. (Precisely isolating the
// ground SHADOW from the flying piece bodies is left to the eyeball / Reviewer; the
// finding's claim is that a bunker burst reads RED and a tower burst reads WHITE,
// which the family surplus captures.)
//
// SEAM-AGNOSTIC: we drive the real surface kill (fireAt) and step, so whatever
// representation Dev adds rides along; we read only public API (render, stepGame).
// The `groundDebris` field is unborn, so the strip helper casts (clean RED: with no
// debris ever spawned, WITH == WITHOUT and the surplus is 0 → the `>` assertions fail).

import { describe, it, expect } from 'vitest'
import { render } from '../../src/shell/render'
import { stepGame } from '../../src/core/sim'
import { initialState, SKIM_ALTITUDE, type GameState, type Turret } from '../../src/core/state'
import { NO_INPUT } from '../../src/core/input'
import { fireAt } from '../support/aim'
import type { Vec3 } from '@arcade/shared/math3d'

const W = 800
const H = 600
const DT = 0.02

type Seg = { x1: number; y1: number; x2: number; y2: number; color: string }

/** Canvas-context stub recording every stroked segment with its colour + screen
 *  position (render.enemy-fireball.test.ts, verbatim). */
function makeCtx() {
  const segments: Seg[] = []
  let pen: [number, number] = [0, 0]
  let curStroke = ''
  const ctx = {
    fillStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 0,
    font: '700 18px monospace',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    globalCompositeOperation: '',
    set strokeStyle(v: string) {
      curStroke = v
    },
    get strokeStyle() {
      return curStroke
    },
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo(x: number, y: number) {
      pen = [x, y]
    },
    lineTo(x: number, y: number) {
      segments.push({ x1: pen[0], y1: pen[1], x2: x, y2: y, color: curStroke })
      pen = [x, y]
    },
    arc() {},
    stroke() {},
    fill() {},
    save() {},
    restore() {},
    fillText() {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segments }
}

const strokes = (s: GameState): Seg[] => {
  const { ctx, segments } = makeCtx()
  render(ctx, s, W, H)
  return segments
}

// --- colour classifiers (render.surface-tower-fidelity.test.ts convention) -------
function rgb(c: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.trim())
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}
/** VGCRED: red-dominant. Rejects amber, cyan, steel, enemy-green, white. */
const isRed = (c: string): boolean => {
  const v = rgb(c)
  return !!v && v[0] >= 150 && v[1] <= 100 && v[2] <= 100
}
/** VGCWHT: all channels bright and near-equal. Rejects yellow (blue low) and red. */
const isWhite = (c: string): boolean => {
  const v = rgb(c)
  if (!v) return false
  const [r, g, b] = v
  return r >= 200 && g >= 200 && b >= 200 && Math.max(r, g, b) - Math.min(r, g, b) <= 55
}

const redCount = (segs: Seg[]): number => segs.filter((s) => isRed(s.color)).length
const whiteCount = (segs: Seg[]): number => segs.filter((s) => isWhite(s.color)).length

// --- the kill fixture (surface-bunkers.test.ts / core ground-debris) -------------
const SITE: Vec3 = [0, SKIM_ALTITUDE, -800]
const groundObject = (kind: 'tower' | 'bunker'): Turret => ({ pos: SITE, kind } as Turret)
const armedKill = (kind: 'tower' | 'bunker'): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'surface',
  turrets: [groundObject(kind)],
  surfaceMazeLaid: true,
  enemyShots: [],
  enemyFireCooldown: 999, // no maze fire to add stray ink
  fireCooldown: 0,
  firePrev: false,
})

/** Kill the object, then step a couple of frames so the debris is aloft and drawing. */
function afterKill(kind: 'tower' | 'bunker'): GameState {
  let s = stepGame(armedKill(kind), fireAt(armedKill(kind), SITE), DT)
  // Coast (trigger released) so the debris ages a beat without re-firing.
  for (let i = 0; i < 2; i++) s = stepGame(s, NO_INPUT, DT)
  return s
}

/** The SAME frame with the debris stripped — the no-explosion baseline. Everything
 *  else (grid, HUD, the removed object) is identical, so the colour surplus is the
 *  debris alone. Cast because `groundDebris` is not on GameState yet. */
const stripDebris = (s: GameState): GameState => ({ ...s, groundDebris: [] } as GameState)

describe('sw7-14 — the ground explosion draws a scaled shadow, RED for bunkers', () => {
  it('a bunker kill adds RED ground ink that the no-debris baseline lacks (VWBKN)', () => {
    const killed = afterKill('bunker')
    const withDebris = redCount(strokes(killed))
    const without = redCount(strokes(stripDebris(killed)))
    expect(withDebris).toBeGreaterThan(without) // RED: no debris → equal → fails
  })
})

describe('sw7-14 — the ground explosion draws a scaled shadow, WHITE for towers', () => {
  it('a tower kill adds WHITE ground ink that the no-debris baseline lacks (VWTWN)', () => {
    const killed = afterKill('tower')
    const withDebris = whiteCount(strokes(killed))
    const without = whiteCount(strokes(stripDebris(killed)))
    expect(withDebris).toBeGreaterThan(without)
  })

  it('and a tower burst is not RED (white shadow, not the bunker red)', () => {
    // Guards the two apart: a tower explosion must not paint the bunker's red shadow.
    const killed = afterKill('tower')
    const redSurplus = redCount(strokes(killed)) - redCount(strokes(stripDebris(killed)))
    expect(redSurplus).toBeLessThanOrEqual(0)
  })
})

describe('sw7-14 — the debris is VISIBLE and BOUNDED (seam-agnostic segment count)', () => {
  const segCount = (s: GameState): number => strokes(s).length

  it('a kill leaves extra geometry on screen — it does not just vanish', () => {
    const killed = afterKill('bunker')
    // A whole explosion's worth of edges vs the same frame with debris stripped.
    expect(segCount(killed)).toBeGreaterThan(segCount(stripDebris(killed)))
  })
})

describe('sw7-14 — colour classifier self-checks (guard the guard)', () => {
  it('the red/white classifiers reject each other and the surface palette', () => {
    const red = '#ff3b30' // VGCRED (cabinet)
    const white = '#f4f4ff' // VGCWHT (render.ts CAP_GLOW)
    const yellow = '#ffd60a' // VGCYLW tower body
    const steel = '#5a6b8c' // the grid
    expect(isRed(red)).toBe(true)
    expect(isRed(white)).toBe(false)
    expect(isRed(yellow)).toBe(false)
    expect(isRed(steel)).toBe(false)
    expect(isWhite(white)).toBe(true)
    expect(isWhite(red)).toBe(false)
    expect(isWhite(yellow)).toBe(false)
    expect(isWhite(steel)).toBe(false)
  })
})
