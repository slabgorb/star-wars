// src/main.ts
//
// Bootstrap: own the canvas, wire the shell (input + loop + render) to the pure
// core (initialState + stepGame). Wave 0 skeleton — a glowing wireframe spins
// in the dark, proving the math box → projection → glow pipeline end to end.

import { initialState } from './core/state'
import { stepGame } from './core/sim'
import { createInputController } from './shell/input'
import { createLoop } from './shell/loop'
import { render } from './shell/render'

const canvas = document.getElementById('game') as HTMLCanvasElement
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

const input = createInputController(canvas)
let state = initialState()

const loop = createLoop(
  (dt) => {
    state = stepGame(state, input.sample(), dt)
  },
  () => {
    ctx.save()
    ctx.scale(dpr, dpr)
    render(ctx, state, W, H)
    ctx.restore()
  },
)
loop.start()
