// src/shell/font.ts
//
// The HUD / framing text is an authentic stroke-vector font (the 1981 ROM VGMSGA
// alphabet), not a webfont — text is drawn as real glowing vectors (render.ts
// glowText) from a per-letter glyph table. There is no async font to load and no
// external asset to depend on.
//
// SH2-5 (epic SH2) retired star-wars' non-commercial vendored TTF + its webfont
// loader in favour of the shared ROM stroke-vector font. This module now
// re-exports @arcade/shared/font as the shell's single "font" entry point, so
// callers import the font (layoutText, CELL_W/CELL_H, …) from one place — and
// tests mock text observation at this seam. Mirrors tempest/asteroids, which
// converge on the same shared face (ADR-0002).
export * from '@arcade/shared/font'
