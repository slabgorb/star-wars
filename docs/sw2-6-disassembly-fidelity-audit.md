# Star Wars (1983) — disassembly fidelity audit (story sw2-6)

**Spike deliverable.** This is the companion to
[`star-wars-1983-source-findings.md`](./star-wars-1983-source-findings.md). That
doc is a *ROM extraction* — what the 1983 cabinet does. **This** doc is a
*fidelity audit* — where the current TypeScript sim (`src/core/*`, post epics
8/9/11/14 and playtest-fix epic sw2) **diverges** from that ROM truth — scored,
classified, and turned into a concrete follow-on backlog (epic **sw3**).

- **No behavior change.** This story wrote documentation + backlog stories only.
  No `src/core` / `src/shell` sim behavior was touched; the test suite is
  unchanged and green before and after.
- **Audience:** whoever picks up epic sw3, and the sw2-7 live-playtest pass
  (this audit predicts what a playtester will notice).

---

## Method & sources

The audit cross-referenced every current core sim file against the ROM findings
doc, and spot-verified the highest-value claims against the raw disassembly
(vertex tables, score tables, the `byte_98CB` towers table, the `sub_703B`
viewpoint clamps). It was produced by parallel per-subsystem read passes
(models, surface, trench, audio/HUD) plus a direct read of the combat/scoring
core.

> **⚠︎ Reference material is gitignored and ABSENT from some checkouts.**
> `star-wars/reference/` (the disassembly + `Object_3D_Data.asm`) is gitignored
> per `reference/README.md` and **was not present in the checkout this audit ran
> in** (`a-2`). It exists in sibling checkouts (`a-1`, `a-3`) and in
> `~/Downloads/SW/`. Anyone picking up an sw3 story that needs ROM numbers must
> read the disassembly from a checkout that has it — do not assume `reference/`
> is populated locally. *(Recorded as a Delivery Finding on the sw2-6 session.)*

**Classification legend**

| Verdict | Meaning |
|---|---|
| **Faithful** | Matches the ROM (value or behavior). Do not re-open. |
| **Approximated** | A deliberate, usually-documented simplification of a real ROM behavior. |
| **Missing** | A real ROM behavior with no counterpart in the clone. |
| **Wrong** | Present but diverges materially (wrong value, wrong role, or a defect). |

**Severity** weighs player-visibility × tractability × how far off it is.
`high` = a playtester will notice and it's worth fixing; `low` = cosmetic or
blocked on unrecoverable data.

---

## Fidelity scorecard

| Subsystem | Verdict | Headline gap |
|---|---|---|
| **Scoring values** | ⚠︎ Wrong | TIE worth 100 not **1,000**; exhaust port 1,000 not **25,000**; no Darth/bonus/extra-life values |
| Space combat / TIE AI | ◑ Approximated | Kinematic swoop ported (9-2..9-5); spawn model, script-VM, "only fireballs damage" simplified |
| **Death Star surface** | ⚠︎ Wrong | Flat 4-kill quota vs **22–50** towers/wave; **50,000** all-towers bonus missing |
| **Trench — viewpoint** | ⚠︎ Missing | Cockpit is immovable `[0,0,0]`; catwalks are an **unavoidable** shield loss every run |
| Trench — variation | ◑ Missing | Byte-identical every run (no PRNG); ROM builds a fixed-head + picked-tail chain |
| Trench — threat | ◑ Missing | Turrets never fire back (`sub_B3E9` `$E`-row return-fire absent) |
| **Audio / music** | ⚠︎ Missing | **No music at all**; only 4 of 23 speech lines cued; no trench voice timer |
| HUD scoring | ◑ Missing | No extra lives (400k/800k); no flashing bonus row (`byte_4B2C`) |
| Vector models (verts) | ✓ Faithful | TIE (52), Darth (56), trench squares (8) byte-exact |
| Vector models (edges) | ◑ Approximated | All connectivity hand-authored — the real edge ROM (`136021.105`) isn't in the dump |

