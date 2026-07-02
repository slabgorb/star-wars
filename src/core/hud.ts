// src/core/hud.ts
//
// Pure, deterministic formatting helpers for the cabinet HUD header (story 8-17).
// The shell (render.ts) calls these to turn raw GameState numbers into the
// display strings and the shield-meter fill it then lays out in the Vector Battle
// face and canvas geometry. No DOM, no time, no randomness — this is core, so it
// stays unit-testable and the render layer owns nothing but pixels.
//
// `formatShield` returns a FILL FRACTION in [0, 1] — not an angle, not a percent.
// The shell multiplies it by the meter's pixel width (a bar) or sweep (an arc),
// so the helper stays render-agnostic; the clamping guarantees the shell can
// never over- or under-draw the meter from an out-of-range caller.

/**
 * The on-display score: comma-grouped thousands, e.g. "12,066" — findings
 * ## HUD & framing cites `sub_761D` "Display score" drawing a 6-digit BCD
 * panel from `$485C`, which reads ambiguously on its own (BCD digit COUNT
 * doesn't say whether leading zeros are suppressed or commas inserted). A
 * real cabinet screenshot resolves it directly: the live readout shows
 * "SCORE / 12,066" and "SCORE / 60,681" — comma-grouped, no leading zeros
 * (see the task-5 report for the source screenshots and pixel sampling).
 */
export function formatScore(points: number): string {
  return Math.max(0, Math.floor(points)).toLocaleString('en-US')
}

/** Remaining shields/lives as a non-negative digit string ("3"). */
export function formatLives(lives: number): string {
  return Math.max(0, Math.floor(lives)).toString()
}

/** The current wave number as a digit string ("1"). */
export function formatWave(wave: number): string {
  return Math.floor(wave).toString()
}

/** The current level as a digit string ("1".."10"). */
export function formatLevel(level: number): string {
  return Math.floor(level).toString()
}

/**
 * Shield-meter fill fraction in [0, 1] for a 0..100 health percentage. Linear
 * through the origin and clamped at both ends: 0% → empty (0), 100% → full (1),
 * and anything outside [0, 100] saturates rather than spilling the meter.
 */
export function formatShield(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct))
  return clamped / 100
}
