// tests/support/sw710-contract.ts
//
// The sw7-10 contract (R10 — attract mode, intro crawl, coaching messages, the
// WSSTAR starfield). These are the fields/shape Dev ADDS to GameState in GREEN;
// declaring the TARGET shape here lets the four RED suites stay `tsc --noEmit`
// clean while the real GameState does not yet carry any of them.
//
// The bridge is the rb4-7 idiom: the source genuinely has the OLD shape, this is
// the target mirror, so we cross the seam with `as unknown as` (a plain `as`
// would TS2352 on the structural mismatch). Runtime access via `ext()` returns
// `undefined` today — that undefined IS the RED signal; guard on it so no test
// passes vacuously. When Dev lands the fields, `ext()` returns real data and the
// same suites go GREEN with no edit.
//
// ROM provenance for every literal here is pinned in the suites that use them,
// verbatim from the 1983 "Warp Speed" source (TCMES.MAC / WSMAIN.MAC / WSSTAR.MAC,
// all .RADIX 16 via WSCOMN.MAC:5). Do NOT paraphrase a string in this file.

import { initialState, type GameState } from '../../src/core/state'

// --- M-015: the starfield --------------------------------------------------
/** One WSSTAR star in world space. The cabinet places 50 (`M$STNM==50.`). */
export interface Star {
  x: number
  y: number
  z: number
}

// --- H-017: the rotating attract pages -------------------------------------
/** The four idle attract pages, in `WSMAIN.MAC` TPHASE order (BNR→INS→SCR→HIS). */
export type AttractPage = 'banner' | 'instructions' | 'scoring' | 'hiscore'

// --- H-018: the receding intro crawl ---------------------------------------
/** One live line of the banner-phase special-message crawl. `size` grows 0→1 as
 *  the line recedes to its vanishing point (ROM: a 16-bit size accumulator whose
 *  high byte drives the AVG linear-scale, `SPMESS` TCMES.MAC:402-404). */
export interface CrawlLine {
  text: string
  size: number
}

/** The attract sub-state Dev threads onto GameState. `pageAge` is seconds on the
 *  current page; the crawl is only live during the 'banner' page. */
export interface AttractState {
  page: AttractPage
  pageAge: number
  crawl: readonly CrawlLine[]
}

/** The full sw7-10 extension GameState gains in GREEN. */
export interface Sw710Fields {
  /** 50 WSSTAR stars, seeded-deterministic (cabinet uses a hardware RNG — the
   *  clone's seeded RNG is a logged divergence, not infidelity). */
  starfield: readonly Star[]
  /** The rotating attract page machine + intro crawl (idle screen). */
  attract: AttractState
  /** The current in-flight coaching / bonus message, or null. */
  coaching: string | null
}

/** Read the (maybe-absent) sw7-10 fields off a state without a tsc error.
 *  Returns `undefined` per field until Dev lands it — that IS the red. */
export function ext(s: GameState): Partial<Sw710Fields> {
  return s as unknown as Partial<Sw710Fields>
}

/** Build a GameState carrying a sw7-10 extension, bridged past the not-yet-present
 *  fields. `base` should come from `initialState()` so every real field is valid. */
export function withExt(base: GameState, patch: Partial<Sw710Fields> & Partial<GameState>): GameState {
  return { ...base, ...patch } as unknown as GameState
}

/** A neutral attract-mode state seeded with an explicit attract page (bridged). */
export function attractOn(page: AttractPage, seed = 1983): GameState {
  return withExt(initialState(seed), {
    mode: 'attract',
    attract: { page, pageAge: 0, crawl: [] },
  })
}

// The 8 verbatim intro-crawl strings — TCMES.MAC:625-632 (`.SPMESS` block,
// SPMS1..SPMSZ), .RADIX 16 file, ASCII inside <...> is literal text. Apostrophe
// (line 3) and the periods (lines 2/5/6/7) and the double space (line 5) are
// authentic; the shared VGMSGA clone font lacks apostrophe/period glyphs and
// blanks them at draw — so the CORE stores the full ROM string and SHELL tests
// assert tolerantly (the sw7-3 LEIA'S precedent).
export const INTRO_CRAWL: readonly string[] = [
  'OBI-WAN KENOBI IS GONE BUT HIS',
  'PRESENCE IS FELT WITHIN THE FORCE.',
  "THE EMPIRE'S DEATH STAR, UNDER THE",
  'COMMAND OF DARTH VADER, NEARS THE',
  'REBEL PLANET.  YOU MUST JOIN THE',
  'REBELLION TO STOP THE EMPIRE.',
  'THE FORCE WILL BE WITH YOU.',
  'ALWAYS',
]

// The in-flight coaching / bonus message strings — TCMES.MAC (.RADIX 16).
// Provenance pinned per-string in coaching-messages.test.ts.
export const COACH = {
  shootFireballs: 'SHOOT FIREBALLS', // MS.SFB, TCMES.MAC:618 (space, first wave)
  shootTies: 'SHOOT TIE FIGHTERS', //   MS.STF, TCMES.MAC:619 (space, first wave, alt)
  avoidCatwalks: 'AVOID CATWALKS', //   MS.ACW, TCMES.MAC:620 (trench, first wave)
  startingWaveBonus: 'STARTING WAVE BONUS', // MS.BON, TCMES.MAC:617 — NOT "DEATH STAR BONUS EARNED"
  shieldGone: 'SHIELD GONE', //         MS.SHG, TCMES.MAC:552 (S.GAS<=0 gauge substitution)
} as const

/** The stale ROM comment (WSMAIN.MAC:3362 `;"DEATH STAR BONUS EARNED"`) that the
 *  clone already inherited at state.ts:171 — the message that must NEVER be drawn
 *  for BON. A live refutation guard, the "a label's comment is not a caller" rule. */
export const BON_MISLABEL = 'DEATH STAR BONUS EARNED'
