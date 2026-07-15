# Star Wars (1983) primary-source audit — Preflight ground truth

**Date:** 2026-07-15 · **Phase 0 of the ROM-fidelity-audit method.**
Every downstream auditor/refuter is handed this brief verbatim. Do not re-derive
these facts; cite them. Source of authority: the original Atari MACRO-11 source
(project codename **"Warp Speed"**), LF copy at
`~/Projects/star-wars-1983-source-text` (github `historicalsource/star-wars`,
commit `5355b76`). **Never read or cite the CRLF sibling
`~/Projects/star-wars-1983-source`** — same content, different bytes.

---

## 1. WHAT SHIPPED — the module allowlist

The authority is the link command files, not the directory listing.

### Main CPU (6809) — root bank (`WSROOT.LNK`)

```
WSPROG,WSMAIN/CWSFIL0/CWSBASE,WSCPU/CWSFIL1/CWSGAS,WSGLOW,WSGRND,WSGUNS,
WSLAZR/CWSFIL2/CWSPANL,WSSITE,WSXPLD/CWSXMT,TCEROM,TCHSCR/CWSROOT,
WSMATH/CWSFIL3/CWSVROM,TCSPLS,WSCOIN/CTCMES/CWSSTUB,WSINT,TCTEST/CWSFIL4/CWSCKSM
```

→ **WSPROG, WSMAIN, WSFIL0, WSBASE, WSCPU, WSFIL1, WSGAS, WSGLOW, WSGRND,
WSGUNS, WSLAZR, WSFIL2, WSPANL, WSSITE, WSXPLD, WSXMT, TCEROM, TCHSCR, WSROOT,
WSMATH, WSFIL3, WSVROM, TCSPLS, WSCOIN, TCMES, WSSTUB, WSINT, TCTEST, WSFIL4,
WSCKSM**

### Main CPU — overlay bank (`WSOVLY.LNK` / `WSOVLX.LNK`)

→ **WSGLOB, WSOVLY, WSOBJ, WSFIL9, WSSTAR** (+ WSPROG shared).
`LINKIT.COM` confirms the three-pass dance: OVLX is the same overlay linked
first for its symbol table (adds WSGLOB); WSOVLY is the final overlay image.

### Transitive `.INCLUDE`s (assemble real bytes/symbols into the above)

| Included | Into | Note |
|---|---|---|
| **WSCOMN** | every WS/TC module (line ~2 of each) | common equates; sets the radix |
| **HLL69F, MOP69** | WSCOMN:113–114 | structured-assembly + macro libraries |
| **WSVCTR** | WSROOT:32, WSOVLY:34 | vector-generator macros |
| **WSVGMC** | WSVROM:69 | VG macro set |
| **WSVGAN** | WSVROM:1235 | alphanumerics glyphs (**RADIX 10**) |
| **DPCOIN** | WSCOIN:31, WSGLOB:312 | coin direct-page vars |
| **COIN69** | WSCOIN:114 | coin routine library |
| **SNDPBX** | WSXMT:53, SNDAUX:471 | main↔sound-board mailbox protocol |
| **TCODE2** | SWMP:23 | math-box microcode assembler macros |

### Sound CPU (6809) — `SNDAUX.LNK`

→ **SNDGLB, SWVOC3, SWMUS, SNDAUD, SNDPM, SNDSPK, SNDAUX, SNFILL, SNDSUM**
(+ **SNDCMN** included by each, which includes HLL69F/MOP69).

### Separate PROMs (not 6809 code, still shipped hardware truth)

- **SWMP.MAC** — Math Box microcode (its doc: `SWMP.DOC`)
- **AVGROM.MAC** — AVG state PROM (hardware state machine, not pictures)

### DENYLIST — never shipped; citing one auto-deletes the finding

| Module | Why it never shipped |
|---|---|
| **SWVOC2** | superseded vocabulary — SWVOC3 is in SNDAUX.LNK / SWSTST.LNK |
| **VGAN** | superseded alphanumerics — WSVROM includes **WSVGAN**, not VGAN |
| **WSTEST, VGTST, MATEST, DIVTST, RAMTST, LED, SWSTST** | standalone test/diagnostic programs, absent from all game links |
| **XYSIG, SWSIG** | signature-analysis tooling |
| **WSMAIN.FUL** | variant file; MACIT.COM assembles `WSMAIN.MAC` |
| any `.LDA/.DOC/.COM/.LIS/.DIR/.BAS/.DAT/.SND/.EDT` | build outputs / docs / tools, not source modules |

