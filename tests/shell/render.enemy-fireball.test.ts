// tests/shell/render.enemy-fireball.test.ts
//
// Story sw3-9 — the enemy fireball renders as the AUTHENTIC red radial SPARKLE,
// replacing the amber concentric rings sw2-2 left behind (RED phase).
//
// Authentic shape — recovered from the ORIGINAL Atari source (the local
// reference/disasm has only the draw routine + a JSRL picture *address*; the AVG
// picture geometry is not in it). Source: github historicalsource/star-wars
// ("Warp Speed", commit 5355b76) `WSVROM.MAC`, `.SBTTLE GUNSHOT PICTURES` →
// `GNB0-3` (base sparkle) + `GNT0-3` (tip fuse-ball), "GUN SHOTS -- SPARKLES
// WITH FUSE BALLS":
//
//   * `COLOR VGCRED,0FF`               → the fireball is RED, not our amber.
//   * `CXY 0,0` then `AON dx,dy` spikes → strokes radiate FROM THE CENTRE outward
//     (~8 spikes) with `FUSE` ball-dots — a SPARKLE, not a ring.
//   * `ASPECT`                          → round envelope; 4 frames flicker (anim).
//
// sw2-2 correctly retired the old 6px '+' glyph for "a large, round, 3D-scaled
// body" — but chose the WRONG body: two concentric amber perimeter rings
// (`drawFireball`, src/shell/render.ts). This pins the real one. We keep sw2-2's
// still-true invariant (a depth-scaled 3D body) and add the two things that were
// wrong: it must be RED, and a centre-anchored SPARKLE (a ring has zero strokes
// touching its centre).
//
// Asserted through the recording-canvas idiom (render.player-laser /
// enemy-muzzle-flash). Exact hue, spike count, and animation frame stay an
// EYEBALL concern per repo convention — we pin colour FAMILY (red vs amber) and
// TOPOLOGY (centre-anchored spikes vs perimeter ring), not pixels.
//
// Cross-test: the amber muzzle starburst (story 9-6) stays amber and is isolated
// by colour, so a red body sparkle never inflates its ray count. Body tests here
// use an AGED fireball (past the muzzle window) so no flash is present at all.

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

/** Canvas-context stub recording every stroked segment with its colour. */
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

const W = 800
const H = 600
const CENTER: [number, number] = [W / 2, H / 2]
const OLD_AMBER = '#ffd60a' // the wrong sw2-2 fireball colour this story retires

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)

/** Parse #rrggbb → [r,g,b]; non-hex colours read as black (excluded by isRed). */
function rgb(c: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.trim())
  if (!m) return [0, 0, 0]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}
// A red-dominant vector colour: strong red, weak green+blue. Accepts VGCRED-style
// reds (#ff0000, cabinet #ff3b30, …) and REJECTS amber #ffd60a (green 214),
// cyan crosshair #00e5ff (red 0), death-star grey #8a93a8 (green 147), enemy
// green #30d158 (red 48) — the other ink in a space scene.
const isRed = (c: string): boolean => {
  const [r, g, b] = rgb(c)
  return r >= 150 && g <= 100 && b <= 100
}

/** A "playing" space scene with nothing but the fireball under test (+ the cyan
 *  crosshair and the distant grey Death Star, neither of which is red). */
const scene = (over: Partial<GameState>): GameState => ({
  ...initialState(1983),
  mode: 'playing',
  phase: 'space',
  enemies: [],
  enemyShots: [],
  projectiles: [],
  ...over,
})

// An enemy fireball PAST its muzzle-flash window (elapsed = ENEMY_SHOT_TTL - ttl
// ≫ the flash), so the strokes recorded are the fireball BODY only — no muzzle
// starburst inflating counts.
const agedFireballAt = (pos: Vec3): Projectile => ({ pos, vel: [0, 0, 1], ttl: ENEMY_SHOT_TTL / 2 })

