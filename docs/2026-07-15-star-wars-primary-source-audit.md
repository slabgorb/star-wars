# Star Wars (1983) — primary-source fidelity audit

**Date:** 2026-07-15 · **Method:** ROM-fidelity-audit (paired auditors → coverage
review → adversarial refutation → clustering) · **Corpus:** 173 machine-checked
findings across 10 subsystem pairs, every citation byte-verified on both sides
(`npm test -- citations`), 53 findings adversarially attacked, **0 killed,
21 materially corrected**.

**Primary source:** the original Atari MACRO-11 source, codename **"Warp
Speed"** (`historicalsource/star-wars` @ `5355b76`), LF copy at
`~/Projects/star-wars-1983-source-text`. This audit supersedes
[`sw2-6-disassembly-fidelity-audit.md`](./sw2-6-disassembly-fidelity-audit.md)
(disasm-based, uncited) wherever they disagree.

**Ground truth:** [`docs/audit/preflight.md`](./audit/preflight.md) ·
**Pairing plan:** [`docs/audit/plan.md`](./audit/plan.md) ·
**Findings:** [`docs/audit/findings/pair-*.json`](./audit/findings/) (with
merged refutation verdicts) · **Coverage review:**
[`docs/audit/coverage-review.md`](./audit/coverage-review.md)

---

## The headline

**The game world runs at the wrong speed, in three different ways, and the
data underneath it is largely faithful.**

1. The cabinet's game logic ticks at **20.508 Hz** (12 IRQs @ 246.094 Hz —
   the author's own comment: `;12.*4.2MS==>50. MS, 20 PER SECOND`,
   WSINT.MAC:147). Our sim steps at 60 Hz and converts ROM per-frame rates
   through `TICK_HZ = 30` — a constant that matches nothing on the cabinet
   (T-007). Everything routed through it runs **1.46× fast**; everything
   counted per-step runs **2.93× fast** (T-008).
2. The trench scrolls at **500 u/s against the ROM's ~15,750 u/s** (B-008,
   ~31× — re-derived independently by refutation; render-scale-independent),
   and the surface scrolls a fixed 600 u/s where the ROM accelerates
   5,250→21,000 u/s (D-022).
3. Meanwhile the **data** is excellent: all ten surface mazes byte-perfect
   (D-001..D-010), every score value confirmed (S-001..S-009), the TIE model
   family exact (M-001..M-003), trench geometry confirmed to the unit
   (B-001..B-007, B-013, B-014). Where we ported tables, we ported them true.
   Where we hand-invented *behavior*, we drifted.

The single most repeated defect class is not a wrong constant but a **wrong
base**: the ROM's wave counter `GM.WAV` is 0-based; ours is 1-based. One
misread, four confirmed symptoms (U-005/U-006/U-007/U-008): the Imperial March,
"Great shot kid", and both trench voice-cue sets all fire on the **wrong (or
inverted) wave sets**.

---

## The traps (read before touching anything)

| Trap | Detail |
|---|---|
| **The frame rate is 20.508 Hz** | Not 60. Not 30 (`TICK_HZ=30` is our invention). Per-second = ROM-per-frame × 20.508. |
| **`GM.WAV` is 0-based** | Every ROM wave-gate (`CMPA #4-1` = "wave 4+") must be converted; our `state.wave` is 1-based. Four shipped bugs from this one base error. |
| **WSVROM.MAC flips radix mid-file** | 16 → `.RADIX 10.` @724 → `.RADIX 16.` @1164 → WSVGAN (radix 10) @1235 → 16 @1246. WSVGAN.MAC is RADIX 10 throughout. Everything else is 16: bare = hex, trailing `.` = decimal. |
| **Scores are BCD** | Nibble-per-digit words: `.WORD 0128,5353` = 1,285,353. An implicit low digit is common. |
| **Decoy files** | SWVOC2 (shipped = SWVOC3), VGAN (shipped = WSVGAN), WSMAIN.FUL, WSTEST/VGTST/MATEST/DIVTST/RAMTST/LED/SWSTST/XYSIG — never assembled into the game. |
| **DEVSYS==0** | `.IF EQ,DEVSYS-1` blocks never shipped. |
| **The CRLF sibling** | `~/Projects/star-wars-1983-source` has identical text, different bytes. Only the `-text` LF copy is citable. |
| **Sound board ≠ main board** | Separate 6809: 4.096 ms IRQ, music/FX voices advance every 2nd IRQ = **8.192 ms tick** (our bake tools already match). |
| **Macro traps that bit auditors** | `.NEXTMESS` repositions an existing message (it defines no text — the "<REBEL FORCE>" string never existed); the VJFLS white-flash branch needs timer > #1F, and TIE pieces are born at #18/#10 so they **never flash**; `ASRD5/ASRD6` are a fall-through chain (÷32/÷64); the 8-frame laser value is a per-shot sweep **duration**, not a re-fire cooldown. |