### Conditional assembly

`DEVSYS==0` as the source stands — ROM-game configuration
(WSINT.MAC:3, TCEROM.MAC:51, TCTEST.MAC:3). Every block guarded by
`.IF EQ,DEVSYS-1` (dev-system-only) **never assembled**; `.IFF`/ROM branches
did. A finding resting on a dev-only block is refuted on sight.

---

## 2. WHAT RADIX

**Default: RADIX 16 everywhere on both CPUs.** `WSCOMN.MAC:5` (`.RADIX 16`) is
included at the top of every main-CPU module; `SNDCMN.MAC:5` likewise for the
sound board. Bare numbers are **HEX**; decimal literals carry a trailing period
(`11.`, `20.`, `250.`). A trailing period inside a hex file makes the literal
decimal — `LDA #11.` is eleven, not seventeen.

**Exceptions — the traps:**

| File | Radix | Evidence |
|---|---|---|
| **WSVGAN.MAC** | **10 (decimal!)** | WSVGAN.MAC:1 `.RADIX 10` |
| **WSVROM.MAC** | flips mid-file | 16 (inherited) → `.RADIX 10.` at :724 → `.RADIX 16.` at :1164 → includes WSVGAN (radix 10) at :1235 → `.RADIX 16` at :1246 |
| COIN69.MAC | 16, then restores caller's | :11 sets, :459 `.RADIX .RAD` restores |
| TCODE2.MAC | 16, then restores | :24 sets, :261 restores |

Always check which region of WSVROM a citation lands in before decoding its
numbers.

---

## 3. WHAT FRAME RATE — the timebase

**NOT 60. The game logic runs at ~20.5 Hz.**

Derivation (three independent corroborations):

1. **Hardware IRQ rate** (MAME `starwars.cpp`, schematic-derived):
   `12.096 MHz ÷ 4096 (CLOCK_3KHZ) ÷ 12` = **246.094 Hz** → period 4.0635 ms.
2. **IRQs per game frame** — WSINT.MAC:145–148: the IRQ decrements `GMTIMR`;
   on expiry reloads `LDA #11.` (decimal 11 → fires every **12 IRQs**) and
   increments `GMSYNC`. The author wrote the answer in his own hand:
   `;12.*4.2MS==>50. MS, 20 PER SECOND` (WSINT.MAC:147).
3. **Author's other clocks agree**: `$INTCT` byte-wrap treated as
   "ONCE A SECOND" (WSINT.MAC:198–199 — 256/246.09 = 1.04 s); `ANDA #03` =
   "EVERY 16 MILS" (WSINT.MAC:216 — 4/246.09 = 16.25 ms).

**Game-logic frame = 12 IRQs = 48.76 ms = 20.508 Hz.** The mainline spins in
`WAITFRAME` on `GMSYNC` (WSMAIN.MAC:278–279) and runs one phase-table pass per
game frame (WSMAIN.MAC:306–314).

**Fixed or ceiling?** Fixed-rate ticks, degrade-by-dropping: the IRQ produces
ticks at exactly 20.508 Hz; a lagging mainline *loses* backlog (`LSR GMSYNC`
halves the pending count) so overload slows the game rather than fast-forwarding
it; runaway backlog (bit 6 overflow) is a deliberate crash-to-watchdog
(WSINT.MAC:149–152).

**Three cadences coexist — identify which one governs a constant before
converting:**

| Cadence | Rate | What runs on it |
|---|---|---|
| IRQ | 246.09 Hz | input debounce, pots, coin logic, watchdog, VG buffer swap, color-cycle counters |
| 4-IRQ tick | 61.5 Hz ("16 ms") | GTIME/TIMER BCD wall clocks |
| **Game frame** | **20.508 Hz** | **all gameplay: motion, AI, phase logic, frame-counted timers** |

The **sound board** is a separate 6809 with its own timebase — the audio
auditor derives it from SNDAUX/SNDCMN; do not assume any main-board rate there.

