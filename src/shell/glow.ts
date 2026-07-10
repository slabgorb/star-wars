// src/shell/glow.ts
//
// SH2-8 (epic SH2): the shell's single entry point for the shared neon-glow
// primitive. Mirrors ./font — re-exports @arcade/shared/glow (withGlow,
// glowPolyline, GlowStyle) so the 3D wireframe and HUD lines stroke through one
// shared set-draw-reset-blur envelope instead of re-hand-writing it. Per-cabinet
// NUMBERS (the cockpit-cyan GLOW palette, blur radius, line width) stay in the
// shell; where the cabinet wants additive glow it keeps its own
// globalCompositeOperation = 'lighter' envelope AROUND the shared call.
export * from '@arcade/shared/glow'
