// tests/shell/render.enemy-fireball-animation.test.ts
//
// Story sw3-11 — the enemy fireball SPARKLE ANIMATES (RED phase).
//
// sw3-9 pinned the authentic red centre-radiating sparkle but shipped ONE static
// frame (GNB0). The 1983 cabinet draws the gunshot as a FOUR-frame flicker with
// rounded fuse-ball tips — a frozen red asterisk reads as decoration, not live
// fire. This story adds the two things sw3-9 deferred ("Fuse-ball tips + the
// 4-frame flicker are eyeball follow-ons, unpinned." — render.ts:506).
//
// Authentic source — the ORIGINAL Atari source (the local reference/disasm has
// only the draw routine + a JSRL picture address; the AVG picture geometry is not
// in it). github historicalsource/star-wars ("Warp Speed", commit 5355b76)
// `WSVROM.MAC`, `.SBTTLE GUNSHOT PICTURES` — "GUN SHOTS -- SPARKLES WITH FUSE
// BALLS":
//
//   * base sparkle `GNB0`, `GNB1`, `GNB2`, `GNB3` — FOUR distinct spike patterns
//     (`CXY 0,0` → `AON dx,dy` spikes), cycled as an animation. The four frames'
//     spike deltas differ frame-to-frame — the sparkle visibly flickers/rotates.
//   * tip fuse-ball `GNT0-3` (drawn by the `FUSE` macro → `JSRL VRGNT`): a small
//     cluster of SHORT vectors AT each spike's outer tip, away from the centre.
//   * `ASPECT` → round envelope; `COLOR VGCRED` → red (unchanged from sw3-9).
//
// What we pin (TOPOLOGY, per repo convention — exact hue/spike-count/frame-timing
// stay an eyeball concern, as sw3-9 established):
//   1. It ANIMATES — the red sparkle geometry is NOT constant over the shot's
//      life; it takes on ≥2 distinct configurations. (Today: one fixed table →
//      always identical → FAILS.)
//   2. It has FUSE-BALL tip detail — short marks at the spike tips, off the
//      centre. (Today: every red stroke is a bare centre→tip spike, nothing at
//      the tips → FAILS.)
//   3. Invariant preserved (guard): every animated frame stays a red,
//      centre-anchored sparkle with no amber bleeding into the body — the sw3-9
//      contract must survive the animation.
//
// Seam-agnostic: the SM handoff left the frame-driver open (shot age/`ttl`
// threaded into drawFireball, OR a shell-owned animation clock). These tests drive
// the PUBLIC `render(ctx, state, w, h)` across a sweep of shot `ttl` values — which
// surfaces variation under EITHER driver — and never name the mechanism.

import { describe, it, expect } from 'vitest'
import { render } from '../../src/shell/render'
import { initialState, ENEMY_SHOT_TTL, type GameState, type Projectile } from '../../src/core/state'
import type { Vec3 } from '@arcade/shared/math3d'

interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}
interface Dot {
  x: number
  y: number
  r: number
  color: string
}

/** Canvas-context stub recording every stroked segment AND every arc (a fuse ball
 *  may be drawn either as short vectors or as a small arc dot — accept both). */
function makeCtx() {
  const segments: Seg[] = []
  const dots: Dot[] = []
  let pen: [number, number] = [0, 0]
  let curStroke = ''
  let curFill = ''
  const ctx = {
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
    set fillStyle(v: string) {
      curFill = v
    },
    get fillStyle() {
      return curFill
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
    arc(x: number, y: number, r: number) {
      // A fuse ball drawn as a filled/stroked dot — record with whichever ink is
      // currently red (fill for a filled dot, stroke for an outlined one).
      dots.push({ x, y, r, color: isRed(curFill) ? curFill : curStroke })
    },
    stroke() {},
    fill() {},
    save() {},
    restore() {},
    fillText() {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, segments, dots }
}

const W = 800
const H = 600
const CENTER: [number, number] = [W / 2, H / 2]
const OLD_AMBER = '#ffd60a' // the amber the fireball body must never wear

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)

/** Parse #rrggbb → [r,g,b]; non-hex colours read as black (excluded by isRed). */
function rgb(c: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.trim())
  if (!m) return [0, 0, 0]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}
// Red-dominant vector ink: strong red, weak green+blue. Accepts VGCRED-family reds
// (#ff0000, cabinet #ff3b30) and REJECTS amber #ffd60a, cyan crosshair, grey.
const isRed = (c: string): boolean => {
  const [r, g, b] = rgb(c)
  return r >= 150 && g <= 100 && b <= 100
}

/** A "playing" space scene with nothing but the fireball under test. */
const scene = (over: Partial<GameState>): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  enemies: [],
  enemyShots: [],
  projectiles: [],
  ...over,
})

/** A fireball with an explicit ttl (its remaining life). elapsed = TTL - ttl is
 *  the shot's age — the same quantity render() already uses to time the muzzle
 *  flash — so varying ttl advances any age-driven animation. */
const fireballAt = (pos: Vec3, ttl: number): Projectile => ({ pos, vel: [0, 0, 1], ttl })

// The fireball projects to a compact region around its screen point; the playing
// HUD also strokes red ink but sits far away at the top. Restrict every red check
// to this window so HUD red can never satisfy a fireball assertion.
const FIREBALL_WINDOW = 120
const nearShot = (s: Seg, cx: number, cy: number) =>
  dist(s.x1, s.y1, cx, cy) <= FIREBALL_WINDOW || dist(s.x2, s.y2, cx, cy) <= FIREBALL_WINDOW
