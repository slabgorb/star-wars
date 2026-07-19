// tests/shell/render.death-star-picture.test.ts
//
// Story sw7-15 — RED phase (Han Solo / TEA). Finding M-010 (pair-models.json,
// CONFIRMED): the space-phase Death Star is a procedurally-generated 3D UV sphere
// drawn in ONE steel-grey hull colour (#8a93a8, GLOW_FOR['Death Star']); the ROM
// draws an authentic 2D vector PICTURE — a GREEN disc (BSHEM/BSCIR, VGCGRN,
// radius 50), a WHITE equatorial trench chord (BSTRN, VGCWHT, `AOFF 49,10 / AON
// -49,-9`), a RED superlaser dish (BSDSH/BSNSD, VGCRED, an offset ~9-radius loop),
// and GREEN farmland hatching (BSFRM) — scaled by the AVG picture factor M.=32 as
// the player closes (WSVROM.MAC:2449 ".SBTTL DEATH STAR PICS").
//
// SEAM-AGNOSTIC BY CONSTRUCTION. M-010 is a draw-ARCHITECTURE change: a Model3D
// carries no colour, so a faithful port cannot stay one single-glow sphere. HOW
// the multi-colour picture is represented — a colour field on the model, three
// sub-models, or a dedicated picture draw — is Dev's to decide (Delivery Finding).
// We therefore never touch models.ts internals here; we drive the PUBLIC
// `render(ctx, state, w, h)` on a space frame and read the strokes it paints. Any
// representation that draws the authentic green-body / white-trench / red-dish
// palette passes; the current single-steel sphere fails.
//
// ISOLATION (calibrated against the current frame, /tmp probe): at phaseKills =
// SPACE_WAVE_QUOTA the Death Star projects to the CENTRAL disc (radius ≤ ~200 of
// screen centre, y 102–498). Every current green/red stroke is HUD in the TOP
// STRIP (y ≤ 100): the shield gauge + value text green (#22e600) and the SCORE/
// WAVE labels red (#ff2222). Excluding y < 110 and staying near centre isolates
// the Death Star from the HUD, so the palette assertions bite on today's code.
//
// Colour is asserted by FAMILY, not exact hex (repo convention "colour-family +
// topology, not pixels", sw3-9) — Dev picks the VGCGRN/VGCWHT/VGCRED hexes.

import { describe, it, expect } from 'vitest'
import { render } from '../../src/shell/render'
import { DEATH_STAR } from '../../src/core/models'
import { initialState, SPACE_WAVE_QUOTA, type GameState } from '../../src/core/state'
import {
  makeRecorder,
  colorFamily,
  type Stroke,
  type ColorFamily,
} from '../support/canvas-recorder'

const W = 800
const H = 600
const CX = W / 2
const CY = H / 2

// The old single hull colour the picture must replace (render.ts:99 / wireframe.ts:31).
const OLD_HULL_HEX = '#8a93a8'

/** A static, quiet space frame with the Death Star at its closest (largest) approach. */
function spaceFrame(over: Partial<GameState> = {}): GameState {
  return {
    ...initialState(1983),
    mode: 'playing',
    phase: 'space',
    phaseKills: SPACE_WAVE_QUOTA, // closest approach ⇒ biggest, easiest to read
    enemies: [],
    dyingTies: [],
    enemyShots: [],
    deathStarDestroyedAt: null, // no finale boom — just the body picture
    ...over,
  }
}

/** All points (segment endpoints + arc centres) of a stroke. */
function pointsOf(s: Stroke): [number, number][] {
  const pts: [number, number][] = []
  for (const [x0, y0, x1, y1] of s.segs) pts.push([x0, y0], [x1, y1])
  for (const a of s.arcs) pts.push([a.cx, a.cy])
  return pts
}

/** Central Death-Star region: near screen centre, clear of the top HUD strip. */
function inBodyRegion(x: number, y: number): boolean {
  return Math.hypot(x - CX, y - CY) < 300 && y >= 110 && y <= 500
}

/** A stroke counts toward the Death Star if any of its points sit in the body region. */
function isBodyStroke(s: Stroke): boolean {
  if (s.alpha <= 0.01) return false
  return pointsOf(s).some(([x, y]) => inBodyRegion(x, y))
}

function bodyStrokes(state: GameState): Stroke[] {
  const rec = makeRecorder()
  render(rec.ctx, state, W, H)
  return rec.strokes().filter(isBodyStroke)
}

function familiesOf(strokes: Stroke[]): Set<ColorFamily> {
  return new Set(strokes.map((s) => colorFamily(s.style)))
}