## Rosetta glossary

| ROM name | Meaning | Ours |
|---|---|---|
| `GMTIMR`/`GMSYNC` | IRQ→mainline game-frame timer/semaphore (12 IRQs) | `createLoop` accumulator (60 Hz) |
| `TPHASE`, `PH.TIM` | phase dispatch table; per-phase timer | `state.phase` machine |
| `GM.WAV` | wave counter, **0-based** | `state.wave`, 1-based |
| `S.GAS` | shield units ("GAS"); 0 = dead | shields in `gameRules.ts` |
| `TBG*` | TIE begin-location tables (depth $7C00, laterals ×$400) | spawn positions in `sim.ts` |
| `TSPWAV` | per-wave TIE composition sets (incl. Darth ordering) | — (absent) |
| `TCHOP` + `A$CHPC` | choreography bytecode VM opcodes + per-alien PC | 2-state hand machine |
| `TTWRS`, `TGDPTR`, `GD.SEQ` | towers-to-clear; wave→maze pointers; traversal sequence | `surfaceMazes.ts` |
| `M$VX`/`M$TX` | per-frame velocity / position accumulator | scroll-speed constants |
| `.WP`/`.WL`/`.WGD`, `.S=`/`M.=` | vertex table / edge list / draw list; object scale / picture multiplier | `models.ts` |
| `WPN`/`WFF`/`WGA` | trench wall panel / wall force-field ("catwalk") / wall gun | trench models |
| `GNB0-3`/`GNT0-3` | fireball sparkle pictures | fireball sparkle (exact, M-008) |
| `VGC*` | AVG pen colors (VGCRED=4, VGCBLU=1, VGCWHT=7, VGCTRQ…) | render colors |
| `PM***` | tunes: PMTH5 main, PMBEN Ben's, PMRRP trench, PMDAR Vader, PMSF2/PMCNT/PMEND/PMDES | `tools/music-bake` |
| `SPK***`/`AUD***` | speech lines (23, SWVOC3) / POKEY SFX | `events.ts` cues |
| `VW8DIG` | "VIEW 8 DIGITS WITH COMMAS" score formatter | `formatScore` |

---

## Findings by subsystem (post-refutation)

Verdicts below incorporate the 21 refutation corrections. Full detail lives in
the findings JSON; ids cited throughout.

### Timing (pair-timing, T) — the spine
- **Confirmed:** phase ORDER matches (T-005).
- **Divergent:** `TICK_HZ=30` mis-converts every routed rate — should be
  20.508 (T-007); `trenchTimer` counts 60 Hz steps → 2.93× fast (T-008).
- **Structural (accepted):** 60 Hz fixed-step loop vs 20.508 Hz frames (T-001);
  opposite overload policy — cabinet slows, ours fast-forwards (T-003).

### TIE AI (pair-tie-ai, A)
- **Confirmed:** spawn depth/lateral tables, 3-TIE cap, one-hit kills, fire
  floor $800, per-wave fireball caps (A-001..A-008) — the numeric skeleton is
  faithful.
- **Divergent:** the ROM choreography is a genuine **per-fighter bytecode VM**
  (`JMP @A(U)` dispatch, per-alien PC, one-deep call stack, 16 scripts + 12
  split entries) vs our 2-state machine (A-009, size l). Fire decisions,
  difficulty index, per-axis thrust, spawn pairing, wave-end rule all follow
  from it (A-011..A-015, A-019 — accepted as symptoms of A-009, with refuter
  corrections; **warning:** A-015's original reasoning proposed gating ±2048
  corners to D-waves — that would move us *away* from the ROM; the corners
  appear in every wave).
- **Missing:** Darth Vader's TIE entirely (A-016, 4 lives, retreats — S-002's
  2,000 points sit unawarded); TSPWAV wave composition (A-017).
