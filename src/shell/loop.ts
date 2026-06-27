// src/shell/loop.ts
//
// Fixed-timestep loop. This is the ONLY place wall-clock time is read; it feeds
// the core a constant `dt` so the simulation stays deterministic and frame-rate
// independent. Rendering interpolates with the leftover accumulator `alpha`.

export type StepFn = (dt: number) => void
export type RenderFn = (alpha: number) => void

export interface Loop {
  start(): void
  stop(): void
}

export function createLoop(step: StepFn, render: RenderFn, hz = 60): Loop {
  const dt = 1 / hz
  let acc = 0
  let last = 0
  let raf = 0

  function frame(now: number): void {
    if (last === 0) last = now
    acc += Math.min(0.25, (now - last) / 1000) // clamp huge tab-switch gaps
    last = now
    while (acc >= dt) {
      step(dt)
      acc -= dt
    }
    render(acc / dt)
    raf = requestAnimationFrame(frame)
  }

  return {
    start(): void {
      last = 0
      raf = requestAnimationFrame(frame)
    },
    stop(): void {
      cancelAnimationFrame(raf)
    },
  }
}