---

## Findings by subsystem

### 1. Scoring values — the biggest player-visible gap  ⚠︎ **[→ sw3-1]**

The findings doc **resolved** the authentic point values (## Scoring tables,
including the load-bearing ⚠︎ cross-note that settles TIE = 1,000 / exhaust =
25,000, "do **not** ×10"). The clone's constants predate that resolution and are
mostly an order of magnitude low:

| Thing | ROM (resolved) | Current TS | Verdict |
|---|---|---|---|
| TIE fighter | **1,000** (`byte_984A`) | `TIE_SCORE = 100` (`state.ts:105`) | **Wrong — 10× low** |
| Darth Vader's ship | **2,000** (`byte_984D`) | none (all TIEs = 100) | **Missing** |
| Exhaust port hit | **25,000** (`byte_985F`) | `TRENCH_BONUS = 1000` (`state.ts:283`) | **Wrong — 25× low** |
| Fireball | **33** (`byte_985C`) | `FIREBALL_SCORE = 50` (`state.ts:110`) | Wrong (minor) |
| Cleared all towers | **50,000** (`byte_9862`) | none | **Missing** *(→ sw3-3)* |
| Shield bonus | **5,000 × shields** (`sub_9775`) | none | Missing |
| Laser tower / bunker | 200 (`byte_9859`) | `TURRET_SCORE = 200` | ✓ Faithful |
| Trench turret | 100 (`byte_9853`) | `TRENCH_TURRET_SCORE = 100` | ✓ Faithful |
| Trench green square | 50 (`byte_9850`) | `TRENCH_SQUARE_SCORE = 50` | ✓ Faithful |
| Use-the-Force (wave 1) | 5,000 (`byte_983B[0]`) | `FORCE_BONUS = 5000` | ✓ Faithful (not wave-scaled) |

This is the single highest-value, lowest-effort fidelity fix: the values are
**already resolved** in the findings doc, they're directly on the score readout,
and they're plain constants. Filed as **sw3-1** (the missing 50k all-towers
bonus rides with the surface work in **sw3-3**; extra-life values in **sw3-6**).

### 2. Space combat & TIE AI — the RE'd kinematics landed; the deep model is simplified  ◑

Epics 9-2..9-5 closed the gaps [`tie-flight-ai-model.md`](./tie-flight-ai-model.md)
§0 flagged: TIEs now bank/swoop toward the cockpit (`moveEnemy`, `sim.ts:722`),
fire on their own per-fighter clock (`sim.ts:172`), and the per-wave
simultaneous-fireball cap is ported 1:1 from the `byte_8D71` table
(`FIRE_CONCURRENCY`, `gameRules.ts:168`). Remaining, **deliberate** divergences
(each documented in code/model, none currently filed — acceptable for the
game's feel):

- **Spawn model** — clone spawns random `±350` lateral at `z=−8000` and full
  speed (`spawnTie`, `sim.ts:766`); ROM spawns from fixed centerline tables at
  max depth with **zero** initial velocity, accelerating along its facing
  (model §4). *Approximated.*
- **Behavior-script VM** — ROM choreographs each TIE with a bytecode program
  (model §5.1); clone uses fixed swoop kinematics. *Approximated.*
- **"Only fireballs damage the player"** — ROM has **no** TIE-body↔ship collider
  (model §7); the clone deliberately keeps a cockpit-contact kill for a
  near-center TIE (documented deviation in 9-3). *Wrong, but intentional.*
- **Fire cadence** — scalar `enemyFireInterval` vs ROM frame-mask + PRNG
  threshold (model §6/§8). *Approximated.*

Verdict: **acceptable.** These are honest, documented simplifications of a fully
RE'd model; they do not read as defects in play. Not filed. (If a future epic
wants deeper AI fidelity, `tie-flight-ai-model.md` is the ready-made spec.)

### 3. Death Star surface / towers — a whole phase compressed to 4 kills  ⚠︎ **[→ sw3-3]**

