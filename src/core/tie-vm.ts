// src/core/tie-vm.ts
//
// Story sw7-11 — R9a TIE choreography VM engine (audit finding A-009).
//
// A faithful port of the cabinet's per-fighter "choreography" bytecode VM
// (WSCPU.MAC:822–927 "CPU ALIEN CONTROL AND CHOREOGRAPHY"). Each TIE runs a tiny
// interpreter over 3-byte instruction records: a program counter (A$CHPC) walks
// a flat program, an 8-slot jump table (TCHOP, WSCPU.MAC:862–868) dispatches on
// the low 3 opcode bits, a one-deep call stack (A$CHRT) serves GOSUB/RETURN, and
// `.CT time,twist,move` (TWIRL) maneuvers run on a per-game-frame countdown.
//
// This module is PURE src/core: it reads the fighter's live status word and
// returns the next VM state. It queues no audio, touches no DOM, and holds no
// time other than integer game frames (advanced once per game frame by the
// caller, at the 20.508 Hz sw7-1 timebase). Wiring it into stepGame's per-frame
// enemy update, selecting scripts per wave (TSPWAV, sw7-12) and Darth (sw7-13)
// are out of scope — here the VM engine + its script data land as A-009.
//
// The .CT time byte, twist bits and move bits are HEX in the source (.RADIX 16,
// WSCOMN.MAC:5); the script DSL below keeps the ROM's hex so it reads like the
// assembler and is auditable against WSCPU.MAC line-by-line.

/**
 * The 8-slot TCHOP jump table, indexed by the low 3 opcode bits (WSCPU.MAC:862–868).
 * Authored `.CIF`/`.CGOTO`/`.CGOSUB`/`.CRETURN`/`.CT` bytes decode to 0..4; the
 * internal TWIRL-execute phase is slot 5; slots 6,7 are the CHERR/SWI traps.
 */
export enum ChoreoOp {
  IF = 0, // .CIF  — take next record iff (mask & status); else scan to next .CIF
  GOTO = 1, // .CGOTO — pc = target
  GOSUB = 2, // .CGOSUB — save return pc (one-deep), pc = target
  RETURN = 3, // .CRETURN — pc = saved return
  TWIRL = 4, // .CT — set a duration+twist+move maneuver
}

/** Status-word event bits (A$CHST, WSCPU.MAC:27–38). C$R1/C$R2 are seeded from the PRNG by the caller each frame. */
export const Status = {
  C_AH: 0x01, // nearby alien hit
  C_AD: 0x02, // nearby alien died
  C_AS: 0x04, // alien has the player in its sights
  C_AV: 0x08, // player in front view
  C_R1: 0x10, // random bit 1
  C_R2: 0x20, // random bit 2
  C_AG: 0x40, // alien has fired a gun
  C_PN: 0x400, // player is near
  C_PS: 0x800, // player has the alien in sights
  C_PV: 0x1000, // player has the alien in view
  C_PM: 0x2000, // player middlin-near
} as const

/** Twist (rotation) bits of a maneuver (A$CHTW, WSCPU.MAC:548–573). */
export const Twist = {
  ROLL_L: 0x01, // C$RL
  ROLL_R: 0x02, // C$RR
  PITCH_U: 0x04, // C$PU
  PITCH_D: 0x08, // C$PD
  YAW_R: 0x10, // C$YR
  YAW_L: 0x20, // C$YL
  AIM_AHEAD: 0x40, // C$T9 — aim in front of the player
  AIM_PLAYER: 0x80, // C$T0 — aim at the player (active homing)
} as const

/** Move (translation) bits of a maneuver (A$CHMV, WSCPU.MAC:766–789). */
export const Move = {
  DOWN: 0x01, // C$MD
  DOWN2: 0x02, // C$MD2
  UP: 0x04, // C$MU
  UP2: 0x08, // C$MU2
  FWD: 0x10, // C$MF
  FWD2: 0x20, // C$MF2
} as const

/** One decoded choreography instruction. `until` is the `.CUNTIL` control record (byte 0). */
export type ChoreoInstr =
  | { op: ChoreoOp.IF; mask: number }
  | { op: ChoreoOp.GOTO; target: number }
  | { op: ChoreoOp.GOSUB; target: number }
  | { op: ChoreoOp.RETURN }
  | { op: ChoreoOp.TWIRL; frames: number; twist: number; move: number }
  | { op: 'until'; mask: number }