### Ours, for contrast

`star-wars/src/main.ts:136` drives `createLoop` from `@arcade/shared/loop` —
**fixed-timestep 60 Hz** (`hz = 60` default), `stepGame(state, input, dt)` in
float seconds.

**Conversion rule for every numeric claim:**
`per-second value = ROM per-game-frame value × 20.508`.
A port that assumed 60 fps is **2.93× too fast**. Show the arithmetic in the
claim; a constant that "matches" on a 60 Hz base is a manufactured agreement.

BCD warning: scores/timers are often BCD with an implicit low digit
(a stored `15` may mean 150 points).

---

## Module map (for pairing scopes)

From each module's own `.TITLE`:

| Module | The author's title | Ours-side counterpart |
|---|---|---|
| WSMAIN | GAME PLAY (mainline, TPHASE phase table) | `core/sim.ts` phase machine, `core/state.ts` |
| WSCPU | **CPU ALIEN CONTROL AND CHOREOGRAPHY** (TIE AI, waves, spawn tables, collision) | `core/sim.ts` TIE logic, `docs/tie-flight-ai-model.md` |
| WSGAS | GAS AND SCORE | `core/gameRules.ts` scoring |
| WSGLOW | GLOW AND SHIELDS | shields in `core/gameRules.ts`/`sim.ts` |
| WSGRND | GROUND OBJECT STUFF (tower mazes, TTWRS) | `core/surface-grid.ts`, `core/surfaceMazes.ts` |
| WSBASE | BASE STAR (DEATH STAR FRAMEWORK) — trench | `core/trench-*.ts` |
| WSPANL | PANEL ON WALLS OF TRENCH (catwalks) | `core/trench-obstacles.ts` |
| WSGUNS | GUNS AS SHOOTING OBJECTS | `core/sim.ts` firing |
| WSLAZR | LAZARS | `core/sim.ts` lasers/fireballs |
| TCSPLS | SPLASH ROUTINES FOR LASER SHOTS | shot impact FX |
| WSXPLD | EXPLODE | explosions, Death Star finale (DX1–DX3) |
| WSSITE | HANDLE SITE (gun sight) | crosshair/HUD |
| WSSTAR | STAR GENERATORS | starfield |
| WSOBJ | OBJECT TABLES AND VECTOR DRAW ROUTINES | `core/models.ts`, `core/modelView.ts` |
| WSVROM | vector pictures (GNB/GNT sparkles etc.) | `core/models.ts` 2D pictures, render |
| WSMATH | MATH AND COMMON ROUTINES | `@arcade/shared/math3d` usage sites |
| WSINT | HARDWARE INTERRUPTS (the timebase) | `main.ts` loop wiring |
| TCHSCR | TOMCAT HI SCORE | `@arcade/shared/highscore` usage |
| TCMES | MESSAGE GENERATOR | `core/hud.ts`, `shell/font.ts` |
| WSXMT | XMIT WITH SOUND BOARD | `core/events.ts` speech/sfx cues |
| SWMUS/SNDPM | STAR WARS TUNES / POKEY MUSIC DRIVER | `tools/music-bake`, `shell/audio.ts` |
| SWVOC3/SNDSPK | VOCABULARY / SPEAK UP (TMS5220) | `tools/speech-bake` |
| SNDAUD | AUDIO SOUND GENERATOR (SFX) | `tools/pokey-bake`, `shell/audio.ts` |
| WSCOIN/TCEROM/TCTEST/WSCKSM/WSSTUB | coin/EAROM/self-test/checksums/stubs | mostly N/A (no cabinet) — expect NO_COUNTERPART/wont_fix |

**World metric (established previously, still true):** 16-bit raw ROM units,
`$4000` = 1.0 fixed-point; play cube ±`$7CFF`; TIE spawn depth `$7C00`.
`core/models.ts` vertices are ROM units 1:1 — distances port unscaled.

**Ours-side citation rule:** `ours` must be a tracked file in the star-wars
repo — never `node_modules/`. Math Box internals (`@arcade/shared/math3d`) are
audited via their star-wars usage sites; a deep SWMP↔math3d diff belongs to an
arcade-shared audit (recorded as a limitation).
