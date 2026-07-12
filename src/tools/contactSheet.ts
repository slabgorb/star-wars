// src/tools/contactSheet.ts
//
// Model contact sheet — a standalone dev page (/models.html) that renders every
// entry of the MODELS registry in a grid of auto-rotating cells, drawn through
// the SAME projection + glow pipeline the game uses (shell/wireframe.ts). It
// reads core/models.ts directly, so geometry edits appear here with no extra
// wiring — handy for eyeballing model shape, orientation, and scale.
//
//   [G]      toggle fit-to-cell (default) ↔ gameplay-distance scale
//   [C]      toggle ROM|PORT compare mode
//   [SPACE]  pause / resume rotation
//
// DOM/shell tool — never imported by the deterministic core or its tests.

import { MODELS, type Model3D } from '../core/models'
import {
  perspective, multiply, rotationX, rotationY, translation, transform, IDENTITY, type Mat4, type Vec3,
} from '@arcade/shared/math3d'
import { drawWireframe, project, GLOW_FOR, DEFAULT_GLOW, NEAR, FAR } from '../shell/wireframe'
import { withGlow } from '../shell/glow'
import { SURFACE_ORIENT } from '../shell/render'
import { modelBounds, fitDistance, cellRects } from '../core/modelView'
import { pairModels, verdictFor, type ModelPair } from './romCompare'

const FOV_Y = Math.PI / 3 // match the game camera
const COLS = 3
const SPIN_RATE = 0.6 // radians per second
const VIEW_TILT = -Math.PI / 6 // fixed 3/4-view pitch so flat y=0 models aren't edge-on
const GAMEPLAY_DISTANCE = 2200 // representative engagement distance for "G" mode
// Dev-only tool labels stay on plain canvas text (SH2-5): they use characters
// the caps-only shared stroke font deliberately lacks.
const LABEL_FONT = '700 14px monospace'
const HINT_COLOR = '#7a8699'

// Per-model display orientation, mirroring render.ts: the surface lies flat as in
// play; everything else is shown in its authored frame.
function orientFor(name: string): Mat4 {
  return name === 'Death Star Surface' ? SURFACE_ORIENT : IDENTITY
}

const canvas = document.getElementById('sheet') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let dpr = Math.min(2, window.devicePixelRatio || 1)
let W = window.innerWidth
let H = window.innerHeight

function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1)
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
}
window.addEventListener('resize', resize)
resize()

let fitToCell = true
let spinning = true
let spinAngle = 0
let compare = false
const pairs = pairModels()
const DRIFT_COLOR = '#ff5a5a'
const DOT_RADIUS = 2.5

window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'G') {
    fitToCell = !fitToCell
  } else if (e.code === 'Space') {
    e.preventDefault()
    spinning = !spinning
  } else if (e.key === 'c' || e.key === 'C') {
    compare = !compare
  }
})

// Geometry is static — measure each model's bounding sphere once.
const bounds = MODELS.map((m) => modelBounds(m))

// One rendered half of a compare cell. 'edges' strokes a wireframe exactly
// like the PORT-only mode; 'dots' draws unconnected vertex points for ROM
// objects with no recovered `.WL` edge list (never fabricate edges for
// these — see romCompare.ts's ROM_TO_PORT doc comment); 'missing' is the
// PORT side when the ROM object has no port counterpart.
type CellSide =
  | { readonly kind: 'edges'; readonly model: Model3D }
  | { readonly kind: 'dots'; readonly name: string; readonly vertices: readonly Vec3[] }
  | { readonly kind: 'missing'; readonly note: string }

interface PairRender {
  readonly bound: { center: Vec3; radius: number }
  readonly rom: CellSide
  readonly port: CellSide
}

// Pairing + geometry are static — build each cell's render sides and bounding
// sphere once instead of every frame (24 pairs x 60fps).
const pairRenders: PairRender[] = pairs.map((p) => {
  const romModel = p.rom
  const rom: CellSide = !romModel
    ? { kind: 'missing', note: 'no ROM data' }
    : romModel.hasDrawList
      ? { kind: 'edges', model: { name: p.romName, vertices: romModel.vertices, edges: romModel.edges } }
      : { kind: 'dots', name: p.romName, vertices: romModel.vertices }
  const port: CellSide = p.port ? { kind: 'edges', model: p.port } : { kind: 'missing', note: 'not ported' }

  // Frame BOTH halves on the SAME bounding sphere — always the ROM's, the
  // authoritative geometry per this file's own header — so a genuine ROM/port
  // scale mismatch stays VISIBLE instead of being normalized away. This
  // matters now that hasDrawList:false objects render (as dots): e.g. GND's
  // baked point table spans thousands of world units while its port
  // counterpart is a couple hundred — that gap is exactly the kind of finding
  // this tool exists to surface, not hide.
  const boundSource = romModel ?? p.port
  const bound = boundSource
    ? modelBounds({ name: p.romName, vertices: boundSource.vertices, edges: [] })
    : { center: [0, 0, 0] as Vec3, radius: 1 }
  return { bound, rom, port }
})

