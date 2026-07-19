// src/core/attract.ts
//
// The front-of-house attract loop (sw7-10 / H-017 + H-018): the rotating page
// machine and the receding intro crawl, plus the verbatim ROM copy each page draws.
//
// Ground truth (1983 "Warp Speed" source; every file .RADIX 16 via WSCOMN.MAC:5):
//
//   * The cabinet dispatches on a phase byte through the TPHASE table
//     (`LDA PHASE / LSLA / LDX #TPHASE / JSR @A(X)`, WSMAIN.MAC:307-312) whose idle
//     run is BNR → INS → SCR → HIS (WSMAIN.MAC:335-338), closing back to the banner.
//   * Each page hands itself off on its own countdown:
//       BNR→INS  TCMES.MAC:441-444  (`LDD BN.CNT / CMPD #200 / IFHS / LDA #PH$INS`)
//       INS→SCR  WSMAIN.MAC:688-689 (`LDD #0200 / STD PH.TIM`), expiring at :708
//       SCR→HIS  WSMAIN.MAC:718-719 (`LDD #0200 / STD PH.TIM`), expiring at :739
//       HIS→BNR  WSMAIN.MAC:883-884 (`LDD #0100 / STD PH.TIM`), expiring at :923-927
//     So the hi-score board holds for HALF as long as the other three.
//   * The crawl lines arrive on the TSPMAL alarm schedule (TCMES.MAC:468-476) and each
//     one RECEDES on a 16-bit scale accumulator: `SPMON` seeds size 0 and increment
//     `#0100` (TCMES.MAC, SPMON), `SPMESS` adds it every frame (`LDD 1(X) / ADDD 3(X) /
//     STD 1(X)`, TCMES.MAC:402-404) and retires the line past `#0F000` (TCMES.MAC:415).
//
// Everything here is pure data + arithmetic on `pageAge`. Drawing is the shell's job.

import { TICK_HZ } from './state'

/** The four idle pages, in TPHASE order (WSMAIN.MAC:335-338). */
export type AttractPage = 'banner' | 'instructions' | 'scoring' | 'hiscore'

/** One live crawl line. `size` is the ROM's scale accumulator normalised 0→1: 0 at
 *  the vanishing point, 1 at the `#0F000` retirement (TCMES.MAC:415). */
export interface CrawlLine {
  text: string
  size: number
}

/** The attract sub-state. `pageAge` is seconds on the current page; `crawl` is live
 *  only during the banner. */
export interface AttractState {
  page: AttractPage
  pageAge: number
  crawl: readonly CrawlLine[]
}

/** The closed idle cycle (WSMAIN.MAC:335-338 + the HIS→BNR close at :925-927). */
const NEXT_PAGE: Record<AttractPage, AttractPage> = {
  banner: 'instructions',
  instructions: 'scoring',
  scoring: 'hiscore',
  hiscore: 'banner',
}

/** Per-page dwell in ROM game-frame ticks — `#0200` for the banner/brief/table,
 *  `#0100` for the board. Cited per page in the header above. */
const PAGE_TICKS: Record<AttractPage, number> = {
  banner: 0x200,
  instructions: 0x200,
  scoring: 0x200,
  hiscore: 0x100,
}

/** Dwell in seconds — the tick count over the 20.508 Hz logic rate (sw7-1), the same
 *  conversion every other ROM duration in this clone uses. ≈25 s / ≈12.5 s. */
export function pageDwellSeconds(page: AttractPage): number {
  return PAGE_TICKS[page] / TICK_HZ
}

// The 8 special-message lines, verbatim from the `.SPMESS` block (TCMES.MAC:625-632).
// The apostrophe, the four periods and the double space in "REBEL PLANET.  YOU" are
// AUTHENTIC. The shared VGMSGA font carries no apostrophe or period glyph and blanks
// them at draw time; the core keeps the true ROM string regardless (the sw7-3 LEIA'S
// precedent) so it renders correctly the day that glyph lands.
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

/** `TSPMAL` — the BN.CNT tick each crawl line enters on (TCMES.MAC:468-476). One
 *  entry per INTRO_CRAWL line, in order. */
const CRAWL_ALARM_TICKS: readonly number[] = [0x41, 0x50, 0x60, 0x70, 0x80, 0x90, 0xa0, 0xb8]