- **Tower count** — ROM destroys **22 → 22 → 32 …up to ~50** towers per wave
  from the `byte_98CB` table (with a `≥$13` PRNG re-roll, `$32` clamp); clone
  has a flat on-screen cap `MAX_TURRETS = 4` and clears the whole phase after
  `SURFACE_WAVE_QUOTA = 4` kills, **no wave scaling** (`state.ts:250,316`).
  **Wrong — 5–12× short, and never escalates.**
- **50,000 "cleared all towers" bonus** (`byte_9862`) — **Missing** entirely
  (no `50000` / `bunker` / `allTowers` anywhere in `src/`).
- **Wave-end condition** — ROM ends on a rotation/time window (`DPbyte_A7 ≥ 5`),
  not a kill quota. *Approximated.*
- **Placement** — random spawn vs the ROM's 32-record `off_A182` layout tables.
  *Approximated (low severity).*
- **Surface floor** — ROM is a flat **50 green-dot** field (`sub_620F`); clone
  renders a steel wireframe grid (`surface-grid.ts`, ADR-0002 choice). *Missing
  the dot field; med.*
- `TURRET_SCORE = 200` — ✓ Faithful.

Filed the two high-value items (wave-scaled count + 50k bonus) as **sw3-3**. The
green-dot field and the authentic tower models (§8 below) are documented, not
filed.

### 4. Trench run — no pilotable viewpoint → unavoidable catwalk damage  ⚠︎ **[→ sw3-2]**

The trench cockpit is the immovable constant `COCKPIT = [0,0,0]` (`sim.ts:81`);
`aimX/aimY` only steer the firing ray (`gameRules.ts:36`), never the ship. So:

- **No `sub_703B` viewpoint band.** ROM flies the ship within a **±511 lateral /
  −257…−3583 vertical** clamp; the clone has *no* lateral/vertical motion at all.
  **Missing** (this is the epic-14-task-2 leftover that Open follow-up #2 still
  calls out).
- **Catwalks are undodgeable.** The single catwalk hangs at `y=200`
  (`trench-obstacles.ts:65`); `CATWALK_HIT_RADIUS = 240 > 200`, so the crash test
  (`sim.ts:461`) is **true on every pass** and the ship can't climb to avoid it.
  Result: **every trench run silently costs exactly one shield with zero
  counterplay.** *Wrong — a genuine defect a playtester will feel.*

Fixing the viewpoint (sw3-2) fixes both — the catwalk *cost* model itself is
correct (Faithful, epic-14 task 3), only its avoidability is broken. High
priority; filed **sw3-2**.

### 5. Trench run — identical every run, and turrets are harmless  ◑

- **No per-run variation** — ROM builds a fixed-head + **PRNG-picked-tail**
  section chain (`sub_83A4`, "every trench run differs"), primed 8 segments
  ahead; the clone returns a fixed copy of `TRENCH_OBSTACLE_STATIONS` with **zero
  PRNG** (`trench-obstacles.ts:73`, `enterPhase` touches no rng). Second and
  later runs are pixel-identical. *Missing → **sw3-7**.*
- **Turrets never fire back** — ROM's `sub_B3E9` `$E`-row runs a firing-cone
  hit-box that costs a shield; clone turrets are passive score piñatas
  (`stepTrench` emits no enemy fire). *Missing — the trench carries no incoming
  threat. Documented; not filed (design call — adds difficulty; strong sw3
  candidate).*
- **Exhaust port as flying octagon vs latched approach plane** — clone scrolls a
  physical target the bolt overlaps (`PORT_HIT_RADIUS=120`); ROM latches a type-3
  segment plane resolved at an `$800` window against a pre-set lock flag. Plays
  correctly; *Approximated, acceptable.*
- **Obstacle layout** — 8 hand-authored stations vs the `off_7Bxx` shape-script
  blobs; honestly self-documented PROVISIONAL, blocked on a ROM↔world-unit
  conversion. *Approximated.*
