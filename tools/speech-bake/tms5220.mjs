// tms5220.mjs — a small, self-contained TMS5220 LPC speech synthesizer for the
// headless speech bake (story 8-7, Wave 5).
//
// This is an INDEPENDENT implementation of the documented TMS5220 algorithm —
// the 10-stage LPC lattice from TI patent 4,209,804 (Markel & Gray "Linear
// Prediction of Speech"), the frame/bitstream format from the TMS5220 datasheet,
// and the chip's published coefficient ROM. It is NOT a port of any GPL emulator;
// only the numeric coefficient tables are reproduced (chip data, identical across
// the TI patents, the datasheet, and independent decaps — the chirp table's
// sum = 0x3DA matches the documented TMS5220NL/CNL decap).
//
// Input: the raw LPC FIFO byte stream the cabinet clocks into the chip after a
// $60 SPEAK-EXTERNAL command (see tools/speech-bake/speech-data.mjs, transcribed
// from the Speech*.asm disassembly). Output: 8 kHz signed PCM samples.
//
// The frame parser reads bits LSB-first within each byte (as the TMS5220 FIFO
// does), assembling each field MSB-first.

// ── TMS5220 coefficient ROM ───────────────────────────────────────────────────
const ENERGY = [0, 1, 2, 3, 4, 6, 8, 11, 16, 23, 33, 47, 63, 85, 114, 0];

const PITCH = [
  0, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 44, 46, 48,
  50, 52, 53, 56, 58, 60, 62, 65, 68, 70, 72, 76, 78, 80, 84, 86,
  91, 94, 98, 101, 105, 109, 114, 118, 122, 127, 132, 137, 142, 148, 153, 159,
];

// K1..K10 reflection-coefficient tables (K1,K2 = 5-bit/32 entries; K3..K7 = 4-bit/16; K8..K10 = 3-bit/8).
const K = [
  [-501, -498, -497, -495, -493, -491, -488, -482, -478, -474, -469, -464, -459, -452, -445, -437,
   -412, -380, -339, -288, -227, -158, -81, -1, 80, 157, 226, 287, 337, 379, 411, 436],
  [-328, -303, -274, -244, -211, -175, -138, -99, -59, -18, 24, 64, 105, 143, 180, 215,
   248, 278, 306, 331, 354, 374, 392, 408, 422, 435, 445, 455, 463, 470, 476, 506],
  [-441, -387, -333, -279, -225, -171, -117, -63, -9, 45, 98, 152, 206, 260, 314, 368],
  [-328, -273, -217, -161, -106, -50, 5, 61, 116, 172, 228, 283, 339, 394, 450, 506],
  [-328, -282, -235, -189, -142, -96, -50, -3, 43, 90, 136, 182, 229, 275, 322, 368],
  [-256, -212, -168, -123, -79, -35, 10, 54, 98, 143, 187, 232, 276, 320, 365, 409],
  [-308, -260, -212, -164, -117, -69, -21, 27, 75, 122, 170, 218, 266, 314, 361, 409],
  [-256, -161, -66, 29, 124, 219, 314, 409],
  [-256, -176, -96, -15, 65, 146, 226, 307],
  [-205, -132, -59, 14, 87, 160, 234, 307],
];

const KBITS = [5, 5, 4, 4, 4, 4, 4, 3, 3, 3];

// Voiced excitation "chirp" (glottal pulse), one period of the impulse response.
// TMS5220 "later" chirp (sum = 0x3DA); index past 51 is clamped to entry 51.
const CHIRP = [
  0x00, 0x03, 0x0f, 0x28, 0x4c, 0x6c, 0x71, 0x50, 0x25, 0x26, 0x4c, 0x44, 0x1a, 0x32, 0x3b, 0x13,
  0x37, 0x1a, 0x25, 0x1f, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
].map((b) => (b << 24) >> 24); // interpret as signed int8

// Interpolation right-shift per 1/8-frame period. The chip approaches the new
// frame's target over 8 periods then snaps to it (shift 0) on the last.
const INTERP = [3, 3, 3, 2, 2, 1, 1, 0];

const SAMPLE_RATE = 8000;     // TMS5220 nominal output rate
const SAMPLES_PER_FRAME = 200; // 25 ms; 8 interpolation periods of 25 samples
const PERIOD = SAMPLES_PER_FRAME / INTERP.length;

// Multiply a reflection coeff (clamped 10-bit signed) by a running value
// (clamped 14-bit signed) and shift down 9, per the chip's lattice arithmetic.
function mm(a, b) {
  if (a > 511) a -= 1024; else if (a < -512) a += 1024;
  if (b > 16383) b -= 32768; else if (b < -16384) b += 32768;
  return (a * b) >> 9;
}

