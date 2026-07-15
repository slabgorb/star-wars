// tests/core/tie-vm.test.ts
//
// Story sw7-11 — R9a TIE choreography VM engine (audit finding A-009), RED phase.
//
// The cabinet flies each TIE with a per-fighter *bytecode choreography VM*
// (WSCPU.MAC:822–927): a program counter (A$CHPC) walks 3-byte instruction
// records, an 8-slot jump table (TCHOP, WSCPU.MAC:862–868) dispatches on the
// low 3 opcode bits (`ANDA #7`, "JMP @A(U)"), a one-deep call stack (A$CHRT)
// serves GOSUB/RETURN, and `.CT time,twist,move` (TWIRL) maneuvers run on a
// game-frame countdown. Our `moveEnemy` (sim.ts:1136) is a 2-state hand machine
// with none of this. This suite pins the VM ENGINE contract and is EXPECTED TO
// FAIL until GREEN creates `src/core/tie-vm.ts`.
//
// SCOPE (this story = the ENGINE + the script DATA it runs — A-009 only):
//   * Opcode dispatch (TCHOP), per-fighter PC, one-deep GOSUB/RETURN stack,
//     IF / GOTO / GOSUB / RETURN / TWIRL, the `.CUNTIL` / `.CIF` gates, and the
//     16 TCH1 + 12 TCH2 script tables loaded as data.
//   * OUT of scope: which script runs in which wave (TSPWAV composition = sw7-12),
//     Darth (sw7-13), and wiring the VM into stepGame's per-frame enemy update
//     (the GREEN integration / sw7-12). The A-015 ±2048-corner warning is sw7-12's.
//
// SPEC RECONCILIATION (TEA design decisions — logged as session deviations):
//   * FLAT-PROGRAM model. The ROM is one flat address space; scripts jump across
//     each other (`.CGOTO TCH1AZ`, WSCPU.MAC:1341) and TCH2 falls through into
//     TCH1 (WSCPU.MAC:1328–1330). So the faithful port is a single `program`
//     instruction array with GOTO/GOSUB targets as absolute indices, plus
//     entry-offset tables TCH1[16] / TCH2[12] / SPLIT. NOT per-script arrays.
//   * DECODED instructions. Scripts are exposed as typed `ChoreoInstr` objects
//     (the "exposed as data" AC), not raw bytes. The low-level `& 7` / error-trap
//     fidelity is pinned separately via `opcodeOf()`; the `.CT` timer decode
//     `(4 + (arg&0x70)*2 + (arg&0x03)*8) >> 1` (WSCPU.MAC:961–967, e.g. `.CT 01`→6,
//     `.CT 20`→34, `.CT 40`→66) is the Dev's to apply when porting the tables —
//     these tests pin the game-frame *relationship*, not the byte packing.
//   * ONE maneuver blocks per frame. Control ops (IF/GOTO/GOSUB/RETURN) resolve
//     within a frame; only a TWIRL maneuver (or an active countdown) consumes a
//     game frame — matching the ROM, where every control handler `JMP CHNXT`s but
//     CHTW.D/E `RTS` (WSCPU.MAC:893–927). So one `tickChoreo` from a control op
//     activates the next maneuver.
//   * `.CUNTIL` runtime is NOT fully pinned here. The ROM gate is an *interrupt-
//     style* forward-jump: while A$CHCN is set the VM keeps running following ops,
//     and the instant the event fires it skips forward to the next control record
//     (CHCN.E, WSCPU.MAC:836–860) — NOT a "hold current maneuver" wait. That
//     dispatch is intricate; RED pins only the CERTAIN part (a `.CUNTIL mask`
//     loads the event mask; mask 0 = no gate). GREEN implements CHCN.E per source;
//     Reviewer verifies. See the TEA assessment.
//
// Everything here obeys the sacred boundary: no DOM, no time except game frames,
// no randomness (the C$R1/C$R2 status bits are the CALLER's PRNG job in sim.ts;
// the VM only reads the status word it is handed).

import { describe, it, expect } from 'vitest'
import { TICK_HZ } from '../../src/core/state'
import {
  ChoreoOp,
  Status,
  Twist,
  Move,
  initVm,
  opcodeOf,
  tickChoreo,
  program,
  TCH1,
  TCH2,
  SPLIT,
  type ChoreoInstr,
  type ChoreoVm,
} from '../../src/core/tie-vm'