const redSegs = (segs: ReadonlyArray<Seg>) => segs.filter((s) => isRed(s.color))
const amberSegs = (segs: ReadonlyArray<Seg>) => segs.filter((s) => s.color === OLD_AMBER)
// The fireball projects to a COMPACT region around its screen point; the playing
// HUD (which also strokes red ink — e.g. the red WAVE number) sits far away at
// the top. Restrict every red check to this window around the shot so HUD red can
// never satisfy a fireball assertion (the failure mode that made a whole-screen
// `some(isRed)` pass vacuously).
const FIREBALL_WINDOW = 120
const nearShot = (s: Seg, cx: number, cy: number) =>
  dist(s.x1, s.y1, cx, cy) <= FIREBALL_WINDOW || dist(s.x2, s.y2, cx, cy) <= FIREBALL_WINDOW
const redNearShot = (segs: ReadonlyArray<Seg>, cx: number, cy: number) =>
  redSegs(segs).filter((s) => nearShot(s, cx, cy))
// Strokes with an endpoint AT the projected centre — the defining mark of a
// sparkle (`AON 0,0` → `AON dx,dy`). A concentric ring lies on its perimeter and
// has ZERO such strokes.
const AT_CENTRE_TOL = 4
const centreAnchored = (segs: ReadonlyArray<Seg>, cx: number, cy: number) =>
  segs.filter((s) => dist(s.x1, s.y1, cx, cy) <= AT_CENTRE_TOL || dist(s.x2, s.y2, cx, cy) <= AT_CENTRE_TOL)
/** Farthest red ink from the shot centre (HUD red excluded) — the sparkle radius. */
const redRadius = (segs: ReadonlyArray<Seg>, cx: number, cy: number): number =>
  Math.max(0, ...redNearShot(segs, cx, cy).flatMap((s) => [dist(s.x1, s.y1, cx, cy), dist(s.x2, s.y2, cx, cy)]))

describe('sw3-9 — the enemy fireball renders as the authentic red sparkle, not amber rings', () => {
  it('draws the body in RED (VGCRED), not the old amber', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ enemyShots: [agedFireballAt([0, 0, -1000])] }), W, H)

    // There is red fireball ink at the shot (HUD red at the top is excluded)…
    expect(redNearShot(segments, CENTER[0], CENTER[1]).length).toBeGreaterThan(0)
    // …and the body is NOT drawn in the retired amber (no amber near the shot).
    const amberNearShot = amberSegs(segments).filter(
      (s) => dist(s.x1, s.y1, ...CENTER) <= 60 || dist(s.x2, s.y2, ...CENTER) <= 60,
    )
    expect(amberNearShot).toHaveLength(0)
  })

  it('is a SPARKLE: multiple red strokes anchored at the centre, radiating out (a ring has none)', () => {
    const { ctx, segments } = makeCtx()
    render(ctx, scene({ enemyShots: [agedFireballAt([0, 0, -1000])] }), W, H)

    // The authentic base sparkle draws ~8 spikes from CXY 0,0; concentric rings
    // draw zero centre-anchored strokes. Four-plus reads unambiguously as a burst.
    const spikes = centreAnchored(redSegs(segments), CENTER[0], CENTER[1])
    expect(spikes.length).toBeGreaterThanOrEqual(4)
  })

  it('is a real 3D body: a near fireball draws larger than a distant one (sw2-2 invariant)', () => {
    const near = makeCtx()
    render(near.ctx, scene({ enemyShots: [agedFireballAt([0, 0, -500])] }), W, H)
    const far = makeCtx()
    render(far.ctx, scene({ enemyShots: [agedFireballAt([0, 0, -5000])] }), W, H)

    expect(redRadius(near.segments, CENTER[0], CENTER[1])).toBeGreaterThan(
      redRadius(far.segments, CENTER[0], CENTER[1]),
    )
  })
})
