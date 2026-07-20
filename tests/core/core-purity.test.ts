// tests/core/core-purity.test.ts
//
// sw7-10 rule-enforcement (Phase B) — the project's HARDEST rule, which had no
// automated guard until now.
//
// CLAUDE.md: "`core/` is a PURE, deterministic simulation. It must NEVER import from
// `shell/`, touch the DOM/window/document, or call Date.now()/new Date()/
// performance.now()/Math.random()/requestAnimationFrame. All time enters core as `dt`.
// All randomness comes from the seeded RNG carried in GameState."
//
// sw7-10 adds a lot of new core surface — a 50-star starfield (randomness!) and the
// attract page timers (time!) — which is exactly where a Dev reaches for Math.random()
// or Date.now(). The starfield determinism tests catch a random starfield behaviourally;
// this catches the whole class, including a wall-clock attract timer, statically.
//
// This is a GUARD: it passes on today's tree (src/core mentions Math.random only in two
// COMMENTS) and bites the instant live code breaks the boundary.
//
// The scanner is code under test too (cp1-1 lesson): a naive raw-text match flags a
// comment that merely MENTIONS a global, and a string that merely contains "window.".
// So comments are stripped first, then strings — EXCEPT for the shell-import rule, which
// must scan with strings intact because an import specifier IS a string.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CORE_DIR = join(__dirname, '..', '..', 'src', 'core')

/** Remove block and line comments (comments first — an apostrophe inside one would
 *  otherwise open a phantom string and swallow real code). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

/** Remove string/template literal CONTENTS, so data can't masquerade as code. */
function stripStrings(src: string): string {
  return src
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
}

const BANNED: { name: string; re: RegExp }[] = [
  { name: 'Math.random', re: /\bMath\s*\.\s*random\b/ },
  { name: 'Date.now', re: /\bDate\s*\.\s*now\b/ },
  { name: 'performance.now', re: /\bperformance\s*\.\s*now\b/ },
  { name: 'new Date()', re: /\bnew\s+Date\s*\(/ },
  { name: 'requestAnimationFrame', re: /\brequestAnimationFrame\b/ },
  { name: 'window.', re: /\bwindow\s*\./ },
  { name: 'document.', re: /\bdocument\s*\./ },
  // sw7-10 rework (finding F7). The original list named the OBVIOUS impurities but left
  // three doors open, each a one-line way to smuggle the same non-determinism past the
  // guard: the global object under either of its names, and the Web Crypto RNG (the
  // reflex reach once `Math.random` is known to be banned).
  { name: 'globalThis.', re: /\bglobalThis\s*\./ },
  { name: 'self.', re: /\bself\s*\./ },
  { name: 'crypto.', re: /\bcrypto\s*\./ },
]

/** A shell import in ANY form. The original guard matched only `from '../shell/…'`, so a
 *  side-effect import (`import '../shell/x'`) and a dynamic one (`await import('../shell/x')`)
 *  both slipped through — same boundary breach, no `from` keyword (sw7-10 finding F7). */
const SHELL_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"][^'"]*(?:\.\.\/)+shell\//

/** Live (comment- and string-free) code of every src/core module, RECURSIVELY.
 *
 *  The original sweep was `readdirSync(CORE_DIR)` — top-level only. `src/core` is flat
 *  today, so the guard passed while silently covering nothing below it; the first
 *  subdirectory anyone adds would have left that code unguarded with no failure to warn
 *  them (sw7-10 finding F7). */
function coreSources(dir = CORE_DIR, prefix = ''): { file: string; raw: string; code: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) return coreSources(join(dir, entry.name), rel)
    if (!entry.name.endsWith('.ts')) return []
    const raw = readFileSync(join(dir, entry.name), 'utf8')
    return [{ file: rel, raw, code: stripStrings(stripComments(raw)) }]
  })
}