/** Game frames a line takes to recede from nothing to retirement: the `#0F000`
 *  cut-off over the `#0100` per-frame increment `SPMON` seeds = 240 frames (≈11.7 s). */
const CRAWL_LIFE_TICKS = 0xf000 / 0x100

/**
 * The crawl lines live at `pageAge` seconds into the banner — derived, not accumulated,
 * so it cannot drift from the page clock and needs no state of its own.
 */
export function crawlAt(pageAge: number): CrawlLine[] {
  const tick = pageAge * TICK_HZ
  const live: CrawlLine[] = []
  for (let i = 0; i < INTRO_CRAWL.length; i++) {
    const age = tick - CRAWL_ALARM_TICKS[i]
    if (age < 0) continue // not yet alarmed
    const size = age / CRAWL_LIFE_TICKS
    if (size >= 1) continue // past #0F000 — SPMOFF retired it
    live.push({ text: INTRO_CRAWL[i], size })
  }
  return live
}

/**
 * Advance the attract machine by `dt`. A page that outlives its dwell hands off to the
 * next in TPHASE order with a fresh clock — which also restarts the crawl each time the
 * loop comes back around to the banner.
 */
export function stepAttract(attract: AttractState, dt: number): AttractState {
  let { page } = attract
  let pageAge = attract.pageAge + dt
  if (pageAge >= pageDwellSeconds(page)) {
    page = NEXT_PAGE[page]
    pageAge = 0
  }
  return { page, pageAge, crawl: page === 'banner' ? crawlAt(pageAge) : [] }
}

// --- The page copy ----------------------------------------------------------
// Verbatim ROM message text. The INSTRUCTIONS brief is MS.FLI..FLZ (TCMES.MAC:553-568)
// and the SCORING table is MS.SCR..SCZ (:573-581) — each `.MESS` line is one entry, in
// the order the cabinet draws them top to bottom.

/** `<FLIGHT INSTRUCTIONS TO RED FIVE>`, MS.FLI (TCMES.MAC:553). */
export const INSTRUCTIONS_HEADER = 'FLIGHT INSTRUCTIONS TO RED FIVE'

/** The numbered flight brief, MS.FLI+1 .. MS.FLZ (TCMES.MAC:554-568).
 *  The gap in "FOR   COLLISIONS." is authentic — the cabinet paints the shield count
 *  into it at runtime from a nibble (VWNIBL); the clone has no operator option feeding
 *  that number, so the gap is left as the ROM authored it. */
export const INSTRUCTIONS_BODY: readonly string[] = [
  '1.  YOUR X-WING IS EQUIPPED WITH AN',
  'INVISIBLE DEFLECTOR SHIELD THAT',
  'WILL PROTECT YOU FOR   COLLISIONS.',
  '2.  DEFLECTOR STRENGTH IS LOST WHEN',
  'A FIREBALL IMPACTS YOUR SHIELD OR',
  'WHEN YOU STRIKE A LASER TOWER OR',
  'TRENCH CATWALK.',
  '3.  AIM YOUR LASERS WITH CURSOR TO',
  'EXPLODE EMPIRE TIE FIGHTERS, LASER',
  'TOWER TOPS AND TRENCH TURRETS.',
  '4.  SHOOT FIREBALLS BEFORE THEY',
  'IMPACT YOUR SHIELD.',
  '5.  THE REBEL FORCE IS DEPENDING ON',
  'YOU TO STOP THE EMPIRE BY BLOWING',
  'UP THE DEATH STAR.',
]

/** `<SCORING>`, MS.SCR (TCMES.MAC:573). */
export const SCORING_HEADER = 'SCORING'

/** The per-enemy point table, MS.SC1..SCZ (TCMES.MAC:574-581). Name and value are ONE
 *  `.MESS` string in the ROM, space-padded to a fixed 34-column line — kept whole so the
 *  values line up on screen exactly as the cabinet aligns them. */
export const SCORING_ROWS: readonly string[] = [
  'TIE FIGHTERS                 1,000',
  "DARTH VADER'S SHIP           2,000",
  'LASER BUNKERS                  200',
  'LASER TOWERS                   200',
  'TRENCH TURRETS                 100',
  'FIREBALLS                       33',
  'EXHAUST PORT                25,000',
  'DESTROYING ALL TOWER TOPS   50,000',
]
