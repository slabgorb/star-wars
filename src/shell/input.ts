// src/shell/input.ts
//
// Maps physical devices into the core's Input. Mouse XY stands in for the
// cabinet's two-axis yoke; the left button / Space is the trigger.

import type { Input } from '../core/input'

export interface InputController {
  sample(): Input
}

export function createInputController(canvas: HTMLCanvasElement): InputController {
  const state: Input = { aimX: 0, aimY: 0, fire: false }

  window.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect()
    state.aimX = ((e.clientX - r.left) / r.width) * 2 - 1
    state.aimY = ((e.clientY - r.top) / r.height) * 2 - 1
  })
  window.addEventListener('pointerdown', () => { state.fire = true })
  window.addEventListener('pointerup', () => { state.fire = false })
  window.addEventListener('keydown', (e) => { if (e.code === 'Space') state.fire = true })
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') state.fire = false })

  return {
    sample(): Input {
      return { ...state }
    },
  }
}