// --- tiny authoring helpers (targets are absolute indices into the passed program) ---
const twirl = (frames: number, twist: number, move: number): ChoreoInstr => ({ op: ChoreoOp.TWIRL, frames, twist, move })
const ifm = (mask: number): ChoreoInstr => ({ op: ChoreoOp.IF, mask })
const cgoto = (target: number): ChoreoInstr => ({ op: ChoreoOp.GOTO, target })
const cgosub = (target: number): ChoreoInstr => ({ op: ChoreoOp.GOSUB, target })
const cret = (): ChoreoInstr => ({ op: ChoreoOp.RETURN })
const cuntil = (mask: number): ChoreoInstr => ({ op: 'until', mask })

const run = (prog: readonly ChoreoInstr[], status: number, ticks: number, startPc = 0): ChoreoVm => {
  let vm = initVm(startPc)
  for (let i = 0; i < ticks; i++) vm = tickChoreo(vm, prog, status)
  return vm
}

describe('sw7-11 TIE choreography VM — TCHOP opcode dispatch (AC1)', () => {
  it('names the 8-slot TCHOP jump table in ROM order (WSCPU.MAC:862–868)', () => {
    // 0:IF 1:GOTO 2:GOSUB 3:RETURN 4:TWIRL — the exact TCHOP order.
    expect(ChoreoOp.IF).toBe(0)
    expect(ChoreoOp.GOTO).toBe(1)
    expect(ChoreoOp.GOSUB).toBe(2)
    expect(ChoreoOp.RETURN).toBe(3)
    expect(ChoreoOp.TWIRL).toBe(4)
  })

  it('dispatches on the low 3 opcode bits — `ANDA #7` (WSCPU.MAC:842)', () => {
    // .CIF is authored as byte 0x80 (WSCPU.MAC:940) yet dispatches to IF because
    // 0x80 & 7 == 0. .CT is byte 0x84.. yet dispatches to TWIRL (0x84 & 7 == 4).
    expect(opcodeOf(0x80)).toBe(ChoreoOp.IF)
    expect(opcodeOf(0x84)).toBe(ChoreoOp.TWIRL)
    expect(opcodeOf(0x01)).toBe(ChoreoOp.GOTO)
    expect(opcodeOf(0x02)).toBe(ChoreoOp.GOSUB)
    expect(opcodeOf(0x03)).toBe(ChoreoOp.RETURN)
  })

  it('traps the unassigned TCHOP slots 6 and 7 — CHERR / SWI (WSCPU.MAC:868–870)', () => {
    // Slots 6,7 are error traps; slot 5 is the internal TWIRL-execute phase and is
    // never an authored opcode. None may be silently ignored.
    expect(() => opcodeOf(6)).toThrow()
    expect(() => opcodeOf(7)).toThrow()
  })
})

describe('sw7-11 TIE choreography VM — program counter & control flow (AC1)', () => {
  it('GOTO sets the PC to its target, skipping the record between (WSCPU.MAC:893–897)', () => {
    // [0]=GOTO 2, [1]=fwd maneuver (must be skipped), [2]=up maneuver.
    const prog: ChoreoInstr[] = [cgoto(2), twirl(4, 0, Move.FWD), twirl(4, 0, Move.UP)]
    const vm = run(prog, 0, 1)
    expect(vm.move).toBe(Move.UP) // landed at [2], never ran [1]
    expect(vm.move & Move.FWD).toBe(0)
  })

  it('GOTO to index 0 is a real jump — 0 is a valid target, not "absent" (?? not ||)', () => {
    // Falsy-zero guard: a `?? default` / `|| default` bug would drop target 0.
    // [0]=up maneuver, [1]=GOTO 0 -> back-edge to [0] (the loiter self-loop shape).
    const prog: ChoreoInstr[] = [twirl(0, 0, Move.UP), cgoto(0)]
    const vm = run(prog, 0, 3) // run past [0], hit GOTO 0, land back on [0]
    expect(vm.move).toBe(Move.UP)
  })

  it('GOSUB saves the return address (record after the GOSUB) and jumps (WSCPU.MAC:899–905)', () => {
    // [0]=GOSUB 2, [1]=caller maneuver, [2]=sub maneuver.
    const prog: ChoreoInstr[] = [cgosub(2), twirl(4, 0, Move.FWD), twirl(4, 0, Move.UP)]
    const vm = run(prog, 0, 1)
    expect(vm.savedPc).toBe(1) // return address = index after the GOSUB
    expect(vm.move).toBe(Move.UP) // ran the subroutine body at [2]
  })

  it('RETURN resumes at the saved return address (WSCPU.MAC:907–910)', () => {
    // [0]=GOSUB 2, [1]=caller maneuver (FWD), [2]=sub (UP), [3]=RETURN.
    const prog: ChoreoInstr[] = [cgosub(2), twirl(4, 0, Move.FWD), twirl(0, 0, Move.UP), cret()]
    const after = run(prog, 0, 2) // t1: gosub -> run [2] (UP); t2: [2] expires -> RETURN -> [1] (FWD)
    expect(after.move).toBe(Move.FWD) // returned to the caller body at [1]
  })

  it('the call stack is ONE DEEP — a nested GOSUB clobbers the outer return (A$CHRT is a single slot)', () => {
    // [0]=GOSUB 2, [1]=outer-return maneuver, [2]=GOSUB 4, [3]=RETURN, [4]=inner maneuver.
    const prog: ChoreoInstr[] = [cgosub(2), twirl(4, 0, Move.FWD), cgosub(4), cret(), twirl(4, 0, Move.UP)]
    const vm = run(prog, 0, 1)
    // Outer GOSUB set savedPc=1; the nested GOSUB overwrote it with 3. A two-deep
    // stack would have preserved 1 — one-deep loses it.
    expect(vm.savedPc).toBe(3)
  })
})

