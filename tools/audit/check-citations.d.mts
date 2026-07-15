// Type declaration for the JS citation checker, so `tests/audit/citations.test.ts`
// can import it under strict `tsc --noEmit` (moduleResolution: bundler) without a
// TS7016 "no declaration file" error. The implementation is `check-citations.mjs`;
// this only describes its public surface. See that file for behaviour.

/** A parsed audit finding. Shape is validated at runtime by the checker; the public
 *  type is intentionally open (findings carry many optional fields). */
export interface CitationFinding {
  id?: string
  [key: string]: unknown
}

/**
 * Re-open every finding's citations and return a list of human-readable error
 * strings (empty when all citations are valid). `sourceDir` is the absolute path to
 * the LF Atari source, or `null` to skip the source-side byte checks (e.g. in CI).
 */
export function checkFindings(
  findings: readonly CitationFinding[],
  opts: { repoRoot: string; sourceDir: string | null },
): string[]
