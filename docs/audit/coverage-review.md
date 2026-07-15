# Coverage review — Star Wars ROM-fidelity audit (Phase 3)

Reviewer scope: the things neither the citation checker nor the per-claim refuters
can see — false `CONFIRMED`s, cross-pair contradictions, scope gaps, filing
honesty, and sizing/fragmentation. I did **not** re-verify citations and did **not**
re-judge individual divergence claims. Ground truth (game frame 20.508 Hz, radix
traps, world metric) taken from `preflight.md` as given.

Corpus: 173 findings across 10 pairs. Class totals (verified by tabulation):
**CONFIRMED 73**, DIVERGENCE 48, NO_COUNTERPART 37, STRUCTURAL 14, BOOK_WAS_WRONG 1.
Recommendations: fix 53 (s 16 / m 23 / l 14), accept 39, wont_fix 8, none 73.

**Headline:** coverage is genuinely good and the timebase was applied *consistently*
(every rate finding used ×20.508, none used ×60 — the manufactured-agreement trap
was avoided). But there is **1 CONFIRMED carrying an outright false sub-claim**
(X-001), **2 more CONFIRMEDs that read "faithful" while a sibling DIVERGENCE proves
the behaviour is not** (U-008, G-001), **1 factual cross-pair contradiction**
(X-001 ↔ M-002), **1 same-behaviour/opposite-ruling collision** (A-010 ↔ G-010),
and **one assigned scope item never audited** (pair-audio "sound priorities").

---

## 1. False / misleading CONFIRMEDs

There are **no ×60 manufactured-agreement CONFIRMEDs.** I checked every one of the
73. The rate-bearing confirms (G-001, U-001, U-002, U-008) all used the 20.508 Hz
game frame or the separately-derived 8.192 ms sound tick — never a 60 Hz base. The
radix-sensitive confirms (M-004, M-007, M-008) explicitly decode the correct
region/suffix. No CONFIRMED cites a denylist module (U-024 uses SWVOC3 not SWVOC2;
H-025 uses WSVGAN not VGAN; M-009 correctly treats X/Y-Wing as never-assembled).
That is the good news, and it is real.

The problems are narrower but they will be **printed as proof-of-fidelity and never
attacked**, so they matter:

### 1a. X-001 contains a false statement of fact — flag for refutation/relabel
`pair-explosions.json` X-001 (CONFIRMED, "TIE death breaks into three pieces with a
left/right lateral split"). The headline (3 pieces, lateral split) is TRUE. But its
parenthetical is FALSE:

> "The third piece differs in identity (ROM: center globe/cockpit ball; ours: a third
> wing fragment on +z)"

Ours is **not** a wing fragment. `src/core/models.ts:237` defines
`TIE_WING_FRAG_3` as `name: 'TIE Fragment Cabin'`, vertices
`TIE_FIGHTER.vertices.slice(-28)` (the aft cabin/globe) — i.e. the ROM's TI3 centre
globe. The variable name "WING_FRAG_3" is a misnomer; the *geometry* is the globe.
`render.ts:396` draws it at `(0,0,s)`. So the third piece **does** match the ROM in
identity. X-001's auditor was misled by the symbol name. This directly contradicts
M-002 (below), which verified the geometry against `WSOBJ.MAC:1389-1422` with green
tests. **M-002 is right; X-001's identity claim is wrong.** The CONFIRMED headline
survives, but the false clause should be struck before it ships.

### 1b. U-008 is technically true but paints "faithful" over a proven divergence
`pair-audio.json` U-008 (CONFIRMED, "Even-wave trench voice cues match: @16 and @24")
confirms the *threshold values* (16, 24) and *line assignments* match the ROM. That
is true as a value mapping. But the mechanism those thresholds ride is **T-008
(DIVERGENCE)**: `sim.ts:609` `const trenchTimer = state.trenchTimer + 1` advances
once per 60 Hz step, not per 20.508 Hz game frame (I verified this against the code).
So the cues actually fire at 16/60 = 0.27 s … 24/60 = 0.40 s instead of the ROM's
16/20.508 = 0.78 s … 24/20.508 = 1.17 s — **2.93× early, bunched into the first ~0.4 s.**
U-008's green check reads as "trench speech is faithful"; it is not. Recommend the
synthesis annotate U-008 as "values correct, wall-clock timing blocked on T-008,"
not a clean CONFIRMED. Same caveat applies to U-007 (the missing `letGoLuke@16` cue)
— adding it is correct, but it will also fire 2.93× early until T-008 is fixed.