describe('core purity — the scanner itself (must-flag / must-NOT-flag fixtures)', () => {
  const live = (s: string) => stripStrings(stripComments(s))

  it('FLAGS a live banned call', () => {
    const code = live('const x = Math.random()\nconst t = Date.now()')
    expect(BANNED.find((b) => b.name === 'Math.random')!.re.test(code)).toBe(true)
    expect(BANNED.find((b) => b.name === 'Date.now')!.re.test(code)).toBe(true)
  })

  it('does NOT flag a banned name inside a comment', () => {
    const code = live('// PURE core: no DOM, no wall clock, no Math.random\n/* Date.now() is banned */\nconst a = 1')
    expect(BANNED.find((b) => b.name === 'Math.random')!.re.test(code)).toBe(false)
    expect(BANNED.find((b) => b.name === 'Date.now')!.re.test(code)).toBe(false)
  })

  it('does NOT flag a banned name inside string DATA', () => {
    const code = live('const url = "https://example.com/window.html"')
    expect(BANNED.find((b) => b.name === 'window.')!.re.test(code)).toBe(false)
  })

  it('does NOT flag lookalike identifiers', () => {
    const code = live('const windowSize = 4\nconst documented = true\nconst randomSeed = 7')
    for (const b of BANNED) expect(b.re.test(code), `${b.name} must not match a lookalike`).toBe(false)
  })

  it('FLAGS a shell import (scanned with strings intact)', () => {
    expect(SHELL_IMPORT.test("import { render } from '../shell/render'")).toBe(true)
    expect(SHELL_IMPORT.test("import { stepGame } from './sim'")).toBe(false)
  })

  // --- sw7-10 rework (F7): the doors the original guard left open -------------
  it('FLAGS the global object under either name, and the Web Crypto RNG', () => {
    const find = (n: string) => BANNED.find((b) => b.name === n)!.re
    expect(find('globalThis.').test(live('const t = globalThis.performance.now()'))).toBe(true)
    expect(find('self.').test(live('const r = self.crypto'))).toBe(true)
    expect(find('crypto.').test(live('crypto.getRandomValues(buf)'))).toBe(true)
  })

  it('does NOT flag lookalikes of the newly banned names', () => {
    const code = live('const selfish = 1\nconst cryptography = 2\nconst globalThisish = 3')
    for (const b of BANNED) expect(b.re.test(code), `${b.name} must not match a lookalike`).toBe(false)
  })

  it('FLAGS a SIDE-EFFECT shell import (no `from` keyword)', () => {
    expect(SHELL_IMPORT.test("import '../shell/audio'")).toBe(true)
  })

  it('FLAGS a DYNAMIC shell import', () => {
    expect(SHELL_IMPORT.test("const m = await import('../shell/render')")).toBe(true)
    expect(SHELL_IMPORT.test("const m = require('../shell/render')")).toBe(true)
  })

  it('FLAGS a shell import from a NESTED core module (deeper relative path)', () => {
    expect(SHELL_IMPORT.test("import { x } from '../../shell/render'")).toBe(true)
  })

  it('does NOT flag a non-shell import that merely contains the word', () => {
    expect(SHELL_IMPORT.test("import { x } from './shell-model'")).toBe(false)
    expect(SHELL_IMPORT.test("import { x } from '../core/seashell'")).toBe(false)
  })
})

describe('core purity — src/core stays a pure deterministic simulation', () => {
  it('reads a non-trivial set of core modules (guard against a vacuous sweep)', () => {
    expect(coreSources().length).toBeGreaterThan(5)
  })

  it('no core module calls a wall clock, Math.random, rAF, or touches the DOM', () => {
    const violations: string[] = []
    for (const { file, code } of coreSources()) {
      for (const { name, re } of BANNED) {
        if (re.test(code)) violations.push(`${file}: ${name}`)
      }
    }
    expect(violations, 'src/core must stay pure — all time via dt, all randomness via the seeded Rng').toEqual([])
  })

  it('no core module imports from src/shell', () => {
    const violations = coreSources()
      .filter(({ raw }) => SHELL_IMPORT.test(raw))
      .map(({ file }) => file)
    expect(violations, 'core must never import from shell').toEqual([])
  })
})
