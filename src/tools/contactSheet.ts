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
  perspective, multiply, rotationX, rotationY, translation, IDENTITY, type Mat4, type Vec3,
} from '@arcade/shared/math3d'
import { drawWireframe, GLOW_FOR, DEFAULT_GLOW, NEAR, FAR } from '../shell/wireframe'
import { SURFACE_ORIENT } from '../shell/render'
import { modelBounds, fitDistance, cellRects } from '../core/modelView'
import { pairModels, type ModelPair } from './romCompare'

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

// Draw one ROM|PORT comparison cell: the ROM wireframe left, the port's right,
// framed identically so only geometry can differ.
function drawPair(p: ModelPair, r: { x: number; y: number; w: number; h: number }): void {
  const half = r.w / 2
  const romDrawn = p.rom && p.rom.hasDrawList ? { name: p.romName, vertices: p.rom.vertices, edges: p.rom.edges } : null
  const sides: [string, Model3D | null][] = [
    ['ROM', romDrawn],
    ['PORT', p.port],
  ]

  // Frame BOTH halves to the same bounding sphere so scale is comparable. Base
  // it on whichever side(s) actually render: when the ROM has no draw list
  // (hasDrawList false) its baked vertices describe a shape that never gets
  // drawn here, so framing off it would badly mis-scale the port half that
  // DOES render (e.g. GND's tower-column table spans thousands of world
  // units end to end). Prefer the rendered ROM geometry; fall back to the
  // port; fall back to the raw ROM vertices only if neither renders (nothing
  // will be drawn, so the distance is moot).
  const framed = romDrawn ?? p.port ?? p.rom
  if (!framed) return
  const { center, radius } = modelBounds({ name: p.romName, vertices: framed.vertices, edges: [] })
  const dist = fitToCell ? fitDistance(radius, FOV_Y) : GAMEPLAY_DISTANCE

  sides.forEach(([label, model], i) => {
    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x + i * half, r.y, half, r.h)
    ctx.clip()
    ctx.translate(r.x + i * half, r.y)

    if (model) {
      const proj = perspective(FOV_Y, half / r.h, NEAR, FAR)
      const recentre = translation(-center[0], -center[1], -center[2])
      const spun = multiply(rotationY(spinAngle), multiply(orientFor(model.name), recentre))
      const orient = multiply(rotationX(VIEW_TILT), spun)
      const modelView = multiply(translation(0, 0, -dist), orient)
      drawWireframe(ctx, model, modelView, proj, half, r.h, GLOW_FOR[model.name] ?? DEFAULT_GLOW)
    }

    ctx.font = LABEL_FONT
    ctx.textAlign = 'left'
    ctx.fillStyle = HINT_COLOR
    ctx.fillText(label, 8, 36)
    if (!model) ctx.fillText(label === 'ROM' ? 'no draw list' : 'not ported', 8, 54)
    ctx.restore()
  })

  // Header + drift counts.
  ctx.save()
  ctx.translate(r.x, r.y)
  ctx.font = LABEL_FONT
  ctx.textAlign = 'left'
  ctx.fillStyle = DEFAULT_GLOW
  ctx.fillText(`${p.romName}${p.portName ? ` → ${p.portName}` : ''}`, 8, 18)

  const drift = p.onlyInRom.length + p.onlyInPort.length
  ctx.fillStyle = drift ? DRIFT_COLOR : HINT_COLOR
  ctx.fillText(
    drift
      ? `⚠ ${p.onlyInRom.length} in ROM not in port · ${p.onlyInPort.length} in port not in ROM`
      : p.port && p.rom?.hasDrawList ? '✓ edges match' : '—',
    8,
    r.h - 10,
  )
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
    if (compare) drawPair(pairs[i], rects[i])
    else drawModelCell(MODELS[i], rects[i], bounds[i])
  }

  // footer hint
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.fillStyle = HINT_COLOR
  ctx.shadowBlur = 0
  ctx.fillText(
    `${compare ? 'ROM|PORT COMPARE' : (fitToCell ? 'FIT' : 'GAMEPLAY') + ' SCALE'}   ·   [C] compare   ·   [G] scale   ·   [SPACE] ${spinning ? 'pause' : 'play'}`,
    W / 2,
    H - 8,
  )

  ctx.restore()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