describe('sw7-11 TIE choreography VM — IF / .CIF conditional (AC2)', () => {
  it('IF with mask 0 is the default-always-true branch (WSCPU.MAC:876)', () => {
    const prog: ChoreoInstr[] = [ifm(0), twirl(4, 0, Move.FWD)]
    const vm = run(prog, 0, 1)
    expect(vm.move).toBe(Move.FWD) // took the guarded instruction
  })

  it('IF takes the next instruction when (mask & status) is set (WSCPU.MAC:877–880)', () => {
    const prog: ChoreoInstr[] = [ifm(Status.C_AS), twirl(4, 0, Move.FWD), ifm(0), twirl(4, 0, Move.UP)]
    const vm = run(prog, Status.C_AS, 1) // player-in-sights bit set -> true
    expect(vm.move).toBe(Move.FWD) // ran the guarded body at [1]
  })

  it('IF FALSE skips forward to the next .CIF; a trailing .CIF 0 is the else/default (WSCPU.MAC:881–887)', () => {
    // [0]=IF C_AS, [1]=guarded (FWD, must be skipped), [2]=.CIF 0 (else), [3]=UP.
    const prog: ChoreoInstr[] = [ifm(Status.C_AS), twirl(4, 0, Move.FWD), ifm(0), twirl(4, 0, Move.UP)]
    const vm = run(prog, 0, 1) // C_AS NOT set -> false -> scan to next IF ([2], mask 0, true) -> [3]
    expect(vm.move).toBe(Move.UP)
    expect(vm.move & Move.FWD).toBe(0) // the guarded [1] was skipped
  })
})

describe('sw7-11 TIE choreography VM — TWIRL maneuver & game-frame timing (AC1, AC4)', () => {
  it('TWIRL sets the active twist/move and the frame countdown, then advances the PC (WSCPU.MAC:911–922)', () => {
    const prog: ChoreoInstr[] = [twirl(2, Twist.PITCH_U, Move.FWD), twirl(4, 0, Move.UP)]
    const vm = initVm(0)
    const v1 = tickChoreo(vm, prog, 0)
    expect(v1.waitFrames).toBe(2)
    expect(v1.twist).toBe(Twist.PITCH_U)
    expect(v1.move).toBe(Move.FWD)
  })

  it('a maneuver holds for its frame count, then hands off to the next op — DEC / BMI (WSCPU.MAC:924–927)', () => {
    // frames:2 -> the maneuver is the current one while the counter is >= 0, and the
    // VM fetches the next op only once the counter goes negative.
    const prog: ChoreoInstr[] = [twirl(2, 0, Move.FWD), twirl(4, 0, Move.UP)]
    const seq: number[] = []
    let vm = initVm(0)
    for (let i = 0; i < 4; i++) {
      vm = tickChoreo(vm, prog, 0)
      seq.push(vm.waitFrames)
    }
    // decode sets 2; execute decrements 2->1->0 (still the FWD maneuver), then the
    // 4th frame finds it done and activates [1] (UP).
    expect(seq.slice(0, 3)).toEqual([2, 1, 0])
    expect(run(prog, 0, 3).move).toBe(Move.FWD) // still the first maneuver at frame 3
    expect(run(prog, 0, 4).move).toBe(Move.UP) // advanced to the next maneuver
  })

  it('maneuver durations are integer GAME frames on the 20.508 Hz base, not the retired 30 Hz (AC4)', () => {
    // sw7-1 landed TICK_HZ = 246.094/12 ≈ 20.508. The VM ticks once per game frame,
    // so a `.CT` timer is a whole-frame count — never seconds and never /30.
    expect(TICK_HZ).toBeCloseTo(20.508, 2)
    expect(TICK_HZ).not.toBeCloseTo(30, 0)
    // SPLIT opens with `.CT 01,...` -> (4 + 0 + 8) >> 1 == 6 frames (WSCPU.MAC:1606, 961–967).
    const split = program[SPLIT]
    expect(split.op).toBe(ChoreoOp.TWIRL)
    if (split.op === ChoreoOp.TWIRL) expect(split.frames).toBe(6)
  })
})

