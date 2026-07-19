// tests/support/canvas-recorder.ts
//
// A richer recording canvas than the segment-counter stubs used by the older
// render suites (render.tie-death-fragments makeCtx). It captures, per drawn
// STROKE, the colour it was painted in, its alpha, and its geometry (line
// segments + arc calls) — so a seam-agnostic render test can ask questions the
// segment-counter cannot:
//
//   * WHICH colour family a stroke belongs to (green body / white trench / red
//     dish / red-blue-white finale rings) — the repo's "colour-family + topology,
//     not pixels" convention (sw3-9), tolerant of Dev's exact hex choice.
//   * whether the finale is built from concentric CIRCLES (arc calls) or a radial
//     RAY starburst (line segments collinear with the centre) — X-006's "no rays".
//   * the drawn EXTENT of a feature (max stroke radius from a reference point) —
//     for "the station looms very large" (X-007).
//
// It is a pure test double: no DOM, deterministic. Cast to CanvasRenderingContext2D
// for render(); only the subset render() actually calls is implemented.

export interface Stroke {
  /** strokeStyle at the moment stroke() was called. */
  style: string
  /** globalAlpha at the moment stroke() was called (0 = invisible). */
  alpha: number
  /** line segments [x0,y0,x1,y1] accumulated on the current path. */
  segs: [number, number, number, number][]
  /** arc() calls on the current path (concentric rings / circles). */
  arcs: { cx: number; cy: number; r: number }[]
}

export type ColorFamily =
  | 'green'
  | 'white'
  | 'red'
  | 'blue'
  | 'amber'
  | 'cyan'
  | 'steel'
  | 'other'

interface Recorder {
  ctx: CanvasRenderingContext2D
  strokes: () => Stroke[]
}

/** Parse `#rgb` / `#rrggbb` (the repo's colour spelling) to [r,g,b] 0..255, or null. */
export function parseHex(style: string): [number, number, number] | null {
  const s = style.trim()
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s)
  if (m3) return [parseInt(m3[1] + m3[1], 16), parseInt(m3[2] + m3[2], 16), parseInt(m3[3] + m3[3], 16)]
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s)
  if (m6) return [parseInt(m6[1], 16), parseInt(m6[2], 16), parseInt(m6[3], 16)]
  return null
}

/**
 * Classify a stroke colour into a broad family, tolerant of Dev's exact hex.
 * The ROM vector-generator colours the authentic Death Star / finale use:
 *   VGCGRN (green body + farmland), VGCWHT (white trench + late rings),
 *   VGCRED (red dish + early rings), VGCBLU (blue mid rings).
 * The current single hull colour #8a93a8 classifies as `steel`; the HUD cyan
 * #00e5ff as `cyan`; the current finale amber #ffdd66 as `amber` — none of which
 * are green/white/red/blue, so the family assertions bite on today's code.
 */
export function colorFamily(style: string): ColorFamily {
  const rgb = parseHex(style)
  if (!rgb) return 'other'
  const [r, g, b] = rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  // White: bright and near-neutral.
  if (min >= 190 && max - min <= 45) return 'white'
  // Red: red channel clearly dominant.
  if (r >= 150 && r >= g * 1.4 && r >= b * 1.4) return 'red'
  // Amber/yellow: red+green high, blue low (distinct from red and from white).
  if (r >= 180 && g >= 130 && b <= 130 && g >= b * 1.4) return 'amber'
  // Green: green channel clearly dominant.
  if (g >= 110 && g >= r * 1.2 && g >= b * 1.2) return 'green'
  // Cyan: green+blue high, red low.
  if (g >= 140 && b >= 140 && r <= 130) return 'cyan'
  // Blue: blue channel clearly dominant.
  if (b >= 110 && b >= r * 1.2 && b >= g * 1.2) return 'blue'
  return 'steel'
}

/** Distance of a point from a reference centre. */
function dist(x: number, y: number, cx: number, cy: number): number {
  return Math.hypot(x - cx, y - cy)
}

/**
 * A "radial ray" segment: both endpoints roughly collinear with `centre` (same
 * bearing) but at clearly different radii — an inner→outer spoke. This is exactly
 * the shape drawDeathStarBoom's BOOM_RAYS starburst draws; a concentric ring, an
 * arc, or a tangential polyline edge is NOT collinear with the centre.
 */
export function isRadialRay(
  seg: [number, number, number, number],
  cx: number,
  cy: number,
): boolean {
  const [x0, y0, x1, y1] = seg
  const r0 = dist(x0, y0, cx, cy)
  const r1 = dist(x1, y1, cx, cy)
  if (Math.min(r0, r1) < 1) return false // a segment touching the centre is degenerate
  if (Math.abs(r0 - r1) < 0.15 * Math.max(r0, r1)) return false // near-constant radius ⇒ tangential, not radial
  const a0 = Math.atan2(y0 - cy, x0 - cx)
  const a1 = Math.atan2(y1 - cy, x1 - cx)
  let da = Math.abs(a0 - a1)
  if (da > Math.PI) da = 2 * Math.PI - da
  return da < 0.2 // < ~11.5° bearing change over a big radius change ⇒ radial spoke
}

/** Max radius (from `centre`) reached by any endpoint of a visible stroke. */
export function maxStrokeRadius(strokes: Stroke[], cx: number, cy: number): number {
  let m = 0
  for (const s of strokes) {
    if (s.alpha <= 0.01) continue
    for (const [x0, y0, x1, y1] of s.segs) {
      m = Math.max(m, dist(x0, y0, cx, cy), dist(x1, y1, cx, cy))
    }
    for (const a of s.arcs) m = Math.max(m, dist(a.cx, a.cy, cx, cy) + a.r)
  }
  return m
}

/** A recording 2D context. `strokes()` returns every stroke() flushed so far. */
export function makeRecorder(): Recorder {
  const strokes: Stroke[] = []
  let cur: Stroke | null = null
  let penX = 0
  let penY = 0

  const ensure = (): Stroke => {
    if (!cur) cur = { style: String(ctx.strokeStyle), alpha: ctx.globalAlpha, segs: [], arcs: [] }
    return cur
  }

  const ctx = {
    // properties render() reads/writes
    strokeStyle: '' as string,
    fillStyle: '' as string,
    shadowColor: '' as string,
    shadowBlur: 0,
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    letterSpacing: '',
    globalCompositeOperation: '' as GlobalCompositeOperation,
    lineCap: '' as CanvasLineCap,
    lineJoin: '' as CanvasLineJoin,

    beginPath() {
      cur = null
    },
    moveTo(x: number, y: number) {
      penX = x
      penY = y
    },
    lineTo(x: number, y: number) {
      ensure().segs.push([penX, penY, x, y])
      penX = x
      penY = y
    },
    arc(cx: number, cy: number, r: number) {
      ensure().arcs.push({ cx, cy, r })
      penX = cx + r
      penY = cy
    },
    stroke() {
      // Snapshot the current path with the style/alpha in force right now.
      if (!cur) return
      strokes.push({ style: String(ctx.strokeStyle), alpha: ctx.globalAlpha, segs: [...cur.segs], arcs: [...cur.arcs] })
      // A native stroke() does not clear the path; render() calls beginPath()
      // before its next path, which resets `cur`.
    },
    // no-ops for the calls render() makes that we don't record
    fill() {},
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    closePath() {},
    fillText() {},
    strokeText() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    setLineDash() {},
    createLinearGradient() {
      return { addColorStop() {} }
    },
  }

  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes: () => strokes }
}
