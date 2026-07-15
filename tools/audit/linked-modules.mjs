// The modules that actually shipped in the 1983 "Warp Speed" build. This is NOT
// just the linkers' object lists — it is those lists PLUS every module any of
// those objects pull in via `.INCLUDE` at assemble time (transitively). A module
// assembled in via `.INCLUDE` produces real bytes/symbols in the binary just as
// surely as one named on a link line — WSVROM.MAC:1235 `.INCLUDE WSVGAN` proves
// it: the alphanumeric glyph table WSVGAN is nowhere on any link line, yet its
// symbols (VGMSGA, UNDERL) live in the ROM.
//
// The authority is the LINK COMMAND FILES, not the directory listing:
//
// 1. Main CPU (6809) — root bank, WSROOT.LNK:
//      WSPROG,WSMAIN/CWSFIL0/CWSBASE,WSCPU/CWSFIL1/CWSGAS,WSGLOW,WSGRND,WSGUNS,
//      WSLAZR/CWSFIL2/CWSPANL,WSSITE,WSXPLD/CWSXMT,TCEROM,TCHSCR/CWSROOT,
//      WSMATH/CWSFIL3/CWSVROM,TCSPLS,WSCOIN/CTCMES/CWSSTUB,WSINT,TCTEST/CWSFIL4/CWSCKSM
//
// 2. Main CPU — overlay bank, WSOVLY.LNK / WSOVLX.LNK (LINKIT.COM runs the
//    three-pass dance: WSOVLX is the same overlay linked first for its symbol
//    table — that pass adds WSGLOB; WSOVLY is the final overlay image):
//      WSGLOB, WSOVLY, WSOBJ, WSFIL9, WSSTAR   (+ WSPROG, shared with the root bank)
//
// 3. Sound CPU (6809) — SNDAUX.LNK:
//      SNDGLB, SWVOC3, SWMUS, SNDAUD, SNDPM, SNDSPK, SNDAUX, SNFILL, SNDSUM
//      (+ SNDCMN, `.INCLUDE`d by each — it in turn includes HLL69F/MOP69)
//
// 4. Modules those objects `.INCLUDE`, therefore also shipped (verified by
//    grepping every module above for `.INCLUDE`):
//      WSCOMN  — line ~2 of every WS/TC main-CPU module (common equates; sets the radix)
//      HLL69F  — WSCOMN:113 (structured-assembly library; also via SNDCMN on the sound CPU)
//      MOP69   — WSCOMN:114 (macro library; also via SNDCMN)
//      WSVCTR  — WSROOT:32, WSOVLY:34 (vector-generator macros)
//      WSVGMC  — WSVROM:69 (VG macro set)
//      WSVGAN  — WSVROM:1235 (alphanumeric glyphs; RADIX 10)
//      DPCOIN  — WSCOIN:31, WSGLOB:312 (coin direct-page vars)
//      COIN69  — WSCOIN:114 (coin routine library)
//      SNDPBX  — WSXMT:53, SNDAUX:471 (main<->sound-board mailbox protocol)
//      TCODE2  — SWMP:23 (math-box microcode assembler macros)
//
// 5. Separate PROMs — not 6809 code linked by any of the above, but shipped
//    cabinet hardware truth all the same:
//      SWMP    — SWMP.MAC, the Math Box micro-program (its doc: SWMP.DOC)
//      AVGROM  — AVGROM.MAC, the AVG state PROM (a hardware state machine, not pictures)
//
// Rejected as never-shipped — the decoys that sit beside the real files and look
// perfectly plausible:
//   SWVOC2  — superseded vocabulary. SWVOC3 is the one on SNDAUX.LNK; SWVOC2 is the
//             prior take, right next to it in the tree. Cite SWVOC3.
//   VGAN    — superseded alphanumerics. WSVROM.MAC:1235 `.INCLUDE`s WSVGAN (WS-prefixed),
//             NOT the bare VGAN. Cite WSVGAN.
//   WSTEST, VGTST, MATEST, DIVTST, RAMTST, LED, SWSTST — standalone test/diagnostic
//             programs. Absent from WSROOT.LNK, WSOVLY.LNK, and SNDAUX.LNK, and nothing
//             linked or transitively included pulls them in.
//   XYSIG (and SWSIG) — signature-analysis tooling, never on a game link.
//
// Before adding anything to this list: it must be either on WSROOT.LNK,
// WSOVLY.LNK/WSOVLX.LNK, or SNDAUX.LNK, or `.INCLUDE`d — directly or
// transitively — by something that is (or a separately-burned PROM, items 5).
// Anything else, however plausibly named, never assembled into the cabinet.
export const LINKED_MODULES = [
  // main CPU root bank (WSROOT.LNK)
  'WSPROG', 'WSMAIN', 'WSFIL0', 'WSBASE', 'WSCPU', 'WSFIL1', 'WSGAS', 'WSGLOW',
  'WSGRND', 'WSGUNS', 'WSLAZR', 'WSFIL2', 'WSPANL', 'WSSITE', 'WSXPLD', 'WSXMT',
  'TCEROM', 'TCHSCR', 'WSROOT', 'WSMATH', 'WSFIL3', 'WSVROM', 'TCSPLS', 'WSCOIN',
  'TCMES', 'WSSTUB', 'WSINT', 'TCTEST', 'WSFIL4', 'WSCKSM',
  // main CPU overlay bank (WSOVLY.LNK / WSOVLX.LNK)
  'WSGLOB', 'WSOVLY', 'WSOBJ', 'WSFIL9', 'WSSTAR',
  // .INCLUDEd transitively by one of the above (see comment)
  'WSCOMN', 'HLL69F', 'MOP69', 'WSVCTR', 'WSVGMC', 'WSVGAN', 'DPCOIN', 'COIN69',
  'SNDPBX', 'TCODE2',
  // sound CPU (SNDAUX.LNK)
  'SNDGLB', 'SWVOC3', 'SWMUS', 'SNDAUD', 'SNDPM', 'SNDSPK', 'SNDAUX', 'SNFILL',
  'SNDSUM', 'SNDCMN',
  // separate PROMs (not 6809 code, still shipped hardware)
  'SWMP', 'AVGROM',
]