// Draw a ROM object's vertices as unconnected glowing dots (no edges — this
// parser never recovered connectivity for these objects, so drawing lines
// between vertices would fabricate structure WSOBJ.MAC never confirmed).
function drawVertexDots(vertices: readonly Vec3[], modelView: Mat4, proj: Mat4, w: number, h: number, color: string): void {
  withGlow(ctx, { stroke: color, width: 1, blur: 8 }, () => {
    ctx.fillStyle = color
    for (const v of vertices) {
      const eye = transform(modelView, v)
      const s = project(eye, proj, w, h)
      if (!s) continue
      ctx.beginPath()
      ctx.arc(s[0], s[1], DOT_RADIUS, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

// Draw one MODELS cell (PORT-only mode): the existing per-model body, extracted
// so the frame loop can share it with drawPair's cell layout.
function drawModelCell(m: Model3D, r: { x: number; y: number; w: number; h: number }, b: { center: Vec3; radius: number }): void {
  const { center, radius } = b
  const color = GLOW_FOR[m.name] ?? DEFAULT_GLOW

  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, r.h)
  ctx.clip()
  ctx.translate(r.x, r.y) // cell-local viewport

  const proj = perspective(FOV_Y, r.w / r.h, NEAR, FAR)
  const dist = fitToCell ? fitDistance(radius, FOV_Y) : GAMEPLAY_DISTANCE

  // vertex -> recentre -> display-orient -> spin -> fixed view tilt -> push back
  // (matrices compose right-to-left). The tilt lifts flat y=0-plane models
  // (TRENCH, EXHAUST_PORT) out of edge-on and gives every model a 3/4 view; the
  // final translation(-dist) is this cell's view matrix (camera at the origin).
  const recentre = translation(-center[0], -center[1], -center[2])
  const spun = multiply(rotationY(spinAngle), multiply(orientFor(m.name), recentre))
  const orient = multiply(rotationX(VIEW_TILT), spun)
  const modelView = multiply(translation(0, 0, -dist), orient)
  drawWireframe(ctx, m, modelView, proj, r.w, r.h, color)

  // cell labels
  ctx.font = LABEL_FONT
  ctx.textAlign = 'left'
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 6
  ctx.fillText(m.name.toUpperCase(), 10, 22)
  ctx.fillText(`V:${m.vertices.length} E:${m.edges.length}`, 10, 40)
  ctx.shadowBlur = 0
  ctx.restore()
}

// Draw one ROM|PORT comparison cell: the ROM side left, the port's right,
// framed identically (pr.bound, hoisted once — Finding 5) so only geometry
// can differ.
function drawPair(p: ModelPair, pr: PairRender, r: { x: number; y: number; w: number; h: number }): void {
  const half = r.w / 2
  const { center, radius } = pr.bound
  const dist = fitToCell ? fitDistance(radius, FOV_Y) : GAMEPLAY_DISTANCE

  const sides: [string, CellSide][] = [
    ['ROM', pr.rom],
    ['PORT', pr.port],
  ]

  sides.forEach(([label, side], i) => {
    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x + i * half, r.y, half, r.h)
    ctx.clip()
    ctx.translate(r.x + i * half, r.y)

    const name = side.kind === 'edges' ? side.model.name : side.kind === 'dots' ? side.name : null
    const proj = perspective(FOV_Y, half / r.h, NEAR, FAR)
    const recentre = translation(-center[0], -center[1], -center[2])
    const spun = multiply(rotationY(spinAngle), multiply(orientFor(name ?? ''), recentre))
    const orient = multiply(rotationX(VIEW_TILT), spun)
    const modelView = multiply(translation(0, 0, -dist), orient)

    if (side.kind === 'edges') {
      drawWireframe(ctx, side.model, modelView, proj, half, r.h, GLOW_FOR[side.model.name] ?? DEFAULT_GLOW)
    } else if (side.kind === 'dots') {
      drawVertexDots(side.vertices, modelView, proj, half, r.h, GLOW_FOR[side.name] ?? DEFAULT_GLOW)
    }

    ctx.font = LABEL_FONT
    ctx.textAlign = 'left'
    ctx.fillStyle = HINT_COLOR
    ctx.fillText(label, 8, 36)
    // Vertices-only ROM objects still render (as dots) — keep this label so
    // nobody mistakes the dots for recovered edge connectivity.
    if (side.kind === 'dots') ctx.fillText('no draw list', 8, 54)
    if (side.kind === 'missing') ctx.fillText(side.note, 8, 54)
    ctx.restore()
  })

  // Header + verdict.
  ctx.save()
  ctx.translate(r.x, r.y)
  ctx.font = LABEL_FONT
  ctx.textAlign = 'left'
  ctx.fillStyle = DEFAULT_GLOW
  ctx.fillText(`${p.romName}${p.portName ? ` → ${p.portName}` : ''}`, 8, 18)

  const verdict = verdictFor(p)
  ctx.fillStyle = verdict.drift ? DRIFT_COLOR : HINT_COLOR
  ctx.fillText(verdict.text, 8, r.h - 10)
  ctx.restore()
}

let last = 0
function frame(now: number): void {
  const dt = last ? (now - last) / 1000 : 0
  last = now
  if (spinning) spinAngle += SPIN_RATE * dt

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const items = compare ? pairs : MODELS
  const rects = cellRects(W, H, items.length, COLS)
  for (let i = 0; i < items.length; i++) {
    if (compare) drawPair(pairs[i], pairRenders[i], rects[i])
    else drawModelCell(MODELS[i], rects[i], bounds[i])
  }

  // footer hint — [G] still changes `dist` in compare mode (both cells share
  // the same fit/gameplay toggle), so show the scale state in both modes.
  const scaleLabel = `${fitToCell ? 'FIT' : 'GAMEPLAY'} SCALE`
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.fillStyle = HINT_COLOR
  ctx.shadowBlur = 0
  ctx.fillText(
    `${compare ? `ROM|PORT COMPARE · ${scaleLabel}` : scaleLabel}   ·   [C] compare   ·   [G] scale   ·   [SPACE] ${spinning ? 'pause' : 'play'}`,
    W / 2,
    H - 8,
  )

  ctx.restore()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