- **Reconciled:** our TIE-body cockpit damage is a *documented deliberate
  deviation* — the ROM has no TIE↔player collision (A-010 + G-010, both
  refuter-verified → **accept**, story 9-3 AC#3).

### Guns & fireballs (pair-guns, G)
- **Confirmed:** fireball homing ×7/8 per frame (G-001 — but wall-clock 1.46×
  fast until T-007 lands), 6-shell pool (G-002), fireball launches from its
  TIE (G-011).
- **Divergent:** fireball lifetime 2.13 s vs 3.12 s (G-003, same root as
  T-007); ROM laser is **hitscan** gun→site, no projectile (G-004 —
  wont_fix, our projectile is a deliberate, documented choice); fire is
  edge-triggered semi-auto with an 8-frame sweep vs our 0.25 s auto-repeat
  (G-012, accepted; port note above).
- The sw2-tuned `PROJECTILE_SPEED=5000` has **no ROM counterpart to check
  against** — the cabinet has no projectile speed at all (G-004).

### Scoring & shields (pair-score-shields, S)
- **Confirmed, all nine values:** TIE 1,000 · Darth 2,000 · fireball 33 ·
  tower top 200 · bunker 200 · turret 100 · wall panel 50 · exhaust port
  25,000 · all-towers 50,000 (S-001..S-009); 6 starting shields, 1 per hit
  (S-010/S-011).
- **Divergent:** Force bonus scales 5k/10k/25k/50k/100k by wave, ours flat 5k
  (S-012 — index by 0-based wave!); no per-shield wave bonus (S-013); no
  post-hit invulnerability window (S-016).
- **BOOK_WAS_WRONG:** our 400k/800k extra-shield thresholds have **no
  primary-source basis** (S-015; refuter did the exhaustive BCD-aware hunt).

### Death Star surface (pair-surface, D)
- **Confirmed:** all ten mazes byte-for-byte, TTWRS quota semantics, TGDPTR
  wave map — sw4-3's port is exemplary (D-001..D-012).
- **Divergent/missing — the surface is under-built as a hazard:** bunkers
  never fire (D-016; ROM: `.BYTE 3 ;SHORTY` → GDBNKGN); no ship↔object
  collision (D-020; ROM costs a shield + rolls the ship); ROM speed ramp
  5,250→21,000 u/s vs fixed 600 (D-022); ROM has **no wave-1 surface** at all
  (D-015; `;WAVE 1 HAS NO GROUND PHASE`); ROM never charges for low altitude
  (D-021) and ends only by traversal (D-019).

### Trench (pair-trench, B)
- **Confirmed:** cross-section, wall height, cull distance, rib spacing,
  **movable pilot** (±$1FF — the prior audit's "immovable cockpit" claim was
  stale), entry seat, port position, resolve window, two-stage torpedo
  (B-001..B-007, B-013..B-016).
- **Divergent:** scroll **31× too slow** (B-008); no wedge-chain trench length
  (B-009); wall content is a 4-slot×2-bit panel grid of 49 wedges/11 pies our
  8-entity list cannot express (B-010, the keystone); waves 0–10 are FIXED
  authored runs, ours randomizes (B-011); the "catwalk" is a wall-mounted
  force field, not a channel-spanning bar (B-012); wall guns fire back
  (B-017, missing); a missed port re-flies the whole trench (B-018, accepted).

### Explosions & finale (pair-explosions, X)
- **Confirmed:** 3-piece TIE split with lateral separation (X-001 — third
  piece is the **cabin/globe**, not a wing; false clause struck).
- **Divergent:** piece lifetimes wrong and not split wing/globe (X-002:
  24f/16f = 1.17s/0.78s vs flat 0.7s); missing age-keyed color ramp — and TIE
  pieces **never white-flash** (X-003, corrected); finale is a 4-phase
  red→blue→white ring animation ≈4.3 s, ours a single amber burst (X-006,
  X-008); no looming-station "prelim" (X-007); no tower/bunker debris
  explosions (X-005).

### Models & pictures (pair-models, M)
- **Confirmed:** TIE family, Darth TIE, fragments, tower, bunker, exhaust
  port geometry, fireball sparkles — and X/Y-Wing correctly absent (M-001..
  M-009).
- **Divergent:** DEATH_STAR is a procedural sphere but **authentic pictures
  exist** (BSHEM/BSCIR/BSTRN/BSDSH — our "no authentic data" comment is
  refuted; M-010); authentic wall-gun `.WP WGA` and force-field `.WP WFF`
  tables exist unported (M-011/M-012); TRENCH carries 4 fabricated rails
  (M-013); port tri-color pens (M-014, wont_fix).
- **Missing:** the entire WSSTAR starfield subsystem (M-015).

### Audio (pair-audio, U)
- **Confirmed:** sound-board timebase (8.192 ms — bake tools already correct),
  tune mapping for the four baked tracks, full 23-phrase speech catalogue,
  POKEY note table @1.512 MHz (U-001..U-004, U-024, U-025).
- **Divergent — the GM.WAV family:** Imperial March on {3,5,7,…} instead of
  {4,6,8,…} (U-005); "Great shot kid" on every port kill instead of that set
  (U-006); "Let go, Luke" missing from odd waves (U-007); even-wave cues
  **inverted** and 2.93× early (U-008 correction).
- **Missing:** five tunes unbaked (PMSF2/PMCNT/PMEND/PMBEN/PMDES,
  U-010..U-014); fly-by doppler + R2 sound sets (U-019/U-020); dedicated
  Death-Star-boom and fireball-hit SFX (U-021/U-022); several speech wirings
  (U-015..U-017).

### HUD & text (pair-hud, H)
- **Confirmed:** ten strings/behaviors incl. all banner texts, turquoise
  site, comma-grouped in-run score, 10-entry × 3-initial board (H-001,
  H-004..H-009, H-014, H-016, H-019).
- **Divergent (cheap, authentic-flavor):** "PULL TRIGGER TO START" (H-010),
  "PRINCESS LEIA'S REBEL FORCE" (H-011), "SHOOT YOUR INITIALS" (H-012),
  seeded OBI 1,285,353 … RLM 380,655 board (H-015, BCD-decoded), game-over/
  board comma grouping (H-020, two-line fix), shield-gauge 3-hue ramp
  (H-024 — palette now fully specified: green 5-9 / yellow 3-4 / red 1-2 +
  refuel flash).
- **Missing:** the rotating attract sequence — instructions page, scoring
  page (H-017), the receding intro crawl (H-018), in-flight coaching
  messages (H-022), the 50,000-towers reward banner (H-021).

---

## What the secondary sources got wrong

The primary source contradicted our own reference docs nine times. Trust
order: **Warp Speed MAC source > this audit > everything below.**

| Claim | Where it lived | Truth (finding) |
|---|---|---|
| "Cockpit is immovable [0,0,0]; catwalks unavoidable" | sw2-6 audit | Pilot moves ±$1FF laterally + vertical band (B-005/B-006) |
| Towers-to-clear "22–50 via byte_98CB" | sw2-6 audit | TTWRS per-maze counts (D-011/D-012; sw4-3 was right) |
| "No authentic Death Star vertex data exists" | `models.ts` comment | BSHEM/BSCIR/BSTRN/BSDSH pictures exist (M-010) |
| "No authentic turret/catwalk tables portable" | `models.ts` comments | `.WP WGA` / `.WP WFF` exist (M-011/M-012) |
| 400k/800k extra-shield thresholds | `gameRules.ts` (secondary-sourced) | No primary basis (S-015) |
| "Tick rate not pinned by disasm" | `state.ts` comment | 20.508 Hz, pinned three ways (T-007/G-003) |
| Font provenance "1981 ROM" | `font.ts` comment | VGAN-lineage face, 1983 WSVGAN (H-025) |
| "TIE worth 1,000 not 100" (as a *current* defect) | sw2-6 audit | Already fixed; S-001 confirms ours correct |
| "$E-row return fire" framing | sw2-6 audit | Real thing is BSGUN/DOBASE wall guns (B-017) |

## Limitations (recorded, not audited)

- **SNDPBX sound-priority arbitration** — assigned, never audited; mostly
  N/A under WebAudio polyphony. Recorded here per coverage review.
- **SWMP Math Box microcode ↔ `@arcade/shared/math3d`** — belongs to an
  arcade-shared audit; only star-wars usage sites checked here.
- **AVGROM / beam engine** — hardware out of scope.
- **Operator option switches** — defaults assumed (6 shields etc.).
- **Coin/EAROM/self-test** (WSCOIN, TCEROM, TCTEST, WSCKSM) — no cabinet.
- **D-013 note:** surface constants are confirmed *within* the 1/30
  ground-render convention (a shell choice, not a ROM constant).

---

## RULING SHEET — clusters for human decision

53 raw fix-recommendations ≈ 197 raw points collapse into **10 clusters,
~82 merged points**. Order matters: **R1 lands first** — every later numeric
fix re-bakes on the corrected timebase. Recommendations are mine; rulings are
yours.

| # | Cluster | Subsumes | Size | Depends on | What the player gets | Recommendation |
|---|---|---|---|---|---|---|
| **R1** | **Timebase reconcile** — kill `TICK_HZ=30`, convert at 20.508; make `trenchTimer` frame-true | T-007, T-008, G-003, G-001 corr. | **3** | — | fireballs/homing/trench cues at cabinet speed | **FIX FIRST** |
| **R2** | **Wave-parity family** — 0-based `GM.WAV` accessor; rewire music/speech gates | U-005, U-006, U-007, U-008 corr. | **2** | — | Imperial March, "Great shot kid", trench voices on the RIGHT waves | **FIX** (cheapest big win) |
| **R3** | **Text & board authenticity pass** — 5 strings + seeded board + comma grouping (+optional H-024 gauge ramp, spec in hand) | H-010, H-011, H-012, H-015, H-020, (H-024) | **3** | — | the cabinet's voice: PRINCESS LEIA'S REBEL FORCE, SHOOT YOUR INITIALS, OBI/WAN/HAN board | **FIX** |
| **R4** | **Score/shield rules** — wave-scaled Force bonus, per-shield wave bonus + banner, drop non-ROM 400k/800k, post-hit window | S-012, S-013, S-015, S-016, H-021 | **4** | R2 (0-based indexing) | authentic bonus economy | **FIX** |
| **R5** | **Surface hazard** — bunkers fire, ship↔object collision (+accepted-divergence notes D-015/17/19/21/22 recorded as deviations) | D-016, D-020 | **5** | R1 | the maze fights back | **FIX** |
| **R6** | **Trench rebuild** — panel-grid wall model (keystone B-010), wedge-chain length, fixed authored waves 0–10, WFF force-field catwalk + WGA/WPN model ports, scroll speed, wall guns | B-008, B-009, B-010, B-011, B-012, B-017, M-011, M-012, M-013 | **14** (l+l, rest data/m) | R1 | the trench run as designed: fast, authored, dangerous | **FIX** (the flagship) |
| **R7** | **Explosions & finale** — piece lifetimes/color ramp (no white-flash!), 4-phase ring finale + looming prelim, Death Star picture port, tower/bunker debris | X-002, X-003, X-006, X-007, X-005, M-010 | **12** | R1; M-010 before X-007 | the payoff moment | **FIX** (trim X-005 if needed) |
| **R8** | **Audio content** — bake 5 tunes, wire 3 speech gaps, dedicated AUDDF/AUDSS, fly-by + R2 SFX sets | U-010..U-017, U-021, U-022, U-019, U-020 | **13** | R2 first; enables A-019 later | Ben's theme, cantina, finale music, R2 | **FIX core (tunes+speech, ~8); defer U-019/U-020 (l each)** |
| **R9** | **TIE choreography VM** — port the bytecode VM + TSPWAV + Darth (subsumes 6 accepted symptom-divergences; A-019 music-timed descent needs R8) | A-009, A-016, A-017 (+A-011..A-015, A-019 recorded) | **18** | R1, ideally R8 | authentic dogfights + Vader | **FIX LATER** (biggest rock; stage as own epic) |
| **R10** | **Attract mode & starfield** — rotating INS/SCR pages, intro crawl, coaching messages, WSSTAR starfield | H-017, H-018, H-022, M-015 | **10** | R3 | the 1983 cabinet at rest | **DEFER** (front-of-house, not gameplay) |

**Recorded, no work:** 14 STRUCTURAL accepts (60 Hz loop, hitscan-vs-projectile
G-004, keyboard initials H-013, WebAudio one-shots U-023, ±$200 arming box
G-005/B-015…), the A-010/G-010 deliberate deviation (story 9-3), D-015/D-021
(our wave-1 surface + terrain penalty are documented house rules — rule
explicitly if you want them kept), 8 wont_fix.

**Suggested first tranche (quick wins, ~12 pts):** R1 + R2 + R3 + R4 — four
small clusters that move the game most audibly toward the cabinet: right
speed, right waves, right words, right economy.

---

*Audit rig: `tools/audit/check-citations.mjs` + `tests/audit/citations.test.ts`
(gate), `tools/audit/reanchor-citations.mjs` (line-drift repair),
`tools/audit/linked-modules.mjs` (shipped-module allowlist). Fixing a finding?
Mark it `"remediated_by": "<story-id>"` and re-run the gate — same contract as
tempest.*