describe('sw7-11 TIE choreography VM — .CUNTIL event mask load (AC2, partial)', () => {
  it('a `.CUNTIL mask` loads the event-gate mask (WSCPU.MAC:847–849)', () => {
    const prog: ChoreoInstr[] = [cuntil(Status.C_AS), twirl(4, 0, Move.FWD)]
    const vm = run(prog, 0, 1) // C_AS not yet set -> gate armed, following maneuver runs
    expect(vm.untilMask).toBe(Status.C_AS)
  })

  it('`.CUNTIL 0` arms NO gate — mask 0 is "no gate", distinct from a real event mask', () => {
    // Falsy-zero correctness at the gate: 0 must mean "no gate", not a bug.
    const prog: ChoreoInstr[] = [cuntil(0), twirl(4, 0, Move.FWD)]
    const vm = run(prog, 0, 1)
    expect(vm.untilMask).toBe(0)
    expect(vm.move).toBe(Move.FWD)
  })
})

describe('sw7-11 TIE choreography VM — robustness & purity (rules)', () => {
  it('dispatching an unknown opcode throws rather than silently continuing (exhaustive dispatch)', () => {
    // TS checklist #3: a switch on the opcode must assertNever, not fall through.
    const bogus = { op: 99 } as unknown as ChoreoInstr // deliberately invalid — proves the trap
    expect(() => tickChoreo(initVm(0), [bogus], 0)).toThrow()
  })

  it('tickChoreo is pure — it does not mutate its input VM and is deterministic', () => {
    const prog: ChoreoInstr[] = [twirl(2, Twist.ROLL_L, Move.FWD), cret()]
    const vm = initVm(0)
    const snapshot = JSON.parse(JSON.stringify(vm))
    const a = tickChoreo(vm, prog, 0)
    const b = tickChoreo(vm, prog, 0)
    expect(vm).toEqual(snapshot) // input untouched
    expect(a).not.toBe(vm) // fresh object
    expect(a).toEqual(b) // same inputs -> same output
  })
})

describe('sw7-11 TIE choreography VM — script tables loaded as data (AC3)', () => {
  it('exposes 16 TCH1 scripts and 12 TCH2 split entries (WSCPU.MAC:1328–1656)', () => {
    expect(TCH1).toHaveLength(16)
    expect(TCH2).toHaveLength(12)
  })

  it('every TCH2 entry begins by GOSUB-ing the SPLIT subroutine (WSCPU.MAC:1328–1329)', () => {
    for (const entry of TCH2) {
      const first = program[entry]
      expect(first.op).toBe(ChoreoOp.GOSUB)
      if (first.op === ChoreoOp.GOSUB) expect(first.target).toBe(SPLIT)
    }
  })

  it('SPLIT is the random-split subroutine: a settle maneuver that returns (WSCPU.MAC:1605–1626)', () => {
    // Opens with `.CT 01,C$T0,C$MF` — aim-at-player + forward — and ends in .CRETURN.
    const head = program[SPLIT]
    expect(head.op).toBe(ChoreoOp.TWIRL)
    if (head.op === ChoreoOp.TWIRL) {
      expect(head.twist & Twist.AIM_PLAYER).toBe(Twist.AIM_PLAYER)
      expect(head.move & Move.FWD).toBe(Move.FWD)
    }
    // the subroutine returns to its caller
    const tail = program.slice(SPLIT).findIndex((i) => i.op === ChoreoOp.RETURN)
    expect(tail).toBeGreaterThanOrEqual(0)
  })
})
