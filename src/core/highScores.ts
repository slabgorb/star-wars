// src/core/highScores.ts
//
// The ROM default high-score board (sw7-3 / H-015). A real cabinet's DOINTS
// (TCHSCR.MAC:701-716) copies 10 default entries — INTINT initials + INTSCR
// scores — into the table on a NOVRAM reset, so a fresh machine greets the
// player with the iconic Rebel names, not an empty ladder.
//
// The scores are PACKED BCD, not hex: `INTSCR: .WORD 0128,5353` is the
// decimal-digit string 0128'5353 = 1,285,353 (each nibble is a BCD digit). The
// initials are hex letter-indices A=1..Z=26: `INTINT: .BYTE 0F,02,09` =
// O(15) B(2) I(9) = OBI. Both decodes verified arithmetically against
// ~/Projects/star-wars-1983-source-text/TCHSCR.MAC:718-738.
//
// The ROM hi-score table carries no per-entry wave; our HighScoreEntry<'wave'>
// schema requires one, so `wave: 0` is a "seeded default — no real run" marker
// (a clone artifact, not a ROM value).
import type { HighScoreTable } from '@arcade/shared/highscore'

/** The ROM's 10 seeded high-score entries, highest first (INTINT / INTSCR). */
export const DEFAULT_HIGH_SCORES: HighScoreTable<'wave'> = [
  { name: 'OBI', score: 1_285_353, wave: 0 },
  { name: 'WAN', score: 1_110_936, wave: 0 },
  { name: 'HAN', score: 1_024_650, wave: 0 },
  { name: 'GJR', score: 872_551, wave: 0 },
  { name: 'MLH', score: 813_553, wave: 0 },
  { name: 'JED', score: 704_899, wave: 0 },
  { name: 'NLA', score: 518_000, wave: 0 },
  { name: 'EJD', score: 492_159, wave: 0 },
  { name: 'EAR', score: 384_766, wave: 0 },
  { name: 'RLM', score: 380_655, wave: 0 },
]

/**
 * DOINTS-on-reset: a fresh (empty) board gets the ROM defaults; a board that
 * already holds any real score is returned untouched — the ROM copies the
 * defaults on RESET only, never over a player's ladder.
 */
export function seedDefaultHighScores(loaded: HighScoreTable<'wave'>): HighScoreTable<'wave'> {
  return loaded.length === 0 ? [...DEFAULT_HIGH_SCORES] : loaded
}