describe('sw7-15 / M-010 — the space-phase Death Star is the authentic multi-colour vector picture', () => {
  it('paints the authentic GREEN + WHITE + RED palette, not a single steel hull colour', () => {
    const fams = familiesOf(bodyStrokes(spaceFrame()))
    // BSHEM/BSCIR green body, BSTRN white trench, BSDSH red dish — all three present.
    expect(fams.has('green')).toBe(true)
    expect(fams.has('white')).toBe(true)
    expect(fams.has('red')).toBe(true)
  })

  it('no longer draws the Death Star body as the single steel hull colour (#8a93a8)', () => {
    const strokes = bodyStrokes(spaceFrame())
    const steelHull = strokes.filter((s) => s.style.toLowerCase() === OLD_HULL_HEX)
    expect(steelHull.length).toBe(0)
  })

  it('draws a WHITE equatorial trench as a straight chord spanning most of the disc (BSTRN)', () => {
    const strokes = bodyStrokes(spaceFrame())
    const white = strokes.filter((s) => colorFamily(s.style) === 'white')
    expect(white.length).toBeGreaterThan(0)

    // The disc diameter, from the widest green body stroke (the authentic circle r=50).
    const green = strokes.filter((s) => colorFamily(s.style) === 'green')
    const greenPts = green.flatMap(pointsOf)
    const discSpan = greenPts.length
      ? Math.max(...greenPts.map(([x]) => x)) - Math.min(...greenPts.map(([x]) => x))
      : 0
    expect(discSpan).toBeGreaterThan(0)

    // Some white stroke is a wide, roughly-straight chord (a trench LINE across the
    // disc), not a small tick or a ring: its horizontal span is a large fraction of
    // the disc AND clearly exceeds its vertical span. Orientation-tolerant enough to
    // accept the near-horizontal ROM trench without pinning an exact tilt.
    const chord = white.some((s) => {
      const pts = pointsOf(s)
      if (pts.length < 2) return false
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      const spanX = Math.max(...xs) - Math.min(...xs)
      const spanY = Math.max(...ys) - Math.min(...ys)
      return spanX >= 0.55 * discSpan && spanX > spanY * 2
    })
    expect(chord).toBe(true)
  })

  it('draws a RED superlaser dish as a small loop OFFSET from the disc centre (BSDSH)', () => {
    const strokes = bodyStrokes(spaceFrame())
    const red = strokes.filter((s) => colorFamily(s.style) === 'red')
    expect(red.length).toBeGreaterThan(0)

    const redPts = red.flatMap(pointsOf)
    const rcx = redPts.reduce((a, p) => a + p[0], 0) / redPts.length
    const rcy = redPts.reduce((a, p) => a + p[1], 0) / redPts.length
    const dishSpan = Math.max(...redPts.map(([x]) => x)) - Math.min(...redPts.map(([x]) => x))

    // A green disc to size the dish against.
    const greenPts = strokes.filter((s) => colorFamily(s.style) === 'green').flatMap(pointsOf)
    const discSpan = greenPts.length
      ? Math.max(...greenPts.map(([x]) => x)) - Math.min(...greenPts.map(([x]) => x))
      : Infinity

    // The dish is OFF-centre (BSDSH sits at picture ~(22,27), never at the origin)…
    expect(Math.hypot(rcx - CX, rcy - CY)).toBeGreaterThan(10)
    // …and SMALL: a dish, not the whole body.
    expect(dishSpan).toBeLessThan(0.6 * discSpan)
  })
})

describe('sw7-15 / M-010 — the body circle (BSCIR) is a smooth loop, no transcription kink', () => {
  // The seam-agnostic palette/span tests above cannot see a WRONG POINT ORDER — a
  // pair of swapped vertices leaves the disc's x/y span unchanged but crosses one
  // rim edge over its neighbour (a kink). A radius-50 circle traversed in ROM order
  // winds ONE way, so every consecutive step must turn the SAME direction; a swap
  // flips one step's sign. This pins the BSCIR sequence against exactly that class
  // of error (caught in review: indices 26/27 were (-50,0),(-49,10) instead of
  // (-49,10),(-50,0), a self-crossing on the left rim).
  it('winds monotonically around the centre — every rim step turns the same way', () => {
    const v = DEATH_STAR.vertices
    expect(v.length).toBeGreaterThanOrEqual(8)
    // Signed turn from vertex i to i+1 about the origin (the picture is centred there).
    const cross = (a: readonly number[], b: readonly number[]): number => a[0] * b[1] - a[1] * b[0]
    let pos = 0
    let neg = 0
    for (let i = 0; i < v.length; i++) {
      const a = v[i]
      const b = v[(i + 1) % v.length]
      const c = cross(a, b)
      if (c > 1e-6) pos++
      else if (c < -1e-6) neg++
    }
    // A convex loop in ROM order: all turns one sign, none the other. A swapped
    // pair produces at least one opposite-sign step.
    expect(Math.min(pos, neg)).toBe(0)
    expect(Math.max(pos, neg)).toBe(v.length)
  })
})
