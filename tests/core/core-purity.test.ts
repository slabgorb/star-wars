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
]

const SHELL_IMPORT = /\bfrom\s*['"][^'"]*\.\.\/shell\//

/** Live (comment- and string-free) code of every src/core module. */
function coreSources(): { file: string; raw: string; code: string }[] {
  return readdirSync(CORE_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((file) => {
      const raw = readFileSync(join(CORE_DIR, file), 'utf8')
      return { file, raw, code: stripStrings(stripComments(raw)) }
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
