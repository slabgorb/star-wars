// src/core/starfield.ts
//
// The WSSTAR starfield (sw7-10 / M-015) — the drifting backdrop the cabinet flies
// over on the attract screen AND in space.
//
// Ground truth (1983 "Warp Speed" source, WSSTAR.MAC; .RADIX 16 via WSCOMN.MAC:5):
//   * `M$STNM ==50.` (WSSTAR.MAC:28, trailing-dot DECIMAL) — 50 stars, always.
//   * `VWSTAR` loads the viewer-translation vector ST.UX/UY/UZ into the Math Box
//     every frame (WSSTAR.MAC:96-103), so the whole field slides past the eye; in
//     flight ST.UX is driven straight off the frame counter (`LDD FRAME / JSR LSLD7 /
//     STD ST.UX`, WSMAIN.MAC:2525-2528). The field is never still.
//   * each star is drawn as the single-point glyph VGSTAR in white (VGCWHT,
//     WSSTAR.MAC:110) — the shell owns that.
//
// PURITY. `STARNW` (WSSTAR.MAC:362-364) places a star from `RND8`, which reads the
// cabinet's HARDWARE random byte P.RND1 — non-deterministic silicon. CLAUDE.md's hard
// rule forbids that here, so the field is laid out once from a SEEDED cursor and then
// moves by pure arithmetic. See the sw7-10 Design Deviations for both divergences.

import { createRng, nextFloat } from '@arcade/shared/rng'

/** One star, in world units ahead of the eye. `z` is DEPTH — strictly positive,
 *  shrinking as the star closes; the shell divides x/y by it to place the point. */
export interface Star {
  x: number
  y: number
  z: number
}

/** `M$STNM ==50.` — the cabinet's star budget (WSSTAR.MAC:28, decimal). */
export const STAR_COUNT = 50

/** Depth band the field occupies. A star recycles to STAR_FAR once it passes
 *  STAR_NEAR, which is what makes the same 50 stars stream forever. */
export const STAR_NEAR = 800
export const STAR_FAR = 12000

/** Half-width of the lateral scatter. Sized against STAR_FAR so a fresh star sits
 *  near the vanishing point (|x|/STAR_FAR <= 0.25) and fans outward as it closes. */
export const STAR_SPREAD = 3000

/** Closing speed, ported the way every other ROM rate in this clone is: a per-game-frame
 *  delta × TICK_HZ (the SURFACE_SEED_SPEED / TRENCH_SCROLL_SPEED idiom). `$40` a frame
 *  walks the STAR_FAR→STAR_NEAR band in ≈8.5 s — an unhurried drift, not a warp.
 *
 *  TICK_HZ is written out here rather than imported: `state.ts` imports THIS module at
 *  runtime for `initialState`'s field, so importing back would close a module cycle and
 *  leave `TICK_HZ` in its temporal dead zone the instant this constant evaluates. The
 *  value is state.ts's definition verbatim (246.094 / 12 — WSINT.MAC:145-149, GMTIMR
 *  reloads 12 IRQs per game frame). */
export const STAR_SPEED = 0x40 * (246.094 / 12)

/**
 * Lay out the 50-star field from `seed`.
 *
 * Drawn from its OWN cursor (`createRng(seed)`) rather than from `state.rng`, so
 * seeding the sky consumes nothing the gameplay RNG was going to hand out — every
 * pre-existing seeded expectation in the suite is untouched. Same seed, same sky.
 */
export function makeStarfield(seed: number): Star[] {
  const rng = createRng(seed)
  const stars: Star[] = []
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: (nextFloat(rng) * 2 - 1) * STAR_SPREAD,
      y: (nextFloat(rng) * 2 - 1) * STAR_SPREAD,
      // Spread through the band rather than all launched from STAR_FAR, so the
      // field is already in mid-stream on frame 0 instead of arriving in a wall.
      z: STAR_NEAR + nextFloat(rng) * (STAR_FAR - STAR_NEAR),
    })
  }
  return stars
}

/**
 * Slide the field one step past the eye — the ST.U* viewer translation.
 *
 * A star that reaches STAR_NEAR wraps back to the far plane keeping its x/y, so its
 * lateral ratio collapses and it re-enters near the vanishing point to stream out
 * again. The ROM instead re-rolls x/y from the hardware RNG (`STARNW`); wrapping is
 * the deterministic stand-in (logged deviation) and costs nothing visually — 50 stars
 * on 50 different tracks at 50 different phases read as a sky, not a loop.
 */
export function stepStarfield(stars: readonly Star[], dt: number): Star[] {
  const band = STAR_FAR - STAR_NEAR
  return stars.map((s) => {
    let z = s.z - STAR_SPEED * dt
    while (z < STAR_NEAR) z += band
    return { x: s.x, y: s.y, z }
  })
}