// Synthesize one phrase's LPC byte stream → Int16Array of 8 kHz samples.
// gain scales the 14-bit lattice output into 16-bit range (≈2.0 = unity).
export function synthesize(lpc, { gain = 2.0 } = {}) {
  // ── LSB-first bit reader over the FIFO bytes ────────────────────────────────
  let bytePos = 0, bitsTaken = 0;
  const readBits = (count) => {
    let val = 0;
    while (count-- > 0) {
      const bit = bytePos < lpc.length ? (lpc[bytePos] >> bitsTaken) & 1 : 0;
      val = (val << 1) | bit;
      if (++bitsTaken >= 8) { bitsTaken = 0; bytePos++; }
    }
    return val;
  };
  const ranOut = () => bytePos >= lpc.length;

  // ── synthesis state ─────────────────────────────────────────────────────────
  let curE = 0, curP = 0;
  const curK = new Array(10).fill(0);
  const xb = new Array(10).fill(0); // lattice backward errors
  let prevEnergy = 0;
  let rng = 0x1fff;
  let pitchCount = 0;
  const out = [];
  const frames = []; // diagnostics

  const lattice = (exc) => {
    const u = new Array(11);
    u[10] = mm(prevEnergy, exc << 6);
    for (let i = 9; i >= 0; i--) u[i] = u[i + 1] - mm(curK[i], xb[i]);
    for (let i = 9; i >= 1; i--) xb[i] = xb[i - 1] + mm(curK[i - 1], u[i - 1]);
    xb[0] = u[0];
    prevEnergy = curE;
    let s = u[0];
    while (s > 16383) s -= 32768;   // wrap to 14 bits like the chip
    while (s < -16384) s += 32768;
    return s;
  };

  const renderFrame = (targE, targP, targK, unvoiced) => {
    for (let p = 0; p < INTERP.length; p++) {
      const sh = INTERP[p];
      if (sh === 0) {
        curE = targE; curP = targP;
        for (let i = 0; i < 10; i++) curK[i] = targK[i];
      } else {
        curE += (targE - curE) >> sh;
        curP += (targP - curP) >> sh;
        for (let i = 0; i < 10; i++) curK[i] += (targK[i] - curK[i]) >> sh;
      }
      for (let s = 0; s < PERIOD; s++) {
        let exc;
        if (unvoiced) {
          exc = (rng & 1) ? -64 : 64;
        } else {
          exc = CHIRP[pitchCount < 51 ? pitchCount : 51];
        }
        // 13-bit LFSR, advanced once per sample (x12 ^ x3 ^ x2 ^ x0)
        const bitout = ((rng >> 12) ^ (rng >> 3) ^ (rng >> 2) ^ rng) & 1;
        rng = ((rng << 1) | bitout) & 0x1fff;

        out.push(lattice(exc) * gain);

        pitchCount++;
        if (curP === 0 || pitchCount >= curP) pitchCount = 0;
      }
    }
  };

  // ── frame loop ──────────────────────────────────────────────────────────────
  let stopped = false;
  for (let guard = 0; guard < 4096; guard++) {
    if (ranOut()) break;
    const eIdx = readBits(4);
    if (eIdx === 15) { stopped = true; break; }          // stop frame
    if (eIdx === 0) {                                     // silent frame
      frames.push({ e: 0, silent: true });
      renderFrame(0, curP, curK.slice(), curP === 0);
      continue;
    }
    const rep = readBits(1);
    const pIdx = readBits(6);
    const unvoiced = pIdx === 0;
    let kIdx;
    if (rep) {
      kIdx = curK.map((v) => v); // reuse — handled below via targets
    }
    const targK = new Array(10);
    if (rep) {
      for (let i = 0; i < 10; i++) targK[i] = curK[i]; // repeat: keep coefficients
    } else {
      for (let i = 0; i < 4; i++) targK[i] = K[i][readBits(KBITS[i])];
      if (!unvoiced) for (let i = 4; i < 10; i++) targK[i] = K[i][readBits(KBITS[i])];
      else for (let i = 4; i < 10; i++) targK[i] = 0;
    }
    frames.push({ e: eIdx, p: pIdx, rep: !!rep, unvoiced });
    renderFrame(ENERGY[eIdx], PITCH[pIdx], targK, unvoiced);
    if (ranOut()) break;
  }

  return {
    samples: Int16Array.from(out, (v) => (v > 32767 ? 32767 : v < -32768 ? -32768 : v | 0)),
    sampleRate: SAMPLE_RATE,
    frames,
    stopped,
    durationS: out.length / SAMPLE_RATE,
  };
}

export { SAMPLE_RATE };
export default synthesize;