- `byte_49C1` wall-recede cosmetic — Missing, low. Not filed.

### 6. Audio / speech / music — no music, and the trench is nearly silent  ⚠︎ **[→ sw3-4, sw3-5]**

- **No music, anywhere.** `audio.ts` plays 7 one-shot SFX; the entire phase→music
  system (space `Sound_24/25`, towers `Sound_20/21`, trench `Sound_22`, Imperial
  March `Sound_1D`, Death-Star cues) is unimplemented — no looping channel, no
  phase-edge hook. *Missing — the most player-noticeable audio gap. → **sw3-5**
  (flag: needs music assets sourced).*
- **Trench voice-line timer missing.** The iconic "Luke trust me" (`Sound_18`@16),
  "Yahoo you're all clear kid" (`Sound_1A`@24), "the Force is strong in this one"
  (`Sound_16`@22) have no timer to fire them. **Correction to the sw2-5 memo:**
  these are **reachable in the existing trench run** — they need only a
  progress timer + wave parity, *not* the R2-damage/Vader-tail/wingman mechanics
  that memo cited as blockers. *Missing → **sw3-4**.*
- **Only 4 of 23 baked speech lines cued.** `audio.ts` bakes all 23; the
  `SpeechLine` union exposes 4 (`events.ts:124`). The event→`speak()` pump is
  generic and extensible — the shortfall is core cue coverage, not wiring.
  *Approximated.*
- **5 destruct/bonus events reuse SFX** (Death-Star boom sounds like a TIE pop;
  Force fanfare = generic wave-clear). *Approximated, low. Not filed.*

### 7. HUD / framing — faithful readout, missing the bonus economy  ◑ **[→ sw3-6]**

- **Faithful:** comma-grouped score (`hud.ts:23`), the two-colour SCORE(red)/
  digits(green) panel (correctly split core-formatter vs shell-colour), and the
  four trench outcome banners (EXHAUST PORT AHEAD/MISSED, DEATH STAR DESTROYED,
  USE THE FORCE). Do not re-open.
- **Missing — no extra lives.** No 400k/800k threshold ever awards a life;
  `lives` only decreases (grep `400000|800000|extraLife` = 0 hits). *→ **sw3-6**.*
- **Missing — flashing yellow bonus row** (`byte_4B2C`, drains −8/refresh under
  the score). No `state.ts` field, no amber colour. Open follow-up #7 already
  flags this. *→ **sw3-6** (pairs with extra-life).*
- **Approximated:** shield gauge is a trapezoid chevron, not the authentic vector
  **ring** (`word_96CA`), and never turns amber/red at low shields (`word_96B6`
  tier colours absent); corner frame is two brackets, not 4 blue corner dots
  (`sub_6112`); no "AVOID CATWALKS" prompt. *Documented, not filed (cosmetic).*

### 8. Vector models & geometry — vertices faithful, edges are guesses  ◑ **[→ sw3-8]**

- **Vertices are byte-exact and Faithful:** TIE (52 render verts), Darth Vader
  TIE (56), `Obj_Trench_Squares` (8) all transcribe `Object_3D_Data.asm`
  exactly. Do not re-open.
- **Edges are 100% hand-authored (systemic Approximated).** `Object_3D_Data.asm`
  holds vertices only; the real line-segment connectivity lives in the AVG vector
  ROM `136021.105`, which is **not in the dump**. Every model's wireframe pattern
  — what the player actually sees — is an educated guess until that ROM is
  decoded from MAME. *Blocked; documented, not filed (big spike if ever wanted).*
- **Missing — TIE wing-fragment death models** (`Obj_Tie_Wing_Frag_1/2/3`,
  19/19/29 verts): the authentic split-apart kill animation. Frequent (every TIE
  kill). *→ **sw3-8**.*