### 1c. G-001 confirms the ratio, not the rate — honestly cross-referenced, still soft
`pair-guns.json` G-001 (CONFIRMED, fireball 7/8 decay). The 7/8 ratio matches, but
the code applies it `Math.pow(7/8, dt*TICK_HZ)` with `TICK_HZ = 30` (`state.ts:220`),
which G-003/T-007 prove is 1.46× too fast (should be 20.508). G-001 explicitly defers
the cadence to G-003, so this is honestly partitioned — less dangerous than U-008 —
but a reader skimming CONFIRMEDs still sees "homing matches." Keep the cross-reference
visible.

### 1d. D-013 is scale-dependent, the softest CONFIRMED in pair-surface
`pair-surface.json` D-013 (CONFIRMED, `SKIM_ALTITUDE 128 = GD$MDT 3840 / 30`). The
arithmetic is sound (`0x1C00-0x200/2+0x200 = 0xF00 = 3840`, left-to-right MACRO-11;
3840/30 = 128). But the /30 is `GROUND_MODEL_SCALE` (`render.ts:157`), a **render
choice, not a ROM-derived factor.** It also reveals the surface is **anisotropically
scaled**: maze X/Y/depth are raw ROM units 1:1 (D-001…D-012, D-022), but the vertical
band is 1/30. That is internally consistent with D-022 (different axis) and not
false, but D-013 is the one surface CONFIRMED that would collapse if the 1/30 choice
were ever revisited — unlike the byte-exact maze confirms, which are scale-free.
Record it as "confirmed within the 1/30 ground-render convention."

### 1e. U-001/U-002 rest on an assumed clock (auditor already flagged)
The 4.096 ms IRQ / 8.192 ms voice tick derive `6144 cycles ÷ 1.5 MHz`. The exact
6532 master clock is a MAME/hardware fact, not in the `.MAC` files; the auditor says
so plainly. Not false (the author labels it "4 MS" three times), but it is the one
sound CONFIRMED that is not purely primary-source. Leave as-is with the caveat intact.

**Net: 1 CONFIRMED with a false clause (X-001) + 2 misleading-as-"faithful" (U-008,
G-001) + 2 soft-but-honest (D-013, U-001/002).** Only X-001 and U-008 need action.

---

## 2. Cross-pair contradictions

### 2a. FACTUAL — X-001 (explosions) ↔ M-002 (models): the third TIE fragment
Covered in §1a. X-001 says our third death fragment is "a third wing fragment";
M-002 says `TIE_WING_FRAG_3` is the TI3 cabin/globe, byte-verified against
`WSOBJ.MAC`. The code (`models.ts:237`, `render.ts:396`) proves **M-002 correct.**
One of the pair is wrong on fact; it is X-001. This is the single clearest
contradiction in the corpus and neither the refuters (X-001 is CONFIRMED, never
attacked) nor the citation checker would surface it.

### 2b. DISPOSITION — A-010 (tie-ai) ↔ G-010 (guns): TIE-body-vs-cockpit damage
**Same behaviour, same cited code (`sim.ts:308-315`), same class (DIVERGENCE),
opposite recommendation.**
- A-010: *"We damage the player on TIE-body cockpit contact; the ROM has no TIE↔player
  body collision."* → **recommendation `fix`, size m** (remove it).
- G-010: *"a TIE body ramming the cockpit … ours costs a shield."* → **recommendation
  `accept`** (intentional, low-impact).

They agree on every fact (ROM has no body-collision; ours adds one) but rule opposite.
G-010 is the better-reasoned of the two: it invokes A-011 (TIEs peel at
`TIE_NEAR_BOUND` before reaching the cockpit, so it "rarely triggers"), which A-010
does not weigh. The synthesis **must pick one ruling** — refuters attacking each in
isolation will not reconcile them, and could hand back a "refuted" A-010 next to a
"stands" G-010 on the identical behaviour. Recommend adopting G-010's `accept`
(documented deliberate deviation, story 9-3) and demoting A-010 to a cross-reference.

### 2c. STRUCTURAL MASKING — U-008 (CONFIRMED) ↔ T-008 (DIVERGENCE): trenchTimer
Not a factual contradiction (they describe different aspects) but the CONFIRMED masks
the DIVERGENCE on the *same mechanism* — see §1b. Worth a one-line link in synthesis.

### 2d. DISPOSITION (minor) — M-016 (models, wont_fix) ↔ X-005 (explosions, fix)
Both agree the ground-object debris shards (TW1-3/BK1-3/WG1-3 + GNX0-3) are unported.
M-016 says `wont_fix` but explicitly defers ("belongs to the WSXPLD auditor"); X-005
says `fix` size l. M-016's deference resolves it in X-005's favour — record as one
item (add a dying-ground-object entity + shard models), not two.