/** Per-fighter VM state — mirrors the ROM alien-record fields (WSCPU.MAC:16–23). */
export interface ChoreoVm {
  pc: number // A$CHPC — program counter (index into the program)
  savedPc: number // A$CHRT — one-deep return address (-1 = empty)
  waitFrames: number // A$CHTM — game frames left on the current maneuver
  twist: number // A$CHTW — active twist bits
  move: number // A$CHMV — active move bits
  untilMask: number // A$CHCN — armed .CUNTIL event gate (0 = none)
}

/** Fresh VM state parked at `pc` (default the start of the program). */
export function initVm(pc = 0): ChoreoVm {
  return { pc, savedPc: -1, waitFrames: 0, twist: 0, move: 0, untilMask: 0 }
}

/**
 * Decode the opcode of an instruction byte — the ROM's `ANDA #7` mask into TCHOP
 * (WSCPU.MAC:841–845). So `.CIF` (0x80) → IF and `.CT` (0x84..) → TWIRL. Slots
 * 5,6,7 are the internal execute phase and the CHERR/SWI traps — never authored.
 */
export function opcodeOf(byte: number): ChoreoOp {
  const op = byte & 7
  if (op > ChoreoOp.TWIRL) {
    throw new Error(`tie-vm: unassigned TCHOP opcode ${op} (byte 0x${byte.toString(16)}) — CHERR/SWI`)
  }
  return op as ChoreoOp
}

const MAX_STEPS = 4096

/**
 * Advance one fighter's VM by a single game frame given its live status word.
 * Pure: returns a fresh state and never mutates its inputs.
 *
 * Control ops (IF/GOTO/GOSUB/RETURN/.CUNTIL-decode) resolve within the frame —
 * every ROM control handler `JMP CHNXT`s (WSCPU.MAC:891,897,905,910,852) — while
 * a TWIRL maneuver (or an in-flight countdown) consumes the frame (CHTW.D/E `RTS`,
 * WSCPU.MAC:922,927). An armed `.CUNTIL` gate is polled every frame and, the
 * instant its event fires, interrupts the maneuver and skips forward to the next
 * control record (CHCN.E, WSCPU.MAC:836–860).
 */
export function tickChoreo(vm: Readonly<ChoreoVm>, prog: readonly ChoreoInstr[], status: number): ChoreoVm {
  let pc = vm.pc
  let savedPc = vm.savedPc
  let waitFrames = vm.waitFrames
  let twist = vm.twist
  let move = vm.move
  let untilMask = vm.untilMask

  if (untilMask !== 0 && (status & untilMask) !== 0) {
    // Armed gate fired — abandon the current maneuver and skip forward to the
    // next control record, which re-arms with its mask (CHCN.E, WSCPU.MAC:854–860).
    untilMask = 0
    waitFrames = 0
    pc = pc + 1
    while (prog[pc] && prog[pc].op !== 'until') pc = pc + 1
  } else if (waitFrames > 0) {
    // Maneuver still running: DEC the frame timer and hold (CHTW.E, WSCPU.MAC:925).
    return { pc, savedPc, waitFrames: waitFrames - 1, twist, move, untilMask }
  }

  for (let steps = 0; steps < MAX_STEPS; steps++) {
    const instr = prog[pc]
    if (!instr) throw new Error(`tie-vm: program counter ${pc} out of range`)

    switch (instr.op) {
      case ChoreoOp.TWIRL:
        // Decode the maneuver, advance the PC, and hold this frame (CHTW.D, WSCPU.MAC:911–922).
        return { pc: pc + 1, savedPc, waitFrames: instr.frames, twist: instr.twist, move: instr.move, untilMask }
      case ChoreoOp.GOTO:
        pc = instr.target
        break
      case ChoreoOp.GOSUB:
        savedPc = pc + 1 // return to the record after the GOSUB (WSCPU.MAC:900–902)
        pc = instr.target
        break
      case ChoreoOp.RETURN:
        pc = savedPc
        break
      case ChoreoOp.IF: {
        // mask 0 = default-always-true; take the next record when (mask & status);
        // else scan forward to the next .CIF and re-test (CHIF.D, WSCPU.MAC:872–891).
        let u = pc
        let resolved = false
        for (let scan = 0; scan < MAX_STEPS; scan++) {
          const g = prog[u]
          if (!g || g.op !== ChoreoOp.IF) throw new Error('tie-vm: IF scan fell off the choreography')
          if (g.mask === 0 || (g.mask & status) !== 0) {
            pc = u + 1
            resolved = true
            break
          }
          u = u + 1
          while (prog[u] && prog[u].op !== ChoreoOp.IF) u = u + 1
        }
        if (!resolved) throw new Error('tie-vm: IF scan made no progress')
        break
      }
      case 'until':
        // Arm the event gate; mask 0 = no gate (CHCN.D, WSCPU.MAC:847–849).
        untilMask = instr.mask
        pc = pc + 1
        break
      default: {
        const _exhaustive: never = instr
        throw new Error(`tie-vm: unknown choreography opcode ${JSON.stringify(_exhaustive)}`)
      }
    }
  }
  throw new Error('tie-vm: choreography made no progress (runaway control loop)')
}

