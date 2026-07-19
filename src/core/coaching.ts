// src/core/coaching.ts
//
// In-flight coaching messages (sw7-10 / H-022) — the hints the cabinet talks a
// first-time pilot through his opening wave with.
//
// Ground truth (TCMES.MAC definitions + WSMAIN.MAC call sites; .RADIX 16 via
// WSCOMN.MAC:5). "A label's comment is not a caller" — every call site below was read
// firsthand, which is how the BON mislabel further down was caught:
//
//   * SPACE (WSMAIN.MAC:2987-2998). Inside `LDA SC.FWV / IFEQ ;?FIRST TIME THRU?` the
//     cabinet alternates two hints on a bit of its phase clock —
//     `ANDB #10 / IFEQ / LDB #MS.SFB ;SHOOT FIREBALLS / ELSE / LDB #MS.STF ;SHOOT TIE
//     FIGHTERS` — so each is held for 16 game frames at a time.
//   * TRENCH (WSMAIN.MAC:3193-3203). Same first-wave gate, alternating off `FRAMEL`
//     instead: `LDA FRAMEL / ANDA #10 / IFEQ / LDB #MS.SFB / ELSE / LDB #MS.ACW ;AVOID
//     CATWALKS`.
//   * `MS.BON` is defined `<STARTING WAVE BONUS>` (TCMES.MAC:617). Its CALL SITE carries
//     the stale comment `;"DEATH STAR BONUS EARNED"` (WSMAIN.MAC:3362) and the clone had
//     already copied that wrong text into state.ts. The message reads STARTING WAVE BONUS.

import type { GameState } from './state'

/** The ROM message strings, verbatim from TCMES.MAC. */
export const COACHING = {
  /** MS.SFB `<SHOOT FIREBALLS>` (TCMES.MAC:618). */
  shootFireballs: 'SHOOT FIREBALLS',
  /** MS.STF `<SHOOT TIE FIGHTERS>` (TCMES.MAC:619). */
  shootTies: 'SHOOT TIE FIGHTERS',
  /** MS.ACW `<AVOID CATWALKS>` (TCMES.MAC:620). */
  avoidCatwalks: 'AVOID CATWALKS',
  /** MS.BON `<STARTING WAVE BONUS>` (TCMES.MAC:617) — NOT the stale call-site comment. */
  startingWaveBonus: 'STARTING WAVE BONUS',
  /** MS.SHG `<SHIELD GONE>` (TCMES.MAC:552). */
  shieldGone: 'SHIELD GONE',
} as const

/** The ROM's alternation mask — `ANDB #10` / `ANDA #10`, i.e. bit 4, so a hint holds
 *  for 16 game frames before swapping to its partner. */
const ALTERNATE_MASK = 0x10

/**
 * The coaching hint for this frame, or `null` when the cabinet would say nothing.
 *
 * Gated on the first wave throughout — the ROM's `SC.FWV` "first time thru" flag. Later
 * waves get no hints; the pilot is assumed to have read them.
 *
 * The two phases alternate off DIFFERENT clocks, as the ROM does: space rides the
 * space-phase game-frame counter (`state.frame`, the clone's phase clock — the ROM
 * reads its PH.TIM countdown), the trench rides `state.trenchTimer`, which is this
 * clone's FRAMEL analog and the only counter that advances during a trench step.
 */
export function coachingFor(s: GameState): string | null {
  if (s.mode !== 'playing') return null
  if (s.wave !== 1) return null // SC.FWV
  if (s.phase === 'space') {
    return (s.frame & ALTERNATE_MASK) === 0 ? COACHING.shootFireballs : COACHING.shootTies
  }
  if (s.phase === 'trench') {
    return (Math.floor(s.trenchTimer) & ALTERNATE_MASK) === 0
      ? COACHING.shootFireballs
      : COACHING.avoidCatwalks
  }
  return null // the surface run carries no coaching line
}
