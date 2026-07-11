# Star Wars (1983) — whole-game source findings from the ROM disassembly

**Source:** the commented IDA disassembly of Atari's 1983 *Star Wars* arcade game
(Motorola 6809E main board + 6809 sound board), kept locally under `reference/`
(gitignored). Primary file: `reference/disasm/StarWars_annotated.lst` (40,047
lines, full `$0000–$FFFF` listing with ~4,000 hand comments). Supporting files:
`Object_3D_Data.asm` (raw vertex tables), `Memory_Locations.asm` /
`Direct_Page.asm` (RAM maps), `SW_M_Hi.asm` (Math Box call sites), and
`disasm/sound/` (POKEY SFX + TMS5220 speech).

**Provenance** (per `reference/README.md`): `disasm/` was extracted from `SW.zip`
(main board, 5 `.asm`) and `SW_Sound.zip` (sound board, 29 `.asm`) provided
locally for this project; the material traces back to the wardclan AVG
disassembler tooling. It is a **derivative of Atari's copyrighted code, kept
purely for study** — we *read* it to recover real numbers (vector models, game
constants, speech tables) and re-express them as our own TypeScript. It is never
committed or redistributed. This findings doc is the committable, numbers-only
distillation.

**Original Atari source — the AVG vector *pictures*.** The gitignored
`reference/disasm/` is a *disassembly* of the two 6809 boards; it does **not**
contain the AVG (Analog Vector Generator) picture ROM — the actual drawn shapes
(gunshots, explosions, the "small circle," etc.). Those live in the **preserved
original Atari source**, GitHub
[`historicalsource/star-wars`](https://github.com/historicalsource/star-wars)
(pinned commit `5355b76`). Project codename was **"Warp Speed"**, hence the
`WS*.MAC` files. Map:

| File | Contents |
|------|----------|
| **`WSVROM.MAC`** | ⭐ the vector ROM — object **pictures** (TIE, Death Star, gunshots/fireballs, explosions). This is what the local disasm's `JSRL`/`VR` picture addresses point at. |
| `WSOBJ.MAC` | object tables · `WSMAIN.MAC` main game · `WSGUNS.MAC` firing ("DO THE FIREBALL") · `WSGAS.MAC` scoring (`;HIT FIREBALL .BYTE 0,0,33`) · `WSLAZR.MAC` lasers · `WSXPLD.MAC` explosions |
| `AVGROM.MAC` | the AVG **state PROM** (hardware microcode, Halverson/Margolin) — *not* pictures |
| `VGAN.MAC` | alphanumeric vector subroutines (Ed Logg) · `SWMP.MAC` Math Box micro-program (Margolin) |

Files are tiny (16 KB RAM cabinet) and **CR-terminated, non-UTF8** — fetch raw
and normalize with `tr '\r' '\n'` before grep. **Worked example — the enemy
fireball:** it is the `GNB0–3` (base sparkle) + `GNT0–3` (tip fuse-ball) picture
in `WSVROM.MAC` under `.SBTTLE GUNSHOT PICTURES` ("GUN SHOTS — SPARKLES WITH FUSE
BALLS"): an **animated red radial sparkle** — `COLOR VGCRED`, ~8 spikes drawn
from center `(0,0)` outward with `FUSE` balls, cycling 4 frames, `ASPECT` for a
round envelope. It is emphatically **not** a ring, and **red, not amber** — see
story **sw3-9**.

**How this was produced:** the annotated listing was read end-to-end by parallel
extraction agents (one per ~5,000-line range) plus dedicated passes over the
object/memory/sound files. Each pulled labels, addresses, table bytes, constants,
score values, color/intensity writes, phase-machine facts and sound triggers.
Every claim that touches a game constant used later (trench geometry, obstacle
placement, scoring) was re-grepped against `StarWars_annotated.lst` before
landing here.

> **⚠︎ Transcription caveats.** (1) The disassembly's own hand comments are
> sometimes wrong or uncertain; every spot the source annotator flagged with a
> trailing `?`, or that an agent judged unreliable, is preserved inline with a
> **⚠︎**. (2) Auto-generated `byte_XXXX` / `word_XXXX` / `DPbyte_XX` / `sub_XXXX`
> labels carry no hand identification — a descriptive name (`Obj_Trench_Squares`,
> `Stars_YT`) means the annotator identified it; a placeholder does not. (3) The
> score-value tables and the on-screen "SCORING" text agree on every point value
> once the BCD digit-placement is read correctly — see **Scoring tables** for the
> one cross-note conflict this resolves. Treat *labels and structure* as
> authoritative; re-verify any single magic number against the `.lst` before
> baking it into a constant.

---

## Coverage — ROM regions → our code

| ROM region / symbol | Contents | Maps to (our code) |
|---|---|---|
| `VRAM $0000–$2FFF` | AVG vector display-list RAM (double-buffered) | `shell/render.ts`, `shell/wireframe.ts` |
| `$0000–$00FF` direct page (`DPbyte_*`) | game-mode byte, score BCD cells, joystick, shield, object pointers | `core/state.ts` |
| `IO $4300–$47FF` | switches, DIP, ADC yoke, sound port, EVG strobes, Math Box divider | `core/input.ts`, `shell/input.ts` |
| `RAM $4800–$4FFF` | credits, high-score RAM, TIE/fireball live tables, per-wave state | `core/state.ts`, `core/highscore.ts` |
| `MBRAM $5000–$5DFF` | Math Box register file (`MReg00–4E`), star-dot RAM | `core/math3d.ts` |
| `Object_3D_Data.asm $6005–$670D` | 21 vertex models (TIE, Darth TIE, trench squares, towers) | `core/models.ts` |
| `Jump_Table_1 $6044` (61 states) | master game-phase dispatcher | `core/sim.ts`, `core/state.ts` |
| `sub_72C7` + `sub_786A/8BE1/8E23` | space wave: TIE render, AI script VM | `core/sim.ts`, `core/scenePresets.ts` |
| `sub_69A9/A1CE/A214` | Death Star surface + towers | `core/surface-grid.ts` |
| `sub_6B22/8341/8408` + `off_7CC0` | trench run: viewpoint, segment chain, catwalks/turrets | `core/trench-channel.ts` |
| `byte_9847–9868` + `loc_9810` | score-value tables + BCD adder | `core/gameRules.ts` |
| `sub_761D/743C/E7C7` + text tables | HUD score/prompt/text rendering | `core/hud.ts`, `shell/font.ts` |
| `word_D604/D612` + IRQ color cycle | vector color/intensity palette | `shell/render.ts`, `shell/wireframe.ts` |
| `Sound_1..3B`, `off_7F61`, `SpchTab` | SFX / music / 23 speech phrases | `shell/audio.ts` |
| `sub_CA8C/CC18` + NOVRAM | high-score table + persistence | `core/highscore.ts`, `shell/storage.ts` |
| `sub_F146/F18D/F1C6` | joystick/yoke processing + calibration | `core/input.ts`, `shell/input.ts` |

**Game-phase dispatcher.** `sub_6005` (ROM:6005) busy-waits on the vector
generator, then reads `DPbyte_41` "Game mode/screen state", doubles it, and jumps
through `Jump_Table_1` (ROM:6044) — **61 entries (0–60)** covering the whole
attract → game-init → space wave → Death-Star-entry → towers → trench →
exhaust-port → Death-Star-explosion → game-over → high-score chain. Key states:
0 game init; 5/6/7–12 attract screens; 13–14 difficulty select; 25–26 real game
start (shields = `(byte_4593 & 3) + 6` ⇒ **6–9 shields** by difficulty); 31/32
space wave; 35–38 entering Death Star; 39/43 trench entry (shared with
towers-complete); 44–46 towers; 47/48 trench run; 17 exhaust-port hit; 19–22
Death Star explosion; 52 staged post-kill scoring; 58–60 game over.

---

## Space wave & TIE fighters

**Live-object tables** (init by `sub_6161` "Initialise tie fighters and
fireballs", ROM:6161):

- `byte_4900` "3x Tie fighter data structure" — **3 slots × `$19` (25) bytes** =
  `$4900–$494A`. Max 3 TIEs on screen.
- `word_50F0` "3x Tie fighter math data structure" — 3 × `$20` (32) bytes, in
  Math Box RAM.
- `byte_494B` "6x Fireball data structure 2" — **6 slots × 6 bytes** = `$494B–$4980`.
- `word_5160` "6x Fireball math data structure 2" — 6 × 8 bytes ⚠︎ (source comment
  reads "per Tie" — a copy-paste slip; it is per fireball).
- `byte_49E2` "3D Object state data 2. 8 slots of 14 bytes" — shared TIE/tower/
  bunker **explosion-fragment** pool (`$70` bytes); an `swi` traps if a fragment's
  type byte ≥ 9.

**TIE models** (`Object_3D_Data.asm`, vertices only — no edge list in that file;
connectivity lives in the draw code, `sub_6819`):

- `Obj_Tie_Fighter` @ `$6005` — **53 literal vertices** (declared size 54; the
  "54th" is a borrowed neighbouring `(0,0,0)` ⚠︎ — see the +1 note below).
- `Obj_Tie_Wing_Frag_1/2/3` @ `$6143/$61B5/$6227` — 19/19/29 verts, the TIE's
  split-apart death fragments (Frag_3 verts 1–28 are byte-identical to
  `Obj_Tie_Fighter` verts 25–52, the aft half).
- `Obj_Darth_Tie` @ `$62D5` — **57 verts**, the named Vader TIE (bent-wing).
- ⚠︎ **The +1 declared-size quirk:** `Object_Size_Table` (`$7644`, cross-ref
  `StarWars_HighPage.lst`) lists point counts that are frequently *literal + 1*;
  the copy loop reads one borrowed vertex from the next object. Port the **literal
  contiguous vertex list per object**, not the declared size, unless the trailing
  `(0,0,0)` is deliberately drawn. No R2-D2 model exists anywhere in the file.

**TIE AI is a bytecode VM.** `sub_8E23` interprets per-TIE scripts through
`JumpTable8E68` (ops: wait-on-flag, jump, call, return, load-maneuver-mask,
loop, `swi`-guard). `sub_8BE1` reads a 6-bit "which axes to nudge" mask
(`$11,x`) and applies roll/pitch/yaw; `sub_8D9D` runs 6 velocity integrators;
`sub_8DE3` clamps each TIE axis to `[$8300, $7D00]`. Firing gate uses a per-wave
table `byte_8D71` (11 × 4 bytes: `mask, threshold, ptr_hi, ptr_lo` — dumped in
`core/gameRules.ts` / `docs/tie-flight-ai-model.md`), indexed by
`byte_4B19 = min(wave-1 + DIP, 11)`, above which `byte_8D99 = 3,$30,$49,$4B`.

**TIE colour escalation.** `word_7A08` "Tie fighter colour table" (ROM:7A08, 16
STAT pairs) brightens a TIE as it survives attack passes: `$6280/$6730`
(dim) → `…$6780` → `$67C0/$67C0` (brightest/flash).

**Space-wave loop** `sub_6838` (state 31): music at timer `$28`(40)→`Sound_24`
(or `Sound_1D` Imperial March if wave≥3 & odd), `$C8`(200)→`Sound_25`,
`$190`(400)→`Sound_1E` "Enter Death Star", ≥`$1A4`(420)→ state 33.

---

## Death Star surface & towers

**Surface.** `sub_620F` "Init towers surface dots" fills `Star_Dots_MRAM`
(`$190` bytes = **50 dots × 8 bytes**, X/Y words + Z forced 0) — a flat random
dot field, same generator as the starfield but Z=0. Drawn by `sub_7EAF` "Towers
surface dots" as **green dots** (`$6280`).

**Towers/bunkers.** `sub_69A9` "Towers/Bunkers init": `byte_4B13` (tower
difficulty index) `= min(byte_4B15-1, $1F)`; `MReg43=$100`, `MReg4E=$2000`;
plays `Sound_20` "Towers 1 music". `sub_A1CE`: if `byte_4B13 ≥ $13`, re-rolls it
`PRNG*6 + $D` (range `$D–$4C`); the towers-remaining counter `byte_4B1A` is read
from `byte_98CB` indexed by `byte_4B13`:

```
byte_98CB (ROM:98CB): 0,$16,$16,$20,$20,$20,$21,$21,$27,$28,$20,$20,
                      $24,$24,$24,$25,$25,$31   byte_98DD = $32 (clamp)
```

**Placement layouts** (`sub_A214`): `byte_4B13 × 4` indexes `off_A182` (ROM:A182,
32 pointers, first 19 in-range; fallback `off_A1CA` = `byte_9B62, byte_9C42`).
Each target table holds **32 (`$20`) 7-byte records** `X_lo, X_hi, Y_lo, Y_hi,
attr1, attr2, index` (≈224 bytes/table). Example first records of `byte_98DE`:
`($10,0, $B0,0, 3,1, 0)`, `($10,0, $E0,0, 3,1, 1)`. ⚠︎ `off_A182` contains one
apparent self-reference (likely a coincidental byte pattern, not a real
recursive pointer). ⚠︎ one entry in `off_A182` reads as `off_A182` itself.

**Tower geometry** (`Object_3D_Data.asm`, `sub_6C1C`/`6CFC`/`6EB1` draw): the
`Object_8`-class (reused ×4) and `Object_13`–`Object_18` families are surface
tower/turret/gun-emplacement variants; `Object_8` = 16 verts (5 groups of 3);
`Object_13–18` all share Z-depths `$168`/`$FE98`. Exact tower-vs-turret identity
is unconfirmed ⚠︎ (no descriptive names for `Object_6`–`Object_21`).

**Tower scoring/fire** (`sub_A459`/`loc_A54B`): `4,x==3` "type-3" tower →
`sub_97F7` "Laser tower score"; else → `sub_973A` "Towers incrementing score";
both end `Sound_35`. Towers-wave ends when `DPbyte_A7` (rotation-overflow) ≥ 5
and `MReg4C ≥ $80` → state 43 (trench entry).

---

## Trench geometry & limits

**Entering the trench.** `sub_83A4` "Called when starting trench" (ROM:83A4)
copies 16 pointer words from ROM `off_7C7E` into RAM `word_4B3F..word_4B5F`, then
**randomizes the tail**: for the remaining slots, `lda #$11; ldb PRNG; mul; asla;
ldd a,x[off_7C9E]; std ,u` — i.e. the trench layout is a **fixed head + a
PRNG-picked tail** drawn from the `$11` (17)-entry table `off_7C9E`. Every trench
run therefore differs.

`sub_8341` "Entering trench" (ROM:8341) zeroes `DPbyte_44/45`, clears
`byte_4989..word_49A9`, selects the section-pointer chain via `byte_4B12`
indexed into `off_7CC0` (bounded `off_7CC0+$16`, else default `word_4B3F`),
installs it into `word_49A9`/`word_49AB`, and **primes 8 segments ahead** by
calling `sub_8408` (via `sub_83CE`) 8×.

**Segment stepper** `sub_8408`/`sub_83CE` (ROM:8408/83CE): reads the segment-type
byte `,u` from `word_49B3`:

- type **1** → advance Z by `$800`; other types → `$1000` (accumulated into
  `word_49B5`, the Z-distance-to-next-waypoint).
- type **5** → follow `word_49AB` chain +2 and dereference (waypoint loop-back).
- type **3** → latches `DPbyte_93 = word_49B5`, sets `DPbyte_92 = $FF` — the
  **exhaust-port approach boundary** (see *Exhaust port*).
- type **4** → latches `DPbyte_96 = word_49B5`, sets `DPbyte_95 = $FF`; on the
  one-shot `byte_4B36` latch, calls `sub_97E3` → the **"Use the Force" scripted
  scoring trigger** ⚠︎ (strong inference from position + score sub).
- A nibble index `(word_49B5 >> 3) & $F` selects one of **16** per-column
  catwalk/turret mask slots in `byte_4989` (left) / `byte_4999` (right).

`sub_83CE` keeps priming while the camera has < `$6000` units of lookahead
margin; it bails entirely once `DPbyte_92` (exhaust port) is latched.

**Trench viewpoint clamps — `sub_703B` "Trench viewpoint calc" (ROM:703B):**
joystick deflection is filtered, then clamped in two axes:

| Clamp (source comment) | Upper | Lower | Stored to |
|---|---|---|---|
| "Trench X min/max limits" (`loc_705B`) | `$1FF` (+511) | `$FE01` (−511) | `MReg4D`, `MReg21` (YT2) |
| "Trench Y top/bottom limits" (`$70A4`) | `$FEFF` (−257) | `$F201` (−3583) | `MReg4E`, `MReg22` (ZT2) |

So the cockpit rides a **symmetric ±511 lateral band** and an **asymmetric,
downward-biased −257…−3583 vertical band** (the viewpoint sits above trench
centre and can dip toward the floor much further than it can rise). ⚠︎ The comment
axis labels ("X"/"Y") don't line up with the registers actually written
(`YT2`/`ZT2`); trust the magnitudes, which are what the geometry needs.

**Trench floor & wall line generators** (Math Box point tables):

- `sub_85F9` (floor lines, one side) uses `word_8696` = 12 words / 6 XZ pairs:
  `$FC00, 0, $400, 0, $FC00, $F000, $FE00, $F000, $200, $F000, $400, $F000`;
  emits vector opcode `$6270`.
- `sub_86AE` (opposite side) uses `word_8725` = 8 words / 4 XZ pairs:
  `$FC00, 0, $FC00, $F000, $400, $F000, $400, 0`; opcode `$6250`.
- `sub_8735` walks the wall-segment chain, opcode `$6260`, two passes with
  `MReg3D = $FC00` then `$400` (left/right wall).
- `sub_87CB` (side-wall vertical-line recursion): clamps the Z window to `$800`,
  floors `MReg3E` at `$F000`, culls past camera + `$7000` and past the exhaust
  plane (`DPbyte_93`); calls `sub_CD08` "Trench side vertical lines calcs" +
  `sub_CCFC` "Trench floor lines calcs".
- The 3D math is thin banked wrappers into the math ROM: `sub_CCFC`→`$6782`,
  `sub_CD08`→`$67AA`, `sub_CD14`→`$67D2` ("Matrix Multiply - Transposed, then
  perspective division?" ⚠︎), `sub_CD20`→`$67D4` "Do 3D object transform using
  Matrix 1".

`Obj_Trench_Squares` @ `$6497` — the named trench cross-section, **8 vertices,
Y=0 throughout** (two nested rectangles in the XZ plane), declared size 8 (exact):

```
0: $FF00, 0, $FF40      4: $FF80, 0, $FFC0
1: $FF00, 0, $C0        5: $FF80, 0, $40
2: $100,  0, $C0        6: $80,   0, $40
3: $100,  0, $FF40      7: $80,   0, $FFC0
```

Outer ring `$FF00..$100 × $FF40..$C0`, inner ring `$FF80..$80 × $FFC0..$40`.
`Object_10` @ `$64C7` (15 verts) repeats that outer rectangle (verts 1–4) then
adds a raised catwalk/girder brace; `Object_11` @ `$6521` (6 verts) is three
vertical posts (height `$200`); `Object_12` @ `$6545` (12 verts, all Z=0) is
three concentric squares (corner magnitudes `$60/$A0/$100`) — a targeting-reticle
/ lock-on box. ⚠︎ These object identities beyond `Obj_Trench_Squares` are agent
inferences, not source names.

---

## Trench catwalks, turrets & wall squares

**Section-style table** `off_7CC0` "Trench catwalk/turrets data?" (ROM:7CC0) ⚠︎
(the annotator's own comment is uncertain) — **11 word pointers**, indexed by
`byte_4B12`:

```
off_7CC0: off_7B1E, off_7B3E, off_7B5E, off_7B7E, off_7B9E, off_7BBE,
          off_7BDE, off_7BFE, off_7C1E, off_7C3E, off_7C5E
```

Each `off_7Bxx` sub-table is 16 words = 8 pairs pointing at named byte blobs
(`byte_82DC` recurs across many rows — a shared wall/turret shape). A nested
indirection `off_7C7E`→`off_7C9E` is a flat list of **17** catwalk cross-section
shapes (`byte_7Dxx`/`byte_7Exx`/`byte_82A5`), the PRNG-picked tail from
`sub_83A4`.

**Shape encoding.** Each blob is a stream of triples `(type-byte, dx, dy)`
terminated by the sentinel byte **`5`** (occasionally `3`/`4`). The leading
type-byte (`1` vs `2`) distinguishes catwalk cross-brace vs turret housing.
Representative dumps (from `byte_7CD6`+ and the `$7E75–$8340` block that feeds
`off_7CC0`, all hex):

```
byte_7CD6: 1,8,8, 2,0,3, 2,$20,$20, 1,3,$30, 1,2,2, 2,$80,$8C, 2,$38,8,
           1,0,0, 1,$E,$C2, 1,$C0,0, 2,$80,$80, 5
byte_7D11: 1,0,0, 1,$A0,$A0, 1,3,3, 1,$A,$A, 1,0,0, 1,$38,$38, 1,$20,$20,
           1,$C0,$C0, 1,0,0, 1,0,0, 1,$E,$E, 1,8,8, 1,0,0, 1,8,8,
           1,$20,$20, 1,$80,$80, 5          (16 triples, all type 1)
byte_7D42: 8 triples all type 2, terminator 5
byte_7EB9: 2,$C,$C, 2,3,3, 2,$A0,$A0, 1,3,3, 1,$A,$A, 1,$28,$28, 1,$A,$A,
           2,$A0,$A0, 2,0,0, 2,$A3,$A3, 5
byte_8267: 2,0,0, 2,0,0, 1,$C3,$C3, 2,0,0, 1,$C3,$C3, 2,0,0, 1,$C3,$C3,
           2,0,0, 1,$C3,$C3, 2,0,0, 5
byte_82DC: 1,0,0, 1,$55,$55, 1,0,0, 5      (the shared 3-triple shape)
byte_8325: 1,0,0, 2,$2A,$2A, 1,0,0, 2,$40,$40, 2,$10,$10, 2,4,4, 2,1,1,
           1,$FF,$FF, 4,$FF,$FF, 3
```

(The full `$7CD6–$8340` block is ~40 shape blobs; see
`.superpowers/sdd/extraction/notes-05` / `notes-06` for the exhaustive dump.
Draw routines: `sub_6FD9` "Draws trench turrets", `sub_720B` "Draws trench green
squares", `sub_72D5` "Draws trench catwalks", `sub_7451` "Draws trench exhaust
port".)

**Turret spawn/aim** (`sub_B3E9`, ROM:B3E9) runs **3 turret-row passes**, each
setting a row id and param, then calling the left/right calc + spawn:

| Row | `DPbyte_9C` id | `DPbyte_9D` param | Calc |
|---|---|---|---|
| 1 | 1 | `$B` (11) | `sub_CD38` "Trench left side turret calcs" → `$6864` |
| 2 | 2 | `$E` (14) | + `sub_CD44` "Trench right side turret calcs" → `$68C7` |
| 3 | 3 | `$C` (12) | (both) |

`sub_B43F` (left) / `sub_B579` (right): base pointers into `$4989`/`$4999`,
16-byte column stride; `word_49BD` = per-column-pair hit counter; `byte_49C1`
starts `$88`, decrements by 8 toward floor `$40` as columns clear (⚠︎ a
"wall recedes as turrets are destroyed" effect). Only the `$E`(14) row runs the
player-firing-cone hit-box test (`MReg3E ± $200` vs `MReg22`, `MReg3C-MReg20 ±
$400`); a turret that hits you → `sub_9874` + `Sound_26` "Explosion". Row-2
turret colours: `word_B6B3` = `$6680, $6380, $6580`.

**Catwalk = shield damage.** `sub_B095`'s collision-type branch (ROM:B29C):
shrink-on-left-shift → `sub_97FC` "Trench turrets score"; else → `sub_97F2`
"Trench green squares score" — both `+ Sound_35`. The **green squares (catwalks)
and turrets share one hit-test**, differentiated by a bitmask. The
flight-instructions text (below) confirms rule #2: shield damage occurs "WHEN A
FIREBALL IMPACTS YOUR SHIELD OR WHEN YOU STRIKE A LASER TOWER OR TRENCH
CATWALK" — striking a catwalk costs a shield, identical to a tower strike.

---

## Exhaust port & run outcome

**Approach markers** are two trench-segment types latched by `loc_8434`:

- **type 3** → `DPbyte_92 = $FF`, `DPbyte_93 = word_49B5` — the *exhaust-port
  plane* Z.
- **type 4** → `DPbyte_95 = $FF`, `DPbyte_96 = word_49B5` — the *"Use the Force"*
  marker plane; the one-shot `byte_4B36` latch fires `sub_97E3` (Use-the-Force
  bonus). ⚠︎ inferred as the scripted "Use the Force, Luke" moment.

**Hit/miss test** (inside the trench loop `sub_6B22`/`loc_6B32`): when
`DPbyte_92` is armed, compare `DPbyte_93` (target Z) − `MReg4C` (current Z) − `$800`;
once within range (`≤ 0`):

- `word_4845` (the exhaust-hit flag) **== 0 → MISS**: `byte_4B3E = 1` (explosion
  flag), `Sound_26` "Explosion", `sub_9874`; if shields ≤ 0 → game over
  (`loc_6CE1`), else → state `$31`(49) `sub_6BDB` + `Sound_E`. HUD shows "EXHAUST
  PORT MISSED".
- `word_4845` **!= 0 → HIT**: → state `$11`(17) `sub_6D3B` "Exhaust port hit
  init" (zoom `DPbyte_56=$7304`, Death-Star-zoom `DPbyte_58=$0AFF`, `Sound_1F`
  "Death Star destroyed"); plays `Sound_7` if wave ≥ 3 and odd. HUD shows "DEATH
  STAR DESTROYED".

**Voice-line triggers by trench timer** `word_4B0E`, gated by `byte_4B12` parity:

| timer | parity | Sound |
|---|---|---|
| 2 | either | `Sound_22` "Trench music" |
| `$10`(16) | even | `Sound_18` "Luke trust me" |
| `$18`(24) | even | `Sound_1A` "Yahoo you're all clear kid" |
| `$10`(16) | odd | `Sound_C` |
| `$16`(22) | odd | `Sound_16` "The Force is strong in this one" |

**Staged post-kill scoring** `sub_6BF1` "Death Star explosion complete" (state
52), `word_4B0E` counting 3→0 in 16-tick steps:

1. `==3` + `word_4845` set → `loc_9806` **"Exhaust port score"** (25,000)
2. `==2` → `sub_9775` **"Shield bonus score"** (5,000 × remaining shields)
3. `==1` + `word_4845` set → `sub_953B` ⚠︎ (uncommented; positionally a
   perfect-run / extra bonus)
4. `==0` → `sub_9722` **"Death Star starting wave bonus score"**

Both the exhaust-port and `sub_953B` steps are gated on `word_4845` — those two
bonuses apply only if the port was actually **hit**, not merely reached. Then
`word_4B0E==$FE`: `byte_4B15`(wave)++ (clamp `$62`=98) → state `$1D`(29) "Next
space wave".

---

## Scoring tables

Score lives in four BCD direct-page cells (`sub_6275`/`sub_679A` zero them at
game start):

| Cell | Comment | Digit places | Multiplier of a byte value there |
|---|---|---|---|
| `DPbyte_5F` ($005F) | "Score" | ones, tens | × 1 |
| `DPbyte_5E` ($005E) | "Score thousands" | hundreds, thousands | × 100 |
| `DPbyte_5D` ($005D) | "Score hundred thousands" | 10k, 100k | × 10,000 |
| `DPbyte_5C` ($005C) | "Score millions" | 1M, 10M | × 1,000,000 |

**The adder `loc_9810` "Add to score total" (ROM:9810)** takes a pointer `u` to a
**3-byte** score-value record and adds it least-significant-byte-first:

```
lda 2,u ; adda <DPbyte_5F ; daa ; sta <DPbyte_5F   ; 3rd byte → ×1
lda 1,u ; adca <DPbyte_5E ; daa ; sta <DPbyte_5E   ; 2nd byte → ×100
lda ,u  ; adca <DPbyte_5D ; daa ; sta <DPbyte_5D   ; 1st byte → ×10,000
lda <DPbyte_5C ; adca #0 ; daa ; sta <DPbyte_5C    ; carry → ×1,000,000
lda #$FF ; sta byte_4B2C                            ; "score changed, redraw HUD"
```

So a record `hi, mid, lo` scores `BCD(hi)×10,000 + BCD(mid)×100 + BCD(lo)×1`.

**Resolved point values** — the score-value tables `byte_9847–9868` (ROM:9847),
each read verbatim below, with the value the adder produces and the on-screen
"SCORING" screen text (`ROM:DE07+`) that confirms it:

| Symbol | Raw `fcb` | Value | On-screen text |
|---|---|---|---|
| `byte_984A` "Tie fighter" | `0,$10,0` | **1,000** | `aTieFighters100` "TIE FIGHTERS … 1,000" |
| `byte_984D` "Vaders tie" | `0,$20,0` | **2,000** | `aDarthVaderSShip20` "DARTH VADER'S SHIP … 2,000" |
| `byte_9859` "Laser tower" | `0,2,0` | **200** | `aLaserTowers20` "LASER TOWERS … 200" |
| (laser bunkers, same value) | — | **200** | `aLaserBunkers20` "LASER BUNKERS … 200" |
| `byte_9853` "Trench turrets" | `0,1,0` | **100** | `aTrenchTurrets10` "TRENCH TURRETS … 100" |
| `byte_9850` "Trench green squares" | `0,0,$50` | **50** | (no line; catwalk hit value) |
| `byte_985C` "Fireball" | `0,0,$33` | **33** | `aFireballs3` "FIREBALLS … 30" ⚠︎ (screen rounds to 30; adder awards 33) |
| `byte_985F` "Exhaust port" | `2,$50,0` | **25,000** | `aExhaustPort2500` "EXHAUST PORT … 25,000" |
| `byte_9862` "Cleared all towers" | `5,0,0` | **50,000** | `aDestroyingAllTowe` "DESTROYING ALL TOWER TOPS … 50,000" |
| `byte_9847` "Using Force" | `$10,0,0` | **100,000** | (base Force bonus) |
| `word_9856`/`byte_9858` per-tower | `0,2,0` | **200** / tower | added into `byte_4B2E/2F/30` per tower |

**Wave-scaled tables:**

- `byte_983B` (Use-the-Force, wave-indexed via `sub_97AC`, 4 × 3 bytes):
  `0,$50,0 / 1,0,0 / 2,$50,0 / 5,0,0` → **5,000 / 10,000 / 25,000 / 50,000**.
- `byte_9865` "Death Star destroyed incrementing score value" (5 × 3 bytes):
  `0,$50,0 / $20,0,0 / $40,0,0 / $60,0,0 / $80,0,0` → **5,000 / 200,000 / 400,000
  / 600,000 / 800,000**. Source comment: the 200,000 & 600,000 (waves 2 & 4) are
  **unused/dead** entries ⚠︎. Entry 0 (5,000) is what `sub_9775` "Shield bonus
  score" loops **once per remaining shield** — i.e. shield bonus = 5,000 ×
  shields ("5,000 ADDED TO DEFLECTOR SHIELD").
- Extra-life score thresholds appear as text `a40000`/`a80000` = **400,000 /
  800,000**.

> ⚠︎ **Cross-note conflict resolved (this is load-bearing — later tasks copy these
> numbers into game constants).** One extraction pass read the `byte_985F`/`byte_9862`
> records as **250,000 / 500,000** (a ×10 error), while another read the on-screen
> text as **TIE = 100** (a truncation misread of the packed high-bit terminator
> char, whose own quoted string was "1,00¦" = 1,000). **Both slips are wrong.** The
> authoritative values are **exhaust = 25,000, all-towers = 50,000, TIE = 1,000**,
> chosen because two independent readings agree exactly: (a) the human-readable
> "SCORING" text strings at `ROM:DE07+` ("25,00¦"→25,000, "50,00¦"→50,000,
> "1,00¦"→1,000), and (b) the BCD arithmetic of `loc_9810` placing the 3 record
> bytes at the ×10,000 / ×100 / ×1 digit positions. The same byte pattern
> `2,$50,0` is even read as **25,000** by the extractor inside the `byte_983B`
> wave table — proving `byte_985F` (identical bytes) is 25,000, not 250,000. Do
> **not** multiply these by 10.

**Central accumulators:** per-tower score builds up in `byte_4B2E/4B2F/4B30`
"Temporary score adder towers 1/2/3"; when `byte_4B1A` (towers remaining) hits 0,
`byte_9862` (50,000) is added and `byte_4B35` (wave-cleared flag) is set.

---

## HUD & framing

**Persistent frame.** `sub_6112` "Insert vector data for four blue dots in screen
corners" (opcode `$B99E`) is called at the top of nearly every per-state render
routine — the **4-corner-dot HUD frame** present on almost every screen. ⚠︎ one
call site (`sub_64F1`, accounting screen) carries a stale "Accounting time stats"
comment.

**Score readout.** `sub_761D` "Display score" draws a `$B9F2` score panel at
`$01E0`, colour `$6280`, 6-digit BCD from `$485C` via `sub_E764`; then the
flashing bonus/extra-life counter `byte_4B2C` (drains −8/refresh, shown at half
value); then the wave digit `byte_4B16` at `($210,$138)`.

**Trench HUD** `sub_743C`: towers-left count when `word_4B0E ≤ 4`, else text `$46`
at `$7100`; trench prompts `$4C/$4E/$4F` selected by `DPbyte_43` bit `$10` and
`byte_4B36`. Space-wave prompt `$4C/$4D` "Shoot Tie Fighters" blinks (gated on
`word_4B0E` bit `$10`). `sub_7707` "Game Over text handling": flashing GAME OVER
Y-position `= (word_4B0E+1)×6` clamped `$20`, intensity `$70`, text index 4.

**Shield HUD** (`sub_953B`–`sub_95A7`): shield count `DPbyte_60` (6–9 at start);
`sub_9558` "Process shields" runs the depletion animation and plays a tier sound
by remaining count (0→`Sound_D`+`Sound_28`, 1→`Sound_2F`, 2→`Sound_F`+`Sound_30`).
The ring graphic uses `word_96CA` "Shield vector table"
(`$BBE4,$BBE8,…,$BC08`, +4 spacing), a mid-anim copy `word_96DE`
(`$BBE6,…,$BC0A`) ⚠︎ ("Another copy of shield vector table??"), and `word_96F2`
(19 entries); colour from `word_96B6` "Shield colour table":
`$6080,$6480,$6480,$6680,$6680,$6280,$6280,$6280,$6280,$6280` indexed by count.
Depletion duration lookup `byte_9718 = 0,2,4,6,8,$A,$C,$E,$10,$12`.

**Text engine.** `sub_E7C7` "Print text string from pointer table" (index `< $D6`
→ `byte_48AE`) → `sub_E7DD` colour (`word_EDA8` "Text string colour") + `sub_E7EA`
position (`word_EA50` "Text string position", ~180 entries) → `sub_E821` glyph
dispatcher → `Display_Vect_BCD` for numbers. Master index→address table `ptrText`
@ `$E894`.

**Player-hit flash.** `sub_B6D7` reads Joystick X/Y (`DPbyte_7D`/`7F`), scales
X×`$6E`, Y×`$50`, and draws a 5-spoke starburst at the yoke/crosshair position —
the "you got hit" flash. A separate 8-frame shield-hit warning box
(`sub_AEBD`/`sub_AF87`, 2×2 marker grid) flashes on `DPbyte_31`.

**High scores.** `sub_C7FD` "Display high scores" renders 10 entries (3-byte
stride into `byte_4AB6`); `sub_CA8C` inserts a new score; defaults seed from
`word_CC98` "High scores init table" (10 pairs, top = 0x128/0x5353) and
`word_CC7A` "High score names" (packed 5-bit initials). Persistence is NOVRAM
(`byte_4500`, 256 bytes; `NVRecall $4687` / `NSTORE $46A0`).

---

## Colors & intensities

Vector colour is a `$6c__` STAT opcode: the low nibble of the high byte selects a
**colour register 1–7**, the low byte is intensity (`$80` = normal, `$FF` = full).

- `word_D604` "Vector colour cycle table full brightness":
  `$61FF,$62FF,$63FF,$64FF,$65FF,$66FF,$67FF` (colours 1–7 @ `$FF`).
- `word_D612` "Vector colour cycle table normal brightness":
  `$6180,$6280,$6380,$6480,$6580,$6680,$6780` (colours 1–7 @ `$80`).
- The IRQ handler runs several per-frame colour-cycle counters, notably `DPbyte_3C`
  "Cycle through 7 colours" and a laser blue/cyan flicker
  ("Colour cycle blue/cyan for lasers", ROM:F07F) stepping `DPbyte_3A` by 2
  (wrap `$20`) through `word_D620`.
- Trench wall passes embed colour in their vector opcodes: `$6270` (floor side A),
  `$6250` (side B), `$6260` (wall walk), `$6280` (exhaust-port-adjacent pass).
- Surface tower dots draw green (`$6280`); star dots draw blue.
- TIE hit colour-cycle `word_BB3B` (32 entries): ramps dim `$62xx` → flash
  `$67xx` → steady `$66A0`. Tower fragments colour `$67`; bunker fragments `$64`.
- Death Star explosion ring colours by state: `$6480` → `$61FF`+`$64FF` →
  `$67FF`+`$61FF` → `$67FF`, growth thresholds `$3F`(63) and `$50`(80).
- Attract-text fade colours `byte_4B10`: `$6480`/`$6580`/`$6180` per screen.
- Per-string colour table `word_EDA8`: dominant `$6280,$6480,$6180,$6580,$6680,
  $6780`; `$A01A` appears as a non-colour placeholder for unused string slots ⚠︎.

---

## Sound hooks

**Main-board triggers.** `Write_Sound` (ROM:BCE9) polls `SOUNDIO+1` bit 7 (up to
14 retries) then writes a sound ID to `SOUNDIO` (`$4400`). Every `Sound_n` is just
`lda #n; jmp Write_Sound` — **59 IDs (`$01`–`$3B`)**. Named speech/music cues:

| ID | Cue | ID | Cue |
|---|---|---|---|
| `$11` | "Remember" | `$1E` | "Enter Death Star" |
| `$13` | "Look at the size of that thing" | `$1F` | "Death Star destroyed" |
| `$14` | "Stay in attack formation" | `$20`/`$21` | Towers music 1 / 2 |
| `$16` | "Force is strong in this one" | `$22` | Trench music |
| `$17` | "Red 5 I'm going in" | `$24`/`$25` | Space wave music 1 / 2 |
| `$18` | "Luke trust me" | `$26` | Explosion |
| `$1A` | "Yahoo you're all clear kid" | `$32` | R2 beeps entering Death Star |
| `$1B` | High score | `$1D` | Imperial March |

Phase→music: space `$24/$25`, towers `$20/$21`, trench `$22`, Death-Star-entry
`$1E`(+R2 `$32`), destroyed `$1F`. Attract random-picker `off_6759` (9 entries).

**Sound board** (6809, POKEY SFX + music, TMS5220 speech; `SW_Sound.asm`): the
master command jump table `off_7F61` has **60 entries** — index 0 silence, 1 SFX,
2 test tones, **3–25 speech**, **26–36 music**, 37–58 more SFX (`snd_Fire_Guns`
at 57). Commands > `$3C` (60) are ignored; a 32-entry ring buffers them.

**Speech phrase table** `SpchTab` (24 × 4-byte entries, fully named):

```
0/1 "Use the force Luke"   6 "R2 try and increase the power"  12 "I have you now"
2 "Remember"               7 "You're all clear kid"           13 "Look at the size of that thing"
3 "I'm on the leader"      8 "Let go Luke"                     14 "Stay in attack formation"
4 "The force is strong…"   9 "<Vader breathing>"              15/16 "The force will be with you"/"Always"
5 "Red five standing by"  10 "Yahoo!"                          17 "<R2 scream>"  18 "<Tie fighter>"
                          11 "I have you now"                  19 "I'm hit but not bad, R2…"
20 "I've lost R2"   21 "Great shot kid…"   22 "I can't shake him"   23 "Luke trust me"
```

⚠︎ The `off_7F61` speech commands (indices 3–25) do **not** map 1:1 to `SpchTab`
phrase numbers: each pushes a short `$FF`-terminated micro-script of phrase
numbers (with `$FE` = pause) into a 16-slot ring, so one command can trigger a
timed multi-line snippet. ⚠︎ The exact TMS5220 hardware port was not resolved in
the breadth pass (only the driving state machine). Only `snd_Fire_Guns` is
semantically named among the FX; the other 22 FX entries are `FX_loc_*`
placeholders over raw POKEY envelope tables.

---

## Open follow-ups

Keyed to our code — each is a place the ROM numbers above should be reconciled
against the current clone:

1. **`core/models.ts`** — port the literal vertex lists (not the declared
   `Object_Size_Table` sizes; the +1 borrowed `(0,0,0)` ⚠︎). Confirm the TIE
   (53 verts), Darth TIE (57), and `Obj_Trench_Squares` (8, listed above). Edges
   are *not* in `Object_3D_Data.asm` — derive connectivity from draw order /
   `sub_6819` (already tracked in `docs/HANDOFF-authentic-vector-edges.md`).
2. **`core/trench-channel.ts`** — **partially trued up (epic 14 task 2).**
   `RIB_Z` (400→512) and `TRENCH_FAR` (6000→7168) now scale off `sub_87CB` (the
   side-wall vertical-line recursion): its Z-window clamp `$800` (2048) is 2× the
   wall half-width `$400` (1024) from `sub_8735`'s left/right wall pass
   (`MReg3D`), and its cull-past-camera distance `$7000` (28672) is 28× that same
   half-width; both ratios were applied to our existing `TRENCH_HALF_W` anchor
   (256), since the ROM has no documented unit↔world-unit conversion to
   transplant raw magnitudes directly. `TRENCH_HALF_W` and `TRENCH_WALL_H` stay
   **provisional**: the half-width has two conflicting ROM candidates
   (`Obj_Trench_Squares` outer ring ±$100=256 vs `sub_8735`'s ±$400=1024, and
   nothing to arbitrate which is the true wall position without that
   conversion), and no source gives a static wall *height* (`sub_703B`'s
   vertical viewpoint clamp is the camera's travel range inside the trench, not
   wall geometry). `core/trench-detail.ts`'s new `PANEL_Z`/`PANEL_W`/`PANEL_H`/
   `PANEL_INSET_Y` (recessed wall panels, epic 14 task 2) are likewise
   provisional — the ROM has no fixed panel/window grid, only the PRNG-picked
   `off_7CC0` → `off_7Bxx` per-section shape script (procedural catwalk/turret
   blobs of varying size, not uniform rectangles). That script plus
   `Obj_Trench_Squares` and the `word_8696`/`word_8725` floor-line point tables
   remain the authentic source for a future full geometry pass. The
   **viewpoint clamp** should still mirror `sub_703B`: lateral ±511, vertical
   −257…−3583 (downward-biased). *(feeds "trench obstacles" task.)*
3. **`core/trench-channel.ts` / obstacles — RESOLVED (epic 14 task 3,
   `core/trench-obstacles.ts`).** Turrets and wall squares are now targetable
   entities: shootable for score (`byte_9853`=100 turrets, `byte_9850`=50
   squares — see ## Scoring tables). Catwalks are a separate, non-shootable
   hazard — cockpit contact costs a shield, per the flight-instructions text's
   unambiguous rule #2 ("...OR WHEN YOU STRIKE A LASER TOWER OR TRENCH
   CATWALK"). ⚠︎ Note this narrows the ambiguous "green squares (catwalks) and
   turrets share one hit-test" phrasing directly above (`sub_B095`'s
   collision-type branch) — that branch's two arms are named "Trench turrets
   score" / "Trench green squares score", i.e. both SCORE (bolt hits), which
   does not on its face match "share a hit-test with catwalks" (a shield-cost
   hazard, per the flight-instructions text); the doc's own hedge on
   `byte_9850`'s on-screen text ("no line; catwalk hit value") shows the
   annotator wasn't certain either. Trusted the flight-instructions text as the
   tie-breaker. Turret spawn/aim (`sub_B3E9`) still confirmed 3 ROM rows
   (params `$B`/`$E`/`$C` — left / right / both walls; only the `$E` row runs a
   firing-cone hit-box, a DIFFERENT check from the bolt-vs-obstacle one) —
   `TRENCH_OBSTACLE_STATIONS` now places its turret stations along that
   left/right/both structure. Exact station Z-spacing, `OBSTACLE_HIT_RADIUS`,
   and the three wireframe shapes (`TRENCH_TURRET`/`TRENCH_SQUARE`/
   `TRENCH_CATWALK`) remain PROVISIONAL: no ROM↔world-unit conversion exists to
   turn the `off_7CC0`→`off_7Bxx` (type-byte,dx,dy) shape-script triples into
   exact coordinates, and the extraction notes flag it uncertain whether those
   triples encode placement or silhouette geometry. `byte_49C1` wall-recede
   effect (`$88`→`$40`, −8 per column cleared) is still an un-ported cosmetic
   detail.
4. **`core/gameRules.ts` / `core/trench-obstacles.ts`** — bake the **resolved**
   point values: TIE 1,000; Darth 2,000; laser tower/bunker 200; trench turret
   100 (landed in `trench-obstacles.ts`, not `gameRules.ts` — see #3); green
   square 50 (ditto); fireball 33; exhaust-port hit 25,000; all-towers 50,000;
   Use-the-Force 100,000 (or wave table 5k/10k/25k/50k); shield bonus 5,000 ×
   shields; extra life at 400,000/800,000. **Do not ×10 these** (see the ⚠︎
   conflict note). TIE fire aggression from `byte_8D71` is already modelled.
5. **`core/state.ts` / `core/sim.ts`** — the 61-state `Jump_Table_1` is the
   authentic phase machine; our sim need not replicate all 61, but the trench↔
   exhaust↔explosion↔next-wave flow (states 47/48 → 17/49 → 52 → 29) and the
   staged post-kill scoring order (exhaust → shield bonus → `sub_953B` ⚠︎ →
   starting-wave bonus) should match.
6. **`core/surface-grid.ts`** — towers-remaining per wave from `byte_98CB`
   (0,$16,$16,$20,…), 32-record placement tables (`off_A182`), and the flat
   50-dot surface field are the surface's real parameters.
7. **`core/hud.ts` / `shell/font.ts`** — score panel colour `$6280`, 6-digit
   BCD, corner-dot frame, shield ring/colour table `word_96B6`, and the "EXHAUST
   PORT AHEAD/MISSED", "DEATH STAR DESTROYED", "AVOID CATWALKS", "USE THE FORCE"
   HUD strings all have authentic sources here. ⚠︎ **Trued against a real cabinet
   screenshot (epic 14 task 5, not this doc's ROM extraction — see the task-5
   report for source URLs + pixel sampling):** the SCORE/WAVE panel is actually
   TWO colours, not the one `$6280` this doc's text implies — the "SCORE"/"WAVE"
   words render RED, the live digits (score value, wave number) render GREEN
   (the same green as the shield gauge and trench walls); the score readout is
   comma-grouped ("12,066", "60,681"), not zero-padded, resolving the "6-digit
   BCD" ambiguity toward "6 BCD *storage* digits," not "6 rendered glyphs." The
   same screenshots also reveal a THIRD, previously undocumented HUD row: a
   flashing YELLOW/amber bonus or extra-life counter directly under the score
   value (`byte_4B2C`, "score changed, redraw HUD" / the flashing bonus counter
   named in this section's "Score readout" above) — e.g. "60,681" over "33", or
   "12,066" over "5,000" beside a "5,000 FOR USING THE FORCE" banner. This row
   is NOT modelled in `core/state.ts` (no bonus/extra-life field) and was left
   unimplemented in task 5 (shell/render.ts + core/hud.ts formatters only, no
   state changes authorized) — a genuine gap for a future HUD task.
8. **`shell/render.ts` / `shell/wireframe.ts`** — palette is 7 colour registers
   (`word_D604`/`D612`) at normal `$80` / full `$FF` intensity, plus the laser
   blue/cyan cycle and per-object embedded colour opcodes.
9. **`shell/audio.ts`** — map SFX/music/speech to `Sound_1..3B` and `SpchTab`;
   the phase→music table and the trench voice-line timing (`Sound_18` @ timer 16,
   `Sound_1A` @ 24, `Sound_16` @ 22) are the authentic cues. ⚠︎ speech commands
   are micro-scripts, not 1:1 phrase indices.
10. **`core/highscore.ts` / `shell/storage.ts`** — default ladder (`word_CC98`)
    and packed-initials names (`word_CC7A`) are the authentic seeds; persistence
    is NOVRAM in the cabinet → `localStorage` in the clone.
11. **`core/state.ts` `FORCE_BONUS`/`PORT_AHEAD_RANGE` — trued (epic 14 task 4).**
    `FORCE_BONUS` now pins the wave-1 base (5,000) of the wave-indexed
    Use-the-Force table `byte_983B` (## Scoring tables: `0,$50,0/1,0,0/2,$50,0/
    5,0,0` → 5,000/10,000/25,000/50,000). Our sim is not yet wave-scaled, so
    waves 2+ still under-award relative to the ROM (10k/25k/50k) — an open gap,
    not a mis-citation. `PORT_AHEAD_RANGE` (the EXHAUST PORT AHEAD banner's
    trigger distance) stays PROVISIONAL: `## HUD & framing`/#7 confirm "EXHAUST
    PORT AHEAD" as an authentic on-screen string, but no ROM-recovered distance
    pins when it first shows — only the unrelated `$800` hit/miss resolution
    window (`## Exhaust port & run outcome`), which is a different moment (close
    enough to score a hit or miss, not "target now visible ahead"). `models.ts`
    `EXHAUST_PORT` remains an authored octagon — no authentic vertex table names
    or addresses it (see #1); the nearest candidate, `Object_12`'s three
    concentric squares, is the extraction's OWN unconfirmed inference
    ("targeting-reticle / lock-on box"), not safe to claim as the port.
