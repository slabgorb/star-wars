// tests/shell/render.death-star-finale.test.ts
//
// Story sw7-15 — RED phase (Han Solo / TEA). The Death Star FINALE, three findings:
//
//   X-006 (DIVERGENCE, CONFIRMED, pair-explosions.json): the ROM finale (VWXPLN →
//     XP.PH0..PH3) is a FOUR-PHASE concentric-circle / expanding-ring sequence that
//     cycles colour RED → BLUE → WHITE (WSXPLD.MAC:817 VGCRED, :839 VGCBLU, :898
//     VGCWHT, :970 VGCWHT), built ONLY from circles (DCIRCL) and smooth rings
//     (DRING) — NO rays. Ours (drawDeathStarBoom, render.ts:601) is a SINGLE amber
//     '#ffdd66', 3 rings PLUS a 16-ray starburst (BOOM_RAYS) with no ROM counterpart.
//
//   X-008 (DIVERGENCE, CONFIRMED): the finale length is ROM-defined by counter
//     arithmetic, not "no ROM timing exists" — PH1/PH2/PH3 step XP.CNT 31/27/31 =
//     ~89 frames ≈ 4.3 s at the 20.508 Hz game frame (X-008 refutation), materially
//     longer than our DEATH_STAR_BOOM_SECONDS = 2.5 (render.ts:887).
//
//   X-007 (NO_COUNTERPART): before the rings the ROM plays a PRELIM (PH$DX1): the
//     Death Star is seeded "AT VERY LARGE" and VWDTHB draws it ENLARGING toward the
//     viewer (WSMAIN.MAC:3386) while the end music starts; only then do the rings
//     begin. Ours has no loom — the winning kill warps STRAIGHT to the next wave's
//     far space seed (phaseKills 0 ⇒ far-small), then plays a centred boom.
//
// SEAM-AGNOSTIC. The boom is the shell effect off the persisted `deathStarDestroyedAt`
// stamp (sw2-4); we drive it two ways: X-006/X-008 sweep the stamp age directly to
// isolate the ring animation from the next wave's chaos; X-007 drives the REAL
// winning kill (exhaust-port-outcome idiom) so it observes whatever finale sequencing
// Dev builds. We read strokes by COLOUR FAMILY + geometry (not exact hex / vertices).
//
// The boom is centred; every current green/red HUD stroke is the top strip (y ≤ 100),
// so a central region (near screen centre, y ≥ 110) + the finale palette
// {amber,red,blue,white} isolates the rings from the HUD and from the far-small body.

import { describe, it, expect } from 'vitest'
import { render } from '../../src/shell/render'
import { stepGame } from '../../src/core/sim'
import { initialState, type GameState } from '../../src/core/state'
import { NO_INPUT } from '../../src/core/input'
import type { Vec3 } from '@arcade/shared/math3d'
import {
  makeRecorder,
  colorFamily,
  isRadialRay,
  maxStrokeRadius,
  type Stroke,
  type ColorFamily,
} from '../support/canvas-recorder'

const W = 800
const H = 600
const CX = W / 2
const CY = H / 2

// ROM finale frame count / seconds (X-008 refutation: PH1+PH2+PH3 = 31+27+31 = 89
// frames at 20.508 Hz). The exact figure is routed to a Delivery Finding + the
// citation gate; here we pin the OBSERVABLE band around it.
const GAME_HZ = 20.508
const FINALE_FRAMES = 89
const FINALE_SECONDS = FINALE_FRAMES / GAME_HZ // ≈ 4.34 s
const OLD_BOOM_SECONDS = 2.5

const FINALE_PALETTE: ColorFamily[] = ['amber', 'red', 'blue', 'white']

/** A finale frame: the winning-shot stamp aged `age` seconds, quiet space around it. */
function finaleFrame(age: number): GameState {
  return {
    ...initialState(1983),
    mode: 'playing',
    phase: 'space',
    phaseKills: 0, // the kill warped to the next wave's far seed
    enemies: [],
    dyingTies: [],
    enemyShots: [],
    deathStarDestroyedAt: 0,
    t: age,
  }
}