### 2e. The speed/timebase triangle the brief flagged — CONSISTENT, no contradiction
The brief asked whether **B-008 (trench 31× too slow)**, **D-022 (surface ~9–35× too
slow)**, and the **pair-timing 60 Hz STRUCTURAL model** collide. They do **not**:
- T-001 says continuous `pos += vel*dt` motion is faithful at any tick rate *because
  speeds are units/second*; wrong-constant cases are carved out to T-007/T-008.
- B-008: ROM $300/frame × 20.508 = 15,750 u/s vs our `TRENCH_SCROLL_SPEED = 500` →
  31.5×. Arithmetic correct, uses ×20.508.
- D-022: ROM $100→$400/frame × 20.508 = 5,250→21,000 u/s vs our
  `TURRET_SCROLL_SPEED = 600` → 8.75×…35×. Arithmetic correct, uses ×20.508.

Both are "our chosen units/second constant ≠ ROM's units/second speed" — exactly the
wrong-constant category T-001 defers. They are mutually consistent and consistent with
the timing model. (Aside worth noting: in the ROM the trench, 15,750 u/s, is *faster*
than the slow surface, 5,250 u/s; in ours the trench, 500, is *slower* than the
surface, 600 — our relative pacing is inverted, but that is a compounding of two
independent wrong constants, not a contradiction between the findings.) **No re-run
needed here; the auditors got the timebase right.** Likewise the TICK_HZ chain
(T-007 = G-003, and X-002) all agree on 20.508.

---

## 3. Scope gaps

Coverage against `plan.md` is strong. The brief's hypothesised gaps are **not** gaps:
- pair-timing DID audit TPHASE order (T-005), transition/start/death phases (T-006),
  and PH.TIM attract timing (T-009) — not only the frame rate.
- pair-guns DID cover convergence and 4-gun cycling (G-007: LZ.ALT, "all four beams
  converge on the same site").
- pair-models DID cover the WSSTAR starfield (M-015) and colour assignments
  (M-005 white cap, M-006 red bunker, M-008 red fireball, M-014 port pens).

One real gap and one thin spot:

### 3a. GAP — pair-audio "sound priorities" assigned but never audited
`plan.md` gives pair-audio scope "event→sound-code mapping (XMT), **sound priorities**,
tune→moment mapping, speech-line wiring, SFX envelopes." Nothing in U-001…U-025
addresses the **SNDPBX mailbox priority / voice-arbitration scheme** — which transmit
code preempts which when several fire at once. U-023 touches sustained-vs-one-shot
(stop codes) but not priority ordering. **Verdict: record as a limitation, do not
re-run.** A browser engine with polyphonic WebAudio channels (`audio.ts` CHANNELS,
per-effect voice-stealing) has no POKEY single-voice contention to arbitrate, so ROM
priority bytes are largely N/A — but that reasoning must be *written down* explicitly,
not left as a silently-skipped scope line. (Secondary thin spot: "SFX envelopes" is
only lightly touched via U-025's FETAB/AMPTAB parsing; no dedicated envelope-fidelity
finding. Acceptable as a limitation.)

### 3b. Otherwise complete
Every other pair's findings cover their assigned surface. pair-surface (mazes),
pair-models (vertex/edge tables), pair-score-shields (BCD scores), and pair-hud
(message text) are exhaustive to the point of being the corpus's backbone.

---

## 4. Filing honesty (class distribution)

**pair-timing (1 CONFIRMED / 10) — HONEST, not hunting.** The subsystem *is* a
wholesale timebase mismatch (integer IRQ vs float dt). Of 10: 3 STRUCTURAL
equivalences, 4 NO_COUNTERPART (IRQ cadences, watchdog, transition phases, attract
timers — genuinely absent in a browser clone), 2 real DIVERGENCEs (TICK_HZ,
trenchTimer), and the *one* thing that genuinely matches — phase order — is the
1 CONFIRMED (T-005). There is little to confirm because little is structurally the
same; that is the subsystem, not a hunting pattern.

**pair-explosions (1 CONFIRMED / 9) — HONEST, but its lone CONFIRMED is tainted.**
Explosions is a real under-build (faked render motion X-004, no ground debris X-005,
stylised finale X-006/X-007). One structural match (3-piece split) earns the CONFIRMED
— but that CONFIRMED (X-001) is the one carrying the false sub-claim (§1a). So even the
single green here needs a fix.

**No auditor's filing is untrustworthy.** The most rigorous is **pair-models** (radix
traps decoded per-region, tests cited green, never-assembled objects correctly
excluded). The one filing pattern to watch is **pair-audio's inflation**: 13
NO_COUNTERPART of 25, several of which are one change filed many times (see §5). Not
dishonest — the absences are real — but the *count* overstates the distinct work.

---

## 5. Sizing & fragmentation

