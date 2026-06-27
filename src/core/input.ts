// src/core/input.ts
//
// The complete per-frame input the pure core consumes. The shell maps physical
// devices (mouse as the analog yoke, keyboard) into this shape; the core never
// reads a device directly. The cabinet used a two-axis yoke with a trigger.

export interface Input {
  /** Yoke X, normalised to [-1, 1] (left .. right). */
  aimX: number
  /** Yoke Y, normalised to [-1, 1] (up .. down). */
  aimY: number
  /** Trigger held this frame. */
  fire: boolean
}

export const NO_INPUT: Input = { aimX: 0, aimY: 0, fire: false }
