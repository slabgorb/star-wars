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
  // `start` is a one-shot edge (the start button / Enter / 1), not a held axis:
  // it is latched on keydown and cleared the next time the core samples it, so a
  // single press fires exactly one attract->play (or gameover->attract) transition
  // however many fixed steps the frame runs.
  let pendingStart = false

  window.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect()
    state.aimX = ((e.clientX - r.left) / r.width) * 2 - 1
    // +aimY is UP (the convention aimDirection and the render NDC both use), but
    // the pointer's Y grows downward — negate it, or pushing the yoke up would dive.
    state.aimY = -(((e.clientY - r.top) / r.height) * 2 - 1)
  })
  window.addEventListener('pointerdown', () => { state.fire = true })
  window.addEventListener('pointerup', () => { state.fire = false })
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') state.fire = true
    // Edge, not level: only a fresh press (never an OS key-repeat) arms start
    // (SH2-13, the battlezone latch discipline). With the typed initials entry
    // behind this same key, a repeat-armed latch would machine-gun start edges
    // into the entry screen.
    if ((e.code === 'Enter' || e.code === 'Digit1' || e.code === 'Numpad1') && !e.repeat) {
      pendingStart = true
    }
  })
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') state.fire = false })

  return {
    sample(): Input {
      // The aim inverts the render's projection, so it needs the same viewport
      // aspect the scene is drawn with (canvas CSS width / height).
      const aspect = canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1
      const sampled: Input = { ...state, aspect, start: pendingStart }
      pendingStart = false
      return sampled
    },
  }
}