### 5a. Duplicate one-line fix filed twice: T-007 = G-003
Both are "TICK_HZ = 30 should be 20.508" (`state.ts:220`). Fixing T-007 auto-fixes
G-003 (fireball TTL) and the G-001 homing cadence — it is **one edit**, legitimately
surfaced in two scopes but a single unit of work. Size s is correct; the point-count
should not double it.

### 5b. The trench cluster is ~1–2 rewrites, not 5 independent fixes
B-008 (speed m), B-009 (length m), B-010 (panel grid l), B-011 (fixed-vs-random m),
B-012 (catwalk l) are heavily entangled — the findings themselves say so ("the fix is
speed + length together"; "reconciling requires porting the wall-slot panel grid
B-010"). **B-010 (the 2-bit panel/pie/wedge grid) is the keystone**; B-008/B-009/B-011
ride the real length+chain, and B-012 rides the panel grid. Filing 5 is fine for
tracking but they are not independently schedulable — call it two coordinated efforts
(trench length+speed+chain; panel/catwalk model), plus B-017 (trench guns) which needs
the panel grid to know which slots are guns.

### 5c. The audio "unbaked tunes" cluster is one pipeline task
U-010/011/012/013/014 (PMSF2 / PMCNT / PMEND / PMBEN / PMDES, all m) are the *same*
change: extract the tune via TUNTAB indices → bake → add a MusicTrack + emission. The
bake pipeline already exists (U-025). Five m-findings ≈ one m/l task. Similarly
U-015/016 (speech wiring, samples already baked) and U-021/022 (SFX-swap, one FX
record each) are wiring clusters. This is the source of pair-audio's inflated count.

### 5d. No `s` finding is a hidden rewrite; `l` sizes are appropriate
I checked every `s`: all are genuine one-liners (text swaps H-010/011/012/020, seed
table H-015, drop 4 rails M-013, wave predicate U-005/006, add cue U-007, TICK_HZ
T-007/G-003). The `l`s are all genuine subsystems (choreography VM A-009, Darth A-016,
composition table A-017, panel grid B-010, catwalk B-012, trench guns B-017, ground
debris X-005, finale rings X-006, DX prelim X-007, death-star picture M-010, starfield
M-015, attract pages H-017, passby/R2 FX U-019/020). Sizing discipline is good.

### 5e. Total fix backlog: ~197 points — unschedulable as one epic, and that is expected
53 fix recommendations: 16 s + 23 m + 14 l ≈ 197 points (at s=1/m=3/l=8; ~132 even at
s=1/m=2/l=5). That is not a bug backlog — it is **the game's entire remaining
roadmap.** Per the repo's own status, Star Wars is a "Wave 0 skeleton"; the majority of
these "fixes" are **features never built** (Darth enemy, choreography VM, wave
composition, starfield, attract pages + story crawl, ~13 audio cues, trench guns,
ground debris, real trench length), not regressions in shipped code. Separating the
two:

- **Schedulable near-term fidelity BUGS in already-shipped code (~18 findings, mostly
  s/m):** T-007/G-003 (TICK_HZ), T-008 (trenchTimer rate), U-005 (Imperial March
  parity), U-006 (great-shot-kid gate), U-007 (missing cue), S-012 (force bonus flat),
  S-015 (invented extra-life, BOOK_WAS_WRONG), S-016 (no i-frame window), X-002/X-003
  (explosion life/colour), D-016 (bunkers silent), B-008 (trench speed), M-013 (drop
  fabricated rails), H-010/011/012/015/020 (text/format). This set is a schedulable
  sprint or two.
- **Feature backlog (~35 findings):** everything `l` plus the audio NO_COUNTERPART
  cluster. Belongs on the Wave 1–5 roadmap, not a fidelity-fix epic.

Recommend the synthesis present these as **two separate ledgers** so the "197-point
epic" is not read as 197 points of *broken* code.

---

## 6. Bottom line for the synthesis

1. Strike the false clause in **X-001** (third fragment is the cabin/globe, not a wing;
   M-002 is authoritative) and relabel **U-008** as "values correct, timing blocked on
   T-008." These are the two CONFIRMEDs that would otherwise ship as false proof.
2. Resolve **A-010 ↔ G-010** to a single ruling (recommend G-010's `accept`).
3. Fold **M-016 → X-005**, **T-007 = G-003**, the **B-008/09/10/11/12(/17) trench
   cluster**, and the **U-010–014 tune cluster** into single work-items before costing.
4. Record **pair-audio "sound priorities"** as an explicit limitation (WebAudio
   polyphony ⇒ ROM priority arbitration largely N/A) rather than a silent skip.
5. Split the fix ledger into "shipped-code bugs (~18, schedulable)" vs "unbuilt
   features (~35, roadmap)."

No auditor re-run is required. One scope line (audio priorities) needs a written
limitation; everything else is a synthesis-time reconciliation, not new auditing.