// ---------------------------------------------------------------------------
// Script tables (WSCPU.MAC:1325–1656), ported as a single flat program with
// entry-offset tables — the ROM is one address space with cross-script jumps
// (`.CGOTO TCH1AZ`) and fall-throughs (TCH2xN falls into TCH1xN; TCH1C1 falls
// into TCH2C2). Scripts are laid out in SOURCE ORDER so those fall-throughs hold.
//
// `.CT time` decodes to a game-frame count via the ROM macro (WSCPU.MAC:961–967):
//   frames = (4 + (t&0x70)*2 + (t&0x03)*8) >> 1,  t clamped to <= 0x73.
// e.g. .CT 01→6, .CT 02→10, .CT 10→18, .CT 20→34, .CT 40→66, .CT 80→126.
// ---------------------------------------------------------------------------

/** Decode a `.CT` quarter-second byte to its game-frame countdown (WSCPU.MAC:961–967). */
export function ctFrames(time: number): number {
  const t = time > 0x73 ? 0x73 : time
  const packed = ((t & 0x70) * 2) + ((t & 0x03) * 8)
  return (4 + packed) >> 1
}

// ROM symbol aliases so the script bodies below read like the assembler.
const { ROLL_L: RL, ROLL_R: RR, PITCH_U: PU, PITCH_D: PD, YAW_R: YR, YAW_L: YL, AIM_AHEAD: T9, AIM_PLAYER: T0 } = Twist
const { DOWN: MD, DOWN2: MD2, UP: MU, UP2: MU2, FWD: MF, FWD2: MF2 } = Move
const MF3 = MF | MF2
const MU3 = MU | MU2
const MD3 = MD | MD2
const { C_AH, C_AS, C_AG, C_PN, C_PS, C_R1, C_R2 } = Status

// A source line is a real instruction, a jump to a symbolic label, or a label marker.
type Line =
  | { kind: 'instr'; instr: ChoreoInstr }
  | { kind: 'goto'; ref: string }
  | { kind: 'gosub'; ref: string }
  | { kind: 'label'; name: string }

const CT = (time: number, twist: number, move: number): Line => ({ kind: 'instr', instr: { op: ChoreoOp.TWIRL, frames: ctFrames(time), twist, move } })
const CIF = (mask: number): Line => ({ kind: 'instr', instr: { op: ChoreoOp.IF, mask } })
const CUNTIL = (mask: number): Line => ({ kind: 'instr', instr: { op: 'until', mask } })
const CRETURN = (): Line => ({ kind: 'instr', instr: { op: ChoreoOp.RETURN } })
const CGOTO = (ref: string): Line => ({ kind: 'goto', ref })
const CGOSUB = (ref: string): Line => ({ kind: 'gosub', ref })
const L = (name: string): Line => ({ kind: 'label', name })

