# The Atari *Star Wars* Math Box — how it works and what it does

**What this is.** Our own, re-expressed notes on the custom 3D-math coprocessor
("the Math Box") in Atari's 1983 *Star Wars* cabinet, written so we can port its
behaviour into `src/core/math3d.ts` faithfully. It synthesises three sources:

1. The annotated 6809 main-program disassembly in
   `reference/disasm/StarWars_annotated.lst` (gitignored) — shows *how the 6809
   drives* the Math Box.
2. **Frank Palazzolo's** Math Box microcode disassembly (`mathdis`,
   <http://www.brouhaha.com/~eric/software/mathdis/>) — shows *what each Math Box
   microprogram computes*.
3. **Jed Margolin's** unit-vector-math notes (<http://www.jmargolin.com/uvmath/uvmenu.htm>),
   the primary authority on the hardware.

> **Caveat (inherited from the sources).** Palazzolo's microcode decode is an
> in-progress reconstruction: *"There is no guarantee any of it is correct."*
> Where the decoded equations look uncertain we mark them. Treat the *shapes* of
> the operations as solid and the *exact register wiring* as "best current
> understanding."

This is reference/design documentation. It is **not** the TIE flight-AI model —
that lives in [`tie-flight-ai-model.md`](./tie-flight-ai-model.md). The flight AI
*uses* the Math Box (this doc) to render; the two are separate concerns.

---

## 1. Why it exists

The main CPU is a **Motorola 6809E** — an 8-bit micro with no fast multiply. A
first-person 3D vector game has to transform and project hundreds of points per
frame at ~30 Hz. The 6809 cannot do that alone.

So Atari bolted on a dedicated **vector-math coprocessor** built from **four
AMD Am2901 4-bit bit-slice ALUs** (ganged into a 16-bit ALU) plus a small
**microcode PROM** and a sequencer. The 6809 loads operands into it, names a
microprogram, kicks it off, and reads results back. It is, in modern terms, a
fixed-function **GPU vertex unit**: matrix multiplies, rotations, and the
perspective transform, in hardware.

Our `core/math3d.ts` (vec3 / mat4 / `project()`) is the software re-implementation
of exactly this unit.

---

## 2. How the 6809 talks to it (the protocol)

The Math Box is **memory-mapped** into the 6809 address space at **`$5000–$5FFF`**
(byte-addressed from the CPU). Internally it has **0x000–0x7FF 16-bit words**; the
first **128 words** are directly addressable and used as the register file
(see §4). A 6809 word access at `$5000 + 2*n` reads/writes Math Box register `n`.

The per-use sequence the 6809 follows (visible all over `StarWars_annotated.lst`):

