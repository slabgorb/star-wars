// src/core/input.ts
//
// The complete per-frame input the pure core consumes. The shell maps physical
// devices (mouse as the analog yoke, keyboard) into this shape; the core never
// reads a device directly. The cabinet used a two-axis yoke with a trigger.

export interface Input {
  /** Yoke X, normalised to [-1, 1] (left .. right). */
  aimX: number
  /** Yoke Y, normalised to [-1, 1]; +aimY is UP (matches the render NDC and
   * gameRules.aimDirection — the shell negates the downward-growing pointer Y). */
  aimY: number
  /** Trigger held this frame. */
  fire: boolean
  /** Viewport aspect ratio (width / height) the scene is projected with. The
   * shell supplies it so the firing aim inverts the SAME projection the crosshair
   * is drawn under (gameRules.aimDirection). Optional: defaults to square in the
   * pure core, which is all the vertical-axis tests need. */
  aspect?: number
  /** Start button — begins a run from the attract/title or game-over screen.
   * Optional: gameplay frames never need it, only the framing transitions do. */
  start?: boolean
}

export const NO_INPUT: Input = { aimX: 0, aimY: 0, fire: false }