const redNearShot = (segs: ReadonlyArray<Seg>, cx: number, cy: number): Seg[] =>
  segs.filter((s) => isRed(s.color) && nearShot(s, cx, cy))
const amberNearShot = (segs: ReadonlyArray<Seg>, cx: number, cy: number): Seg[] =>
  segs.filter(
    (s) => s.color === OLD_AMBER && (dist(s.x1, s.y1, cx, cy) <= 60 || dist(s.x2, s.y2, cx, cy) <= 60),
  )

// A stroke with an endpoint AT the projected centre — the mark of a sparkle spike
// (`AON 0,0` → `AON dx,dy`). Fuse balls sit at the OUTER tips and touch neither.
const AT_CENTRE_TOL = 4
const atCentre = (s: Seg, cx: number, cy: number) =>
  dist(s.x1, s.y1, cx, cy) <= AT_CENTRE_TOL || dist(s.x2, s.y2, cx, cy) <= AT_CENTRE_TOL
const centreSpikes = (segs: ReadonlyArray<Seg>, cx: number, cy: number): Seg[] =>
  redNearShot(segs, cx, cy).filter((s) => atCentre(s, cx, cy))

/** The sparkle's outer radius for a frame — farthest red endpoint from centre. */
const redRadius = (segs: ReadonlyArray<Seg>, cx: number, cy: number): number =>
  Math.max(1, ...redNearShot(segs, cx, cy).flatMap((s) => [dist(s.x1, s.y1, cx, cy), dist(s.x2, s.y2, cx, cy)]))

// Fuse-ball marks in a frame: SHORT red marks at the OUTER tips that do NOT touch
// the centre. Counts (a) short off-centre red segments — a bare radial spike, even
// if split into pieces, has an endpoint at the centre or is long, so it does NOT
// qualify; (b) off-centre red arc dots. Today: 0 (only full-length centre spikes).
const fuseMarks = (
  segments: ReadonlyArray<Seg>,
  dots: ReadonlyArray<Dot>,
  cx: number,
  cy: number,
): number => {
  const r = redRadius(segments, cx, cy)
  const shortSegs = redNearShot(segments, cx, cy).filter(
    (s) => !atCentre(s, cx, cy) && dist(s.x1, s.y1, s.x2, s.y2) <= 0.4 * r,
  )
  const tipDots = dots.filter(
    (d) => isRed(d.color) && dist(d.x, d.y, cx, cy) > AT_CENTRE_TOL && dist(d.x, d.y, cx, cy) <= FIREBALL_WINDOW,
  )
  return shortSegs.length + tipDots.length
}

/** A frame's red geometry as a sortable, position-normalised signature (rounded to
 *  the pixel, relative to the shot centre). Two frames with the same signature drew
 *  the same shape; different signatures mean the sparkle changed. */
const frameSignature = (segments: ReadonlyArray<Seg>, cx: number, cy: number): string =>
  redNearShot(segments, cx, cy)
    .map((s) =>
      [Math.round(s.x1 - cx), Math.round(s.y1 - cy), Math.round(s.x2 - cx), Math.round(s.y2 - cy)].join(','),
    )
    .sort()
    .join('|')

// Sweep the shot's AGED life — elapsed strictly past any muzzle-flash window
// (elapsed > 0.2), so every sample is the fireball BODY only, no amber flash. ttl
// runs from nearly-full down to nearly-spent across 24 evenly-spaced samples.
const SAMPLES = 24
const AGED_TTLS = Array.from({ length: SAMPLES }, (_, i) => 0.2 + ((ENEMY_SHOT_TTL - 0.4) * i) / (SAMPLES - 1))

const renderAt = (ttl: number) => {
  const rec = makeCtx()
  render(rec.ctx, scene({ enemyShots: [fireballAt([0, 0, -1000], ttl)] }), W, H)
  return rec
}

describe('sw3-11 — the enemy fireball sparkle animates across the ROM gunshot frames', () => {
  it('ANIMATES: the red sparkle geometry is not constant over the shot life (≥2 distinct frames)', () => {
    const sigs = new Set<string>()
    for (const ttl of AGED_TTLS) {
      const { segments } = renderAt(ttl)
      sigs.add(frameSignature(segments, CENTER[0], CENTER[1]))
    }
    // sw3-9's single static table yields exactly ONE signature across the whole
    // sweep. Any real GNB0→GNB3 flicker yields at least two.
    expect(sigs.size).toBeGreaterThanOrEqual(2)
  })

  it('has FUSE-BALL tip detail: at least one frame draws short marks at the spike tips, off the centre', () => {
    const perFrame = AGED_TTLS.map((ttl) => {
      const { segments, dots } = renderAt(ttl)
      return fuseMarks(segments, dots, CENTER[0], CENTER[1])
    })
    // Bare sparkle (today) = only full-length centre→tip spikes → 0 tip marks on
    // every frame. The GNT fuse balls add several short off-centre marks per frame.
    expect(Math.max(0, ...perFrame)).toBeGreaterThanOrEqual(3)
  })

  it('preserves the sw3-9 contract on EVERY animated frame: a red centre-anchored sparkle, never amber', () => {
    for (const ttl of AGED_TTLS) {
      const { segments } = renderAt(ttl)
      // Red ink present at the shot…
      expect(redNearShot(segments, CENTER[0], CENTER[1]).length).toBeGreaterThan(0)
      // …arranged as a centre-radiating sparkle (a ring/blank frame has none)…
      expect(centreSpikes(segments, CENTER[0], CENTER[1]).length).toBeGreaterThanOrEqual(3)
      // …and the body never bleeds the retired amber near the shot.
      expect(amberNearShot(segments, CENTER[0], CENTER[1])).toHaveLength(0)
    }
  })
})