// The choreography source, in ROM order. Unreachable tails after an unconditional
// `.CGOTO` (assembled but dead) and commented-out source lines are omitted.
const SOURCE: Line[] = [
  // --- A group (WSCPU.MAC:1328–1390) ---
  L('TCH2A1'), CGOSUB('SPLIT'),
  L('TCH1A1'),
  CT(0x40, 0, MF), CT(0x40, 0, MF2), CT(0x20, PU, MF),
  CUNTIL(C_AS), CT(0x20, T0, 0), CUNTIL(C_PN),
  CT(0x40, RL | T0, MF), CUNTIL(C_AS), CT(0x20, T0, 0), CUNTIL(0), CGOTO('TCH1AZ'),
  L('TCH2A2'), CGOSUB('SPLIT'),
  L('TCH1A2'),
  CT(0x40, RR, MF2), CT(0x20, YR, MF), CUNTIL(C_AS), CT(0x20, YR | T0, MF), CUNTIL(0),
  CT(0x40, RR, MF), CUNTIL(C_AS), CT(0x20, YR | T0, MF), CUNTIL(0),
  CT(0x20, RR, MF2), CUNTIL(C_AS), CT(0x20, YR | T0, MF), CUNTIL(0), CGOTO('TCH1AZ'),
  L('TCH2A3'), CGOSUB('SPLIT'),
  L('TCH1A3'),
  CT(0x40, RL, MF2), CT(0x20, YL, MF), CUNTIL(C_AS), CT(0x20, YL | T0, MF), CUNTIL(0),
  CT(0x40, RL, MF), CUNTIL(C_AS), CT(0x20, YL | T0, MF), CUNTIL(0),
  CT(0x20, RL, MF2), CUNTIL(C_AS), CT(0x20, YL | T0, MF), CUNTIL(0), CGOTO('TCH1AZ'),
  L('TCH1AZ'), // "BE MEAN TO PLAYER" loiter loop (label == 10$)
  CUNTIL(C_AS | C_AG), CT(0x20, RR | T0, MF2), CUNTIL(C_AG), CT(0x20, RL, MF2), CGOTO('TCH1AZ'),

  // --- B group (WSCPU.MAC:1392–1471) ---
  L('TCH2B1'), CGOSUB('SPLIT'),
  L('TCH1B1'),
  CT(0x20, 0, MF | MU), CT(0x20, 0, MF | MD), CT(0x20, 0, MF | MU), CT(0x20, 0, MF | MD),
  CT(0x20, PU, MF), CUNTIL(C_AS), CT(0x20, T0, 0), CUNTIL(0),
  CT(0x20, 0, MF | MU), CT(0x20, 0, MF | MD),
  CT(0x40, T0, MF | MU), CT(0x20, 0, MF | MU), CT(0x20, 0, MF | MD),
  CUNTIL(C_AS), CT(0x20, T0, MU), CUNTIL(0), CGOTO('TCH1BZ'),
  L('TCH2B2'), CGOSUB('SPLIT'),
  L('TCH1B2'),
  CT(0x10, 0, MF | MU2), CT(0x10, 0, MF | MD2), CT(0x10, 0, MF2 | MU2), CT(0x10, 0, MF2 | MD2),
  CUNTIL(C_AS), CT(0x20, T0, MF | MD), CUNTIL(0),
  CUNTIL(C_AS), CT(0x20, T0, MF | MU), CUNTIL(0), CGOTO('TCH1BZ'),
  L('TCH2B3'), CGOSUB('SPLIT'),
  L('TCH1B3'),
  CT(0x10, 0, MF | MU2), CT(0x10, 0, MF | MD2), CT(0x10, 0, MF2 | MU2), CT(0x10, 0, MF2 | MD2),
  CUNTIL(C_AS), CT(0x20, T0, MF | MD), CUNTIL(0), CGOTO('TCH1BZ'),
  L('TCH1BZ'), // loiter loop
  CUNTIL(C_AS | C_AG), CT(0x20, RR | T0, MF2), CUNTIL(C_AG), CT(0x20, RR, MF2), CGOTO('TCH1BZ'),

  // --- C group (WSCPU.MAC:1473–1529). TCH1C1 has no terminal .CGOTO — it falls
  // through into TCH2C2 (the CGOSUB SPLIT), preserved by source-order layout. ---
  L('TCH2C1'), CGOSUB('SPLIT'),
  L('TCH1C1'),
  CT(0x10, 0, MF | MU), CT(0x10, 0, MF | MD), CT(0x10, 0, MF | MU), CT(0x10, 0, MF | MD),
  CT(0x20, PU, MF), CUNTIL(C_AS), CT(0x20, T0, 0), CUNTIL(0),
  CUNTIL(C_AS), CT(0x20, T0, MU), CUNTIL(0),
  L('TCH2C2'), CGOSUB('SPLIT'),
  L('TCH1C2'),
  CT(0x20, RR | T0, MF | MU), CT(0x20, RR | T0, MF2 | MU), CT(0x20, YR, MF | MU),
  CUNTIL(C_AS), CT(0x20, YR | T0, MF | MU), CUNTIL(0), CGOTO('TCH1CZ'),
  L('TCH2C3'), CGOSUB('SPLIT'),
  L('TCH1C3'),
  CT(0x20, RL | T0, MF | MU), CT(0x20, RL | T0, MF2 | MU), CT(0x20, YL, MF | MU),
  CUNTIL(C_AS), CT(0x20, YL | T0, MF | MU), CUNTIL(0), CGOTO('TCH1CZ'),
  L('TCH1CZ'), // loiter loop
  CUNTIL(C_AS | C_AG), CT(0x20, RR | T0, MF2 | MU), CUNTIL(C_AG), CT(0x20, RL, MF2), CGOTO('TCH1CZ'),

  // --- D group (WSCPU.MAC:1531–1656) ---
  L('TCH2D1'), CGOSUB('SPLIT'),
  L('TCH1D1'),
  CUNTIL(C_PN), CT(0x80, RR | T0, MF | MU2), CUNTIL(0),
  CT(0x80, RR | T0, MU2), CT(0x80, RR | T0, MU2), CT(0x80, RR | T0, MU2), CT(0x80, RR | T0, MU2),
  CUNTIL(C_AS), CT(0x20, RL | T0, MU2), CUNTIL(0), CGOTO('TCH1DZ'),
  L('TCH2D2'), CGOSUB('SPLIT'),
  L('TCH1D2'),
  CUNTIL(C_PN), CT(0x80, RR | T0, MF | MU2), CUNTIL(0),
  CT(0x40, RL | T0, MU2), CIF(C_R1), CT(0x20, RR | T0, MU2), CIF(0),
  CT(0x40, RL | T0, MU2), CIF(C_R1), CT(0x20, RL | T0, MU2), CIF(0),
  CT(0x40, RL | T0, MU2), CUNTIL(C_AS), CT(0x20, RR | T0, MU2), CUNTIL(0), CGOTO('TCH1DZ'),
  L('TCH2D3'), CGOSUB('SPLIT'),
  L('TCH1D3'),
  CUNTIL(C_PN),
  CT(0x02, T0, MF | MU2), CT(0x02, T0, MF | MD2), CT(0x02, T0, MF | MU2), CT(0x02, T0, MF | MD2),
  CT(0x02, T0, MF | MU2), CT(0x02, T0, MF | MD2), CT(0x02, T0, MF | MU2), CT(0x02, T0, MF | MD2),
  CUNTIL(0),
  CUNTIL(C_AH),
  CT(0x20, T0 | YL | YR, MU2), CT(0x20, T0 | PU | PD, MU2), CT(0x20, T0 | YL | YR, MD2), CT(0x20, T0 | PU | PD, MD2),
  CT(0x20, T0 | YL | YR, MU2), CT(0x20, T0 | PU | PD, MU2), CT(0x20, T0 | YL | YR, MD2), CT(0x20, T0 | PU | PD, MD2),
  CUNTIL(C_AS), CT(0x20, RL | T0, MF), CUNTIL(0), CGOTO('TCH1DZ'),

  // --- SPLIT: the random partner-separation subroutine (WSCPU.MAC:1605–1626) ---
  L('SPLIT'),
  CT(0x01, T0, MF), // let the PRNG settle
  CIF(C_R1), CGOTO('SPLIT_20'),
  CIF(C_R2), CT(0x20, T0, MF3 | MU3), CGOTO('SPLIT_40'),
  CIF(0), CT(0x20, T0, MF3 | MD3), CGOTO('SPLIT_40'),
  L('SPLIT_20'),
  CIF(C_R2), CT(0x20, T0 | RR, MF3 | MU3), CGOTO('SPLIT_40'),
  CIF(0), CT(0x20, T0 | RR, MF3 | MD3), CGOTO('SPLIT_40'),
  L('SPLIT_40'),
  CIF(C_R2), CT(0x20, T9 | RL, MF2), CIF(0), CRETURN(),

  // --- TCH1DZ loiter loop (WSCPU.MAC:1628–1656). label == 10$; 20$ == TCH1DZ_20 ---
  L('TCH1DZ'),
  CT(0x10, 0, MU2), CUNTIL(C_PN), CT(0x40, RL | T0, MF2), CUNTIL(C_AS | C_AG), CT(0x20, RR | T0, MF2), CUNTIL(C_AG), CT(0x20, RL, MF), CUNTIL(0),
  CUNTIL(C_PN | C_PS), CT(0x40, RL | T0, MF2), CUNTIL(C_AS | C_AG | C_PS), CT(0x20, RR | T0, MF2), CUNTIL(C_AG | C_PS), CT(0x20, RL, MF), CUNTIL(0),
  CIF(C_PS), CGOTO('TCH1DZ_20'), CIF(0), CGOTO('TCH1DZ'),
  L('TCH1DZ_20'),
  CIF(C_R1), CT(0x20, RR, MU2), CGOTO('TCH1DZ'), CIF(0), CT(0x20, RL, MF2), CGOTO('TCH1DZ'),
]