- **Wrong role — surface models.** `DEATH_STAR_SURFACE` mislabels the tower-class
  `Object_8` as the whole surface (ROM surface = the 50-dot field); `SURFACE_TOWER`
  uses `Object_10`, which the findings doc groups as a *trench catwalk brace*,
  while the real tower family `Object_13–18` is entirely un-ported. *Documented,
  not filed (blocked on unconfirmed object identities; would ride with sw3-3's
  surface work).*
- **Exhaust port** is an authored octagon with no confirmed ROM source
  (`Object_12`'s concentric squares are the untested nearest candidate).
  *Approximated, acceptable.*

---

## What's faithful — do NOT re-open

- TIE / Darth / trench-square **vertex data** (byte-exact).
- Aim/lock geometry (`aimDirection`/`isLocked`, the inverse-projection lock).
- Scores that are already correct: laser tower/bunker **200**, trench turret
  **100**, green square **50**, Use-the-Force wave-1 base **5,000**.
- Catwalk = shield-cost hazard *semantics* (only its dodgeability is broken).
- Comma-grouped score readout, two-colour SCORE/WAVE panel, the four trench
  outcome banners.
- The TIE kinematic swoop / per-fighter fire / concurrency-cap (epics 9-2..9-5).
- The `GameEvent` channel design (exhaustive, every modeled moment consumed).

---

## Follow-on stories filed (epic sw3)

| Story | Pts | Pri | Gap it closes |
|---|---|---|---|
| **sw3-1** | 2 | p1 | Bake resolved ROM scores (TIE 1,000, Darth 2,000, exhaust 25,000, fireball 33) |
| **sw3-2** | 5 | p1 | Trench pilotable viewpoint (`sub_703B` band) → dodgeable catwalks |
| **sw3-3** | 5 | p2 | Surface wave-scaled towers (`byte_98CB`) + 50,000 all-towers bonus |
| **sw3-4** | 3 | p2 | Trench voice-line timer (Luke trust me / Yahoo / Force is strong) |
| **sw3-5** | 5 | p2 | Phase music engine (needs assets sourced) |
| **sw3-6** | 3 | p2 | Extra-life thresholds (400k/800k) + bonus/extra-life HUD row |
| **sw3-7** | 3 | p3 | Trench per-run PRNG variation (fixed-head + picked-tail) |
| **sw3-8** | 2 | p3 | TIE wing-fragment death models |

## Identified but NOT filed (deferred / blocked / cosmetic)

Documented here so they aren't rediscovered; promote into sw3 if prioritized:

- **Trench turret return-fire** (`sub_B3E9` `$E`-row) — the trench has no
  incoming threat. Strong candidate; deferred as a difficulty design call.
- **Surface authentic models** — port the tower family `Object_13–18`, re-home
  `Object_10`, add the 50-green-dot field. Blocked on unconfirmed object
  identities; would ride sw3-3.
- **Authentic shield ring gauge** (`word_96CA`) + low-shield tier colours
  (`word_96B6`). Cosmetic.
- **Vector connectivity from `136021.105`** — the systemic edge-fidelity fix;
  large spike, blocked on decoding MAME's vector ROM.
- **Space/TIE deep model** — table-driven spawns, behavior-script VM, drop
  TIE-body collision (see §2). Spec ready in `tie-flight-ai-model.md`.
- Minor/cosmetic: corner-dot HUD frame (`sub_6112`), "AVOID CATWALKS" prompt,
  `byte_49C1` wall-recede, bespoke Death-Star/Force SFX, low-shield tier audio,
  fireball score 50→33 (rolled into sw3-1), Use-the-Force wave-scaling
  (Open follow-up #11), exhaust-port `Object_12` evaluation.

---

## Provenance / safety

This document is our own analysis and is safe to commit. It reproduces no ROM
code; all `ROM:addr` / `byte_*` / `Object_*` references point into the gitignored
`reference/disasm/` material (see [`star-wars-1983-source-findings.md`](./star-wars-1983-source-findings.md)
for full provenance). Numbers cited are game constants re-expressed as our own
data, consistent with the existing findings doc.
