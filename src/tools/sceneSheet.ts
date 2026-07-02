// src/tools/sceneSheet.ts
//
// Scene contact sheet — a standalone dev page (/scenes.html) that renders the
// composed GAME screen at a set of canonical trench-run moments (core/scenePresets)
// as STILLS, side by side, through the SAME render() the game loop uses. Unlike the
// model contact sheet (one model per cell), each cell here is a full frame — camera,
// geometry, glow, HUD — so the trench scene can be eyeballed without a play test.
//
//   [R]  re-render
//
// DOM/shell tool — never imported by the deterministic core or its tests.

import { SCENE_PRESETS } from '../core/scenePresets'
import { cellRects } from '../core/modelView'
import { render } from '../shell/render'
import { loadVectorFont } from '../shell/font'

const COLS = 2
const LABEL_FONT = "700 14px 'Vector Battle', 'Orbitron', monospace"
const LABEL_COLOR = '#ff9f0a' // target amber, matching the exhaust-port glow
const HINT_COLOR = '#7a8699'

void loadVectorFont() // best-effort; falls back to monospace if it never lands

const canvas = document.getElementById('sheet') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let dpr = Math.min(2, window.devicePixelRatio || 1)
let W = window.innerWidth
let H = window.innerHeight

function draw(): void {
  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const rects = cellRects(W, H, SCENE_PRESETS.length, COLS)
  for (let i = 0; i < SCENE_PRESETS.length; i++) {
    const preset = SCENE_PRESETS[i]
    const r = rects[i]

    ctx.save()
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.clip()
    ctx.translate(r.x, r.y) // cell-local viewport
    // The REAL game renderer: it clears its own w×h (clipped to this cell) and
    // draws the composed frame — camera, geometry, glow, HUD — identical to play.
    render(ctx, preset.state, r.w, r.h)

    ctx.font = LABEL_FONT
    ctx.textAlign = 'left'
    ctx.fillStyle = LABEL_COLOR
    ctx.shadowColor = LABEL_COLOR
    ctx.shadowBlur = 6
    ctx.fillText(preset.label, 10, 22)
    if (preset.hint) {
      ctx.shadowBlur = 0
      ctx.fillStyle = HINT_COLOR
      ctx.fillText(preset.hint, 10, 40)
    }
    ctx.shadowBlur = 0
    ctx.restore()
  }

  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.fillStyle = HINT_COLOR
  ctx.shadowBlur = 0
  ctx.fillText('SCENE SHEET   ·   [R] re-render', W / 2, H - 8)
  ctx.restore()
}

function resize(): void {
  dpr = Math.min(2, window.devicePixelRatio || 1)
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
  draw()
}

window.addEventListener('resize', resize)
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') draw()
})
resize() // initial size + draw