1. **Load operands.** Write the matrices / translation / sine / cosine into the
   register addresses (e.g. a helper `sub_CE0C` is commented *"Copy transform
   data from [BIC] to matrix 2"*).
2. **Point the BIC** at the source coordinate block (§5) — e.g. `lda #$10` then a
   call commented *"BIC points to Matrix 4"*.
3. **Trigger a microprogram** by writing its start address (the disassembly calls
   the entry `Math_Run_Start`). The sequencer runs that microcode, looping over
   BIC data, and raises a "running" flag.
4. **Wait, then read back** `Reg00/01/02` (`$5000/$5002/$5004`) for the result
   X/Y/Z, or the transformed outputs at `$5040/$5042/$5044`.

So from the CPU's side the Math Box is "write inputs → write opcode → spin →
read outputs."

---

## 3. Number format — 16-bit signed fixed point

All Math Box values are **16-bit signed fixed-point** with **`$4000` = 1.0**.
That is a Q1.14-style format: 2 integer-ish bits (incl. sign) and 14 fractional
bits, range ≈ **−2.0 … +1.9999**. Evidence from the register map:

| Hex     | Value  |
|---------|--------|
| `$4000` | `+1.0` ("Constant One") |
| `$0000` | `0.0`  |
| `$E000` | `−0.5` (the sources' best guess) |

Sine and cosine are stored in this same format (a unit circle of radius `$4000`).
Multiplies are fractional: `a * b` keeps the top 16 bits of the 32-bit product.
**This is why our port must treat model coordinates and matrix entries as scaled
fixed-point, not raw integers** — a vertex value like `$FF30` is a *negative
fraction*, not −208 world units.

---

## 4. The register file (the three matrices)

The first 128 words are the working registers. Palazzolo/Margolin name the
important ones. The unit holds **three 3×3 matrices**, each as rows **A, B, C**
plus a **translation T = (XT, YT, ZT)**:

```
Result:     Reg00 X   Reg01 Y   Reg02 Z        ← read these back

Matrix 1 (Reg03..0E):  A=(Ax,Ay,Az) B=(Bx,By,Bz) C=(Cx,Cy,Cz)  T=(XT,YT,ZT)
Constants:  Reg0F = 0      Reg10 = $4000 (1.0)
            Reg11 = Sine   Reg12 = Cosine        Reg13 = $E000 (−0.5)

Matrix 2 (Reg14..22):  A2 B2 C2  T2=(XT2,YT2,ZT2)   ← XT2/YT2/ZT2 = $5040/42/44
Matrix 3 (Reg24..32):  A3 B3 C3  T3=(XT3,YT3,ZT3)

Constants:  Reg34 = $0040   Reg35 = $0080   Reg36 = $4000 (1.0)
            ... plus scratch Reg37..Reg4E
```

A 3×3 matrix here is an **orientation** (rotation) and the T vector is a
**position/origin** — the standard "rigid transform" split. Matrix 2 is the one
the per-object transforms read; Matrix 3 is a second input used for composing
rotations; Matrix 1 receives composed results.

---

## 5. The BIC — Block Index Counter

The **BIC** is a hardware pointer that walks **blocks of 4 words**, interpreted as
**(X, Y, Z, unused)**:

```
BIC,0 = X      BIC,1 = Y      BIC,2 = Z      BIC,3 = (spare)
BIC++  advances by 4 words → next vertex
```

It is how a microprogram streams through a list of points without the 6809
re-issuing each address: set BIC to an object's vertex table (or to a single
object's XYZ position), run a transform program, and it chews through the block,
`BIC++`-ing as it goes. The spare 4th word is sometimes reused as scratch
(e.g. program `0xAE` writes `BIC,3`).

---

## 6. The microprograms (what each operation *does*)

Microprograms are selected by their start address. The useful ones:

### Rotations — build orientation from angles
Each takes the loaded **Sine/Cosine** (Reg11/Reg12) and rotates the BIC-pointed
points about one axis, applying the 2×2 rotation `(c·p − s·q, s·p + c·q)` to the
relevant coordinate pair, three rows at a time (it processes a whole 3×3 matrix):

| Prog   | Name  | Rotates about | Pair affected |
|--------|-------|---------------|---------------|
| `0x00` | Roll  | Z axis        | (Y, Z)        |
| `0x0E` | Pitch | Y axis        | (Z, X)        |
| `0x1C` | Yaw   | X axis        | (X, Y)        |

Successive Roll/Pitch/Yaw calls compose an object's full orientation from Euler
angles. (The microcode has a documented hazard — it reads `BIC,n` *before*
storing the previous result — which the equations account for with an `OLDBIC`
term.)

### Load / compose matrices
| Prog   | Effect |
|--------|--------|
| `0x77` | Load **Matrix 2** (A2,B2,C2,T2) from the BIC-pointed block |
| `0x80` | Load **Matrix 3** (A3,B3,C3,T3) from the BIC-pointed block |
| `0x40` | **Matrix 1 = Matrix 2 × Matrix 3** — concatenate two rotations (e.g. object orientation × camera orientation) |

### The core transforms — world/view space
These are the per-object/per-vertex workhorses. `P` = the BIC point.

| Prog   | Computes | Meaning |
|--------|----------|---------|
| `0x60` | `Reg = T2 + P·Matrix2` | **regular transform**: rotate model point by Matrix 2, add translation → camera-ready coordinates |
| `0x50` | `Reg = XT + P·Matrix1` | transform via Matrix 1 (transposed variant) |
| `0x2A` | `Reg = (P − T2)·Matrix2` | **view transform**: translate *relative to the camera at T2 first*, then rotate → world→view for whole objects |
| `0x67` | like `0x2A`, scaled by `$E000`, **plus** `Reg38=X²,Reg39=Y²,Reg3A=Z²` and `Reg3B=(X·$4000)²` | transform **and** distance-squared terms — used for range / perspective scaling / culling |

### Projection — 3D → 2D screen
| Prog        | Effect |
|-------------|--------|
| `0xAE`/`0xB0` | `BIC,2 = (BIC,0 − Reg01)·YT`, `BIC,3 = (BIC,1 − Reg02)·YT`, then `XT = BIC,3 − Reg00` — the perspective divide (x,y scaled by a precomputed 1/z held in YT) that yields screen coordinates the AVG can draw |

### Diagnostics & ESB
- `0x57`–`0x5F`: self-test microprograms (load A/B/C, clear/read accumulator,
  `BIC++`, `mhalt`) used by the cabinet's hardware self-test.
- `0xC0`/`0xC7`: extra Matrix-3 transform variants added for *The Empire Strikes
  Back*, which reuses the same Math Box.
- `0x86`–`0xAC`: a cluster of normalize/cross-product-like helpers (squares, dot
  products, reciprocal-ish steps). Decoded but uncertain — revisit only if a
  feature needs them.

---

## 7. How one frame uses it (the pipeline)

For each visible object the 6809 effectively does:

```
1. Build the object's orientation matrix     → Roll/Pitch/Yaw (0x00/0x0E/0x1C)
2. (optionally) compose with camera           → 0x40  (M1 = M2 × M3)
3. Transform the object's vertices to view     → 0x60 / 0x2A   (rotate + translate)
4. Project each transformed vertex to 2D       → 0xAE / 0xB0   (perspective divide)
5. Read Reg00/01/02 (or $5040..), hand the 2D
   endpoints to the AVG to stroke glowing lines
```

The **AVG** (Analog Vector Generator) is a *separate* unit — it draws the line
segments. The Math Box only produces the projected coordinates. (Our render shell
plays the AVG role; the Math Box role is `math3d.ts`.)

---

## 8. Mapping to our clone (`core/math3d.ts`)

| Math Box concept | Our equivalent |
|------------------|----------------|
| 3×3 orientation matrix + T vector | `Mat4` (we fold rotation+translation into one 4×4) |
| Roll/Pitch/Yaw microprograms | `rotX/rotY/rotZ` matrix builders |
| `0x40` matrix concatenation | `multiply(a, b)` |
| `0x60`/`0x2A` transform | `transformPoint(m, v)` |
| `0xAE/0xB0` perspective divide | `project()` |
| `$4000` = 1.0 fixed point | we use floats — **but vertex data ported from the ROM is fixed-point and must be divided by `$4000` (16384) on import** |

The last row is the practical gotcha for porting any ROM data (vertices in
`Object_3D_Data.asm`, and any TIE position/velocity constants): the cabinet's
`$4000` = 1.0, so a stored coordinate is `value / 16384` in our units, then scaled
to whatever world size we pick.

---

## 9. Sources & provenance

- Frank Palazzolo, *Star Wars / ESB Matrix Processor Microcode Disassembler*
  (`mathdis`, v0.8) — the microprogram equations in §6.
- Jed Margolin, *Unit Vector Math* notes — the hardware/register authority.
- `reference/disasm/StarWars_annotated.lst` — the 6809-side driver code (how the
  CPU loads/triggers/reads the Math Box). Gitignored; do not commit (it is a
  derivative of Atari's copyrighted ROM — see `reference/README.md`).

This file is **our own description** and is safe to commit; it redistributes none
of the disassembly.