function segPoints(s: Stroke): [number, number][] {
  const pts: [number, number][] = []
  for (const [x0, y0, x1, y1] of s.segs) pts.push([x0, y0], [x1, y1])
  return pts
}

/**
 * The screen-centre quadrants a stroke's points touch. A concentric ring or a
 * radial starburst touches all four; the "DEATH STAR DESTROYED" banner (a
 * horizontal text strip in one band) touches at most two — so ">= 3 quadrants"
 * separates the finale STRUCTURE (rings + rays, both centred on the blast) from
 * the banner text and HUD that share the same `deathStarDestroyedAt` gate.
 */
function quadrantsAround(pts: [number, number][]): Set<number> {
  const q = new Set<number>()
  for (const [x, y] of pts) {
    const dx = x - CX
    const dy = y - CY
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) continue
    q.add((dx < 0 ? 0 : 1) + (dy < 0 ? 0 : 2))
  }
  return q
}

/** A stroke that is centred on the blast — a ring (arc or loop) or the ray fan. */
function centredOnBlast(s: Stroke): boolean {
  if (s.arcs.some((a) => Math.hypot(a.cx - CX, a.cy - CY) < 80 && a.r > 8)) return true
  return quadrantsAround(segPoints(s)).size >= 3
}

/** A concentric RING: a centred arc, or a roughly-circular centred loop of segments. */
function isRing(s: Stroke): boolean {
  if (s.arcs.some((a) => Math.hypot(a.cx - CX, a.cy - CY) < 80 && a.r > 8)) return true
  const radii = segPoints(s)
    .map(([x, y]) => Math.hypot(x - CX, y - CY))
    .filter((r) => r > 5)
  if (radii.length < 8 || quadrantsAround(segPoints(s)).size < 3) return false
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length
  const spread = Math.max(...radii) - Math.min(...radii)
  return mean > 25 && spread < 0.5 * mean // clustered radius ⇒ circular, not radial
}

/** The colour families of the finale RINGS at a given blast age (banner/HUD excluded). */
function ringFamilies(age: number): Set<ColorFamily> {
  const rec = makeRecorder()
  render(rec.ctx, finaleFrame(age), W, H)
  return new Set(rec.strokes().filter((s) => s.alpha > 0.01 && isRing(s)).map((s) => colorFamily(s.style)))
}

/** Radial RAY segments emanating from near the blast centre (the starburst). */
function raySegments(age: number): [number, number, number, number][] {
  const rec = makeRecorder()
  render(rec.ctx, finaleFrame(age), W, H)
  return rec
    .strokes()
    .filter((s) => s.alpha > 0.01 && centredOnBlast(s) && !isRing(s))
    .flatMap((s) => s.segs)
    .filter((seg) => {
      if (!isRadialRay(seg, CX, CY)) return false
      const rIn = Math.min(Math.hypot(seg[0] - CX, seg[1] - CY), Math.hypot(seg[2] - CX, seg[3] - CY))
      const rOut = Math.max(Math.hypot(seg[0] - CX, seg[1] - CY), Math.hypot(seg[2] - CX, seg[3] - CY))
      return rIn < 80 && rOut > 60 // a real ray: near the centre out to a far radius
    })
}

/** The finale is still animating at this age when it draws any centred ring. */
function boomActive(age: number): boolean {
  const rec = makeRecorder()
  render(rec.ctx, finaleFrame(age), W, H)
  return rec.strokes().some((s) => s.alpha > 0.01 && isRing(s) && FINALE_PALETTE.includes(colorFamily(s.style)))
}

