// tests/support/sw710-contract.ts
//
// The sw7-10 contract (R10 — attract mode, intro crawl, coaching messages, the
// WSSTAR starfield). These are the fields/shape Dev ADDS to GameState in GREEN;
// declaring the TARGET shape here lets the four RED suites stay `tsc --noEmit`
// clean while the real GameState does not yet carry any of them.
//
// THE BRIDGE IS GONE (sw7-10 rework, finding F6). This file was written against a
// GameState that did not yet carry these fields, so it declared a target mirror and
// crossed the seam with `as unknown as` (the rb4-7 idiom — a plain `as` would TS2352
// on the structural mismatch). GREEN landed the fields, so the mirror is now a
// duplicate of a real type and the double-casts are dead weight: the TYPES below are
// re-exported straight from `src/core`, and `ext()` / `withExt()` are plain typed
// accessors. Every suite that imported them keeps working unchanged.
//
// WHAT DELIBERATELY DID NOT COLLAPSE: the string DATA further down. `INTRO_CRAWL`,
// the page copy and the message strings are the INDEPENDENT spec that the suites
// compare production output against — `tests/core/intro-crawl.test.ts:45` asserts the
// export equals this list. Re-pointing these at `src/core/attract.ts` would make that
// assertion compare the export to itself and go tautological. They are transcribed
// from the ROM, not imported from the code, and must stay that way.
//
// ROM provenance for every literal here is pinned in the suites that use them,
// verbatim from the 1983 "Warp Speed" source (TCMES.MAC / WSMAIN.MAC / WSSTAR.MAC,
// all .RADIX 16 via WSCOMN.MAC:5). Do NOT paraphrase a string in this file.

import { initialState, type GameState } from '../../src/core/state'
import type { Star } from '../../src/core/starfield'
import type { AttractPage, AttractState, CrawlLine } from '../../src/core/attract'

// The shapes the suites type against — now the production types themselves, so a
// change to either can no longer drift silently past this file.
export type { Star, AttractPage, AttractState, CrawlLine }

/** The sw7-10 fields on GameState. A `Pick` rather than a hand-written mirror, so it
 *  cannot describe a shape the real state does not have. */
export type Sw710Fields = Pick<GameState, 'starfield' | 'attract' | 'coaching'>


/** Read the sw7-10 fields off a state. Kept as a named accessor (rather than folded
 *  into every call site) so the suites read the same as they did through the bridge;
 *  the `Partial` is retained because the suites guard each field with `toBeDefined()`
 *  before use, and those guards are what stopped them ever passing vacuously. */
export function ext(s: GameState): Partial<Sw710Fields> {
  return s
}

/** Build a GameState carrying a sw7-10 patch. `base` should come from `initialState()`
 *  so every real field is valid. */
export function withExt(base: GameState, patch: Partial<GameState>): GameState {
  return { ...base, ...patch }
}

/** A neutral attract-mode state seeded with an explicit attract page. */
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
