// tests/core/intro-crawl.test.ts
//
// sw7-10 RED — H-018: the receding intro-crawl "special messages" (core half).
//
// Ground truth (TCMES.MAC, .RADIX 16 via WSCOMN.MAC:5 — verified firsthand):
//   * 8 lines SPMS1..SPMSZ (TCMES.MAC:625-632), verbatim in INTRO_CRAWL — the crawl
//     that "RECEDE[S] INTO THE DISTANCE … THE 'STAR WARS' EFFECT" (TCMES.MAC:167,231).
//   * runs during the attract BANNER page (PH$BNR), before FLIGHT INSTRUCTIONS.
//   * lines spawn STAGGERED on the BN.CNT alarm schedule TSPMAL (TCMES.MAC:468-476:
//     .WORD 0041/0050/0060/0070/0080/0090/00A0/00B8) — not all at once.
//   * each line RECEDES: a 16-bit size accumulator (offset 1) gets its scale-increment
//     added every frame (SPMESS, TCMES.MAC:402-404 `LDD 1(X)/ADDD 3(X)/STD 1(X)`),
//     retired once it hits ~#0F000 (TCMES.MAC:415,431). Size grows 0→1 over a line's life.
//
// The crawl lives on `state.attract.crawl` (undefined until Dev lands it → red). The
// core stores the FULL ROM string (apostrophe/periods included, per the sw7-3 precedent);
// the font blanks the missing glyphs only at draw time.
import { describe, it, expect } from 'vitest'
import { stepGame } from '../../src/core/sim'
import { NO_INPUT } from '../../src/core/input'
import { attractOn, ext, INTRO_CRAWL, type CrawlLine } from '../support/sw710-contract'

const DT = 1 / 30

/** Sweep the banner page and return the per-frame crawl snapshots (undefined once). */
function sweepCrawl(seconds: number): (readonly CrawlLine[])[] {
  let s = attractOn('banner')
  const frames: (readonly CrawlLine[])[] = []
  const steps = Math.round(seconds / DT)
  for (let i = 0; i < steps; i++) {
    const crawl = ext(s).attract?.crawl
    if (crawl === undefined) return frames // red: attract/crawl not landed yet
    frames.push(crawl)
    s = stepGame(s, NO_INPUT, DT)
  }
  return frames
}

describe('sw7-10 H-018 — the banner crawl plays all 8 authentic lines', () => {
  it('every SPMS line appears over the banner phase, and only those', () => {
    const frames = sweepCrawl(15)
    expect(frames.length, 'attract.crawl must exist during the banner page').toBeGreaterThan(0)
    const seen = new Set<string>()
    for (const f of frames) for (const line of f) seen.add(line.text)
    expect([...seen].sort()).toEqual([...INTRO_CRAWL].sort())
  })
})

describe('sw7-10 H-018 — the lines enter STAGGERED (the TSPMAL alarm schedule)', () => {
  it('line 1 spawns before line 8, and not every line on the same frame', () => {
    const frames = sweepCrawl(15)
    expect(frames.length, 'attract.crawl must exist').toBeGreaterThan(0)
    const firstSeen = new Map<string, number>()
    frames.forEach((f, i) => {
      for (const line of f) if (!firstSeen.has(line.text)) firstSeen.set(line.text, i)
    })
    const first = firstSeen.get(INTRO_CRAWL[0])
    const last = firstSeen.get(INTRO_CRAWL[7])
    expect(first, 'the first crawl line must appear').toBeDefined()
    expect(last, 'the last crawl line must appear').toBeDefined()
    // Staggered: the closing "ALWAYS" enters strictly after the opening line.
    expect(last!).toBeGreaterThan(first!)
  })
})

describe('sw7-10 H-018 — each line RECEDES (its size grows over its life)', () => {
  it('a line seen across frames has a strictly larger size later than at entry', () => {
    const frames = sweepCrawl(15)
    expect(frames.length, 'attract.crawl must exist').toBeGreaterThan(0)
    // Track the opening line's size wherever it is live.
    const sizes: number[] = []
    for (const f of frames) {
      const line = f.find((l) => l.text === INTRO_CRAWL[0])
      if (line) sizes.push(line.size)
    }
    expect(sizes.length, 'the opening line must be live for several frames').toBeGreaterThan(2)
    expect(sizes[sizes.length - 1], 'the line must recede (size grows toward its vanishing point)').toBeGreaterThan(sizes[0])
  })
})
