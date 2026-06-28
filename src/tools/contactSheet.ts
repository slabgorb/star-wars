// src/tools/contactSheet.ts
//
// Model contact sheet — a standalone dev page (/models.html) that renders every
// entry of the MODELS registry in a grid of auto-rotating cells, drawn through
// the SAME projection + glow pipeline the game uses (shell/wireframe.ts). It
// reads core/models.ts directly, so geometry edits appear here with no extra
// wiring — handy for eyeballing model shape, orientation, and scale.
//
//   [G]      toggle fit-to-cell (default) ↔ gameplay-distance scale
//   [SPACE]  pause / resume rotation
//
// DOM/shell tool — never imported by the deterministic core or its tests.

import { MODELS } from '../core/models'
import {
  perspective, multiply, rotationY, translation, IDENTITY, type Mat4, type Vec3,
} from '../core/math3d'
import { drawWireframe, GLOW_FOR, DEFAULT_GLOW, NEAR, FAR } from '../shell/wireframe'
import { SURFACE_ORIENT } from '../shell/render'
import { modelBounds, fitDistance, cellRects } from '../core/modelView'
import { loadVectorFont } from '../shell/font'

const FOV_Y = Math.PI / 3 // match the game camera
const COLS = 3
const SPIN_RATE = 0.6 // radians per second
const GAMEPLAY_DISTANCE = 2200 // representative engagement distance for "G" mode
const LABEL_FONT = "700 14px 'Vector Battle', 'Orbitron', monospace"
const HINT_COLOR = '#7a8699'

// Per-model display orientation, mirroring render.ts: the surface lies flat as in
// play; everything else is shown in its authored frame.
function orientFor(name: string): Mat4 {
  return name === 'Death Star Surface' ? SURFACE_ORIENT : IDENTITY
}

void loadVectorFont() // best-effort; falls back to monospace if it never lands

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

window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'G') {
    fitToCell = !fitToCell
  } else if (e.code === 'Space') {
    e.preventDefault()
    spinning = !spinning
  }
})

// Geometry is static — measure each model's bounding sphere once.
const bounds = MODELS.map((m) => modelBounds(m))

let last = 0
function frame(now: number): void {
  const dt = last ? (now - last) / 1000 : 0
  last = now
  if (spinning) spinAngle += SPIN_RATE * dt

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const rects = cellRects(W, H, MODELS.length, COLS)
  for (let i = 0; i < MODELS.length; i++) {
    const m = MODELS[i]
    const r = rects[i]
    const { center, radius } = bounds[i]
    const color = GLOW_FOR[m.name] ?? DEFAULT_GLOW

    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.clip()
    ctx.translate(r.x, r.y) // cell-local viewport

    const proj = perspective(FOV_Y, r.w / r.h, NEAR, FAR)
    const dist = fitToCell ? fitDistance(radius, FOV_Y) : GAMEPLAY_DISTANCE

    // vertex -> recentre -> display-orient -> spin (matrices compose right-to-left)
    const recentre = translation(-center[0], -center[1], -center[2])
    const orient = multiply(rotationY(spinAngle), multiply(orientFor(m.name), recentre))
    drawWireframe(ctx, m, [0, 0, -dist] as Vec3, proj, r.w, r.h, color, orient)

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

  // footer hint
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.fillStyle = HINT_COLOR
  ctx.shadowBlur = 0
  ctx.fillText(
    `${fitToCell ? 'FIT' : 'GAMEPLAY'} SCALE   ·   [G] toggle scale   ·   [SPACE] ${spinning ? 'pause' : 'play'}`,
    W / 2,
    H - 8,
  )

  ctx.restore()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