/** Resolve the symbolic source into a flat program plus a label→index map. */
function assemble(source: readonly Line[]): { program: ChoreoInstr[]; labels: Record<string, number> } {
  const labels: Record<string, number> = {}
  let index = 0
  for (const line of source) {
    if (line.kind === 'label') labels[line.name] = index
    else index += 1
  }
  const program: ChoreoInstr[] = []
  for (const line of source) {
    switch (line.kind) {
      case 'instr':
        program.push(line.instr)
        break
      case 'goto':
        program.push({ op: ChoreoOp.GOTO, target: labels[line.ref] })
        break
      case 'gosub':
        program.push({ op: ChoreoOp.GOSUB, target: labels[line.ref] })
        break
      case 'label':
        break
    }
  }
  return { program, labels }
}

const assembled = assemble(SOURCE)

/** The flat choreography program (all scripts + SPLIT). GOTO/GOSUB targets are indices into this array. */
export const program: readonly ChoreoInstr[] = assembled.program

/** Entry offsets of the 16 TCH1 scripts (A1,A2,A3,AZ, B1..BZ, C1..CZ, D1..DZ). */
export const TCH1: readonly number[] = [
  assembled.labels.TCH1A1, assembled.labels.TCH1A2, assembled.labels.TCH1A3, assembled.labels.TCH1AZ,
  assembled.labels.TCH1B1, assembled.labels.TCH1B2, assembled.labels.TCH1B3, assembled.labels.TCH1BZ,
  assembled.labels.TCH1C1, assembled.labels.TCH1C2, assembled.labels.TCH1C3, assembled.labels.TCH1CZ,
  assembled.labels.TCH1D1, assembled.labels.TCH1D2, assembled.labels.TCH1D3, assembled.labels.TCH1DZ,
]

/** Entry offsets of the 12 TCH2 split entries — each GOSUBs SPLIT then falls into its TCH1 body. */
export const TCH2: readonly number[] = [
  assembled.labels.TCH2A1, assembled.labels.TCH2A2, assembled.labels.TCH2A3,
  assembled.labels.TCH2B1, assembled.labels.TCH2B2, assembled.labels.TCH2B3,
  assembled.labels.TCH2C1, assembled.labels.TCH2C2, assembled.labels.TCH2C3,
  assembled.labels.TCH2D1, assembled.labels.TCH2D2, assembled.labels.TCH2D3,
]

/** Entry offset of the SPLIT random-separation subroutine. */
export const SPLIT: number = assembled.labels.SPLIT