describe('sw7-15 / X-006 — the finale cycles RED → BLUE → WHITE concentric rings, no rays', () => {
  it('paints red, then blue, then white over the animation — never a single amber blast', () => {
    // Sweep the whole (post-fix) finale span and record when each RING colour first
    // appears (banner text + HUD are excluded — they are not centred rings).
    const first: Partial<Record<ColorFamily, number>> = {}
    for (let age = 0; age <= FINALE_SECONDS + 0.5; age += 0.05) {
      for (const fam of ringFamilies(age)) if (first[fam] === undefined) first[fam] = age
    }
    // All three ROM ring colours appear…
    expect(first.red).toBeDefined()
    expect(first.blue).toBeDefined()
    expect(first.white).toBeDefined()
    // …in the ROM order PH0/PH1 red → PH2 blue → PH3 white.
    expect(first.red!).toBeLessThan(first.blue!)
    expect(first.blue!).toBeLessThan(first.white!)
    // and the stand-in amber never rings.
    expect(first.amber).toBeUndefined()
  })

  it('is built from concentric rings, with NO radial ray starburst', () => {
    // A mid-animation frame where the rings are well developed.
    expect(ringFamilies(0.5).size).toBeGreaterThan(0) // the finale IS drawing rings
    expect(raySegments(0.5).length).toBe(0) // BOOM_RAYS=16 ⇒ RED today
  })

  it('never paints a finale ring in the stand-in amber (#ffdd66)', () => {
    const rec = makeRecorder()
    render(rec.ctx, finaleFrame(0.5), W, H)
    const amberRings = rec.strokes().filter((s) => s.alpha > 0.01 && isRing(s) && s.style.toLowerCase() === '#ffdd66')
    expect(amberRings.length).toBe(0)
  })
})

describe('sw7-15 / X-008 — the finale lasts ~89 frames / ~4.3 s, well past the old 2.5 s', () => {
  it('is still animating past the old 2.5 s cut-off', () => {
    expect(boomActive(OLD_BOOM_SECONDS + 0.1)).toBe(true) // 2.6 s: dead today (2.5 s cap)
    expect(boomActive(3.5)).toBe(true)
  })

  it('runs to about the ROM 4.3 s and then clears', () => {
    expect(boomActive(FINALE_SECONDS - 0.3)).toBe(true) // ~4.0 s: still going
    expect(boomActive(FINALE_SECONDS + 1.0)).toBe(false) // ~5.3 s: done
  })
})

describe('sw7-15 / X-007 — a looming-station prelim enlarges the Death Star before the rings', () => {
  // Body strokes: the Death Star picture itself (green / steel), NOT the finale rings.
  const NON_BODY: ColorFamily[] = ['amber', 'red', 'blue', 'white', 'cyan']
  function bodyStrokes(state: GameState): Stroke[] {
    const rec = makeRecorder()
    render(rec.ctx, state, W, H)
    return rec.strokes().filter(
      (s) =>
        s.alpha > 0.01 &&
        !NON_BODY.includes(colorFamily(s.style)) &&
        segPoints(s).some(([x, y]) => Math.hypot(x - CX, y - CY) < 360 && y >= 110 && y <= 500),
    )
  }
  const bodyFootprint = (state: GameState): number => maxStrokeRadius(bodyStrokes(state), CX, CY)

  it('looms the station large — bigger than a fresh far seed — during the finale', () => {
    // The far seed the winning kill currently warps to (phaseKills 0).
    const farSeed = bodyFootprint({
      ...initialState(1983),
      mode: 'playing',
      phase: 'space',
      phaseKills: 0,
      enemies: [],
      dyingTies: [],
      enemyShots: [],
      deathStarDestroyedAt: null,
    })
    expect(farSeed).toBeGreaterThan(0) // sanity: the body renders

    // Drive the REAL winning kill (exhaust-port-outcome idiom): an armed run with the
    // port in the $800 window resolves on the next micro-step.
    const won: GameState = {
      ...initialState(1983),
      phase: 'trench',
      exhaustPort: { pos: [0, 0, -300] as Vec3 },
      portTorpedoArmed: true,
      trenchShotsFired: 2,
    }
    let s = stepGame(won, NO_INPUT, 1 / 60)
    expect(s.deathStarDestroyedAt).not.toBeNull() // the kill actually landed

    // Over the finale window, the station should LOOM: at some frame the body is
    // drawn markedly larger than the far seed (the ROM's "AT VERY LARGE" enlarge).
    let peak = bodyFootprint(s)
    for (let f = 0; f < 90 && s.mode === 'playing'; f++) {
      s = stepGame(s, NO_INPUT, 1 / 60)
      peak = Math.max(peak, bodyFootprint(s))
    }
    // Today the kill snaps to the far seed and never enlarges ⇒ peak ≈ farSeed ⇒ RED.
    expect(peak).toBeGreaterThan(farSeed * 1.5)
  })
})
