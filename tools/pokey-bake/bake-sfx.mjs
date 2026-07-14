#!/usr/bin/env node
// bake-sfx.mjs — render Star Wars POKEY sound effects to .wav, headless.
//
// Ported from tempest/tools/pokey-bake (story 8-7, Wave 5). Drives the vendored
// web-pokey core (vendor/pokey.js, MIT, by Mariusz Kryński) in a shimmed Node VM
// context — no browser, no Web Audio, no MAME. Each SFX in sfx-data.mjs is a
// timed sequence of POKEY register writes; we feed it to the emulator, pull one
// filtered sample at a time via POKEY.get(), and write a 16-bit mono WAV. Bake
// once, host the .wav on R2, play via the existing sampler (shell/audio.ts).
//
// Usage:
//   node tools/pokey-bake/bake-sfx.mjs [outDir] [--rate 48000|44100|56000] [--normalize]
//
// Defaults: outDir = tools/pokey-bake/out, rate = 48000, no normalization.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { SFX } from './sfx-data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const normalize = argv.includes('--normalize');
const rateFlag = argv.indexOf('--rate');
const SAMPLE_RATE = rateFlag !== -1 ? Number(argv[rateFlag + 1]) : 48000;
const outDir = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--rate')
  || join(__dirname, 'out');

if (![48000, 44100, 56000].includes(SAMPLE_RATE)) {
  console.error(`Unsupported --rate ${SAMPLE_RATE}. web-pokey supports 48000, 44100, or 56000.`);
  process.exit(1);
}

// ── load the web-pokey POKEY class headlessly ─────────────────────────────────
// pokey.js is written for an AudioWorklet: it references the globals `sampleRate`
// and `currentFrame`, extends AudioWorkletProcessor, and calls registerProcessor
// at top level. We satisfy those with a sandbox and pull the POKEY class out.
function loadPokeyClass(sampleRate) {
  const src = readFileSync(join(__dirname, 'vendor', 'pokey.js'), 'utf8')
    + '\n;globalThis.__POKEY = POKEY;'; // export the class to the sandbox global
  const sandbox = {
    sampleRate,
    currentFrame: 0,
    console,
    AudioWorkletProcessor: class {},
    registerProcessor: () => {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'vendor/pokey.js' });
  if (typeof sandbox.__POKEY !== 'function') {
    throw new Error('Failed to load POKEY class from vendor/pokey.js');
  }
  return sandbox.__POKEY;
}

const POKEY = loadPokeyClass(SAMPLE_RATE);

// ── ALSOUN envelope expander ──────────────────────────────────────────────────
// Tempest stores each SFX as two 6-byte envelope records (AUDF1 + AUDC1) walked
// by the sound IRQ at ~250 Hz. Expand a `{ audf, audc }` pair (see sfx-data.mjs)
// into the timed [reg, value, time, ...] event stream the renderer feeds POKEY.
const BEAT = 1 / 250;     // sound-IRQ period (~246-250 Hz, one beat ≈ 4 ms)
const MAX_SFX_S = 1.6;    // cap sustained/looping envelopes for a one-shot WAV

// Walk one register sequence. reg: 0 = AUDF1, 1 = AUDC1.
function expandSeq(reg, [value, beats, delta, count, restart]) {
  const ev = [];
  const stepDur = Math.max(1, beats) * BEAT;
  let val = value, t = 0, steps = 0, n = count === 0 ? 1 : count, looped = false;
  while (steps < n && t < MAX_SFX_S) {
    ev.push([reg, val & 0xff, Number(t.toFixed(5))]);
    val = (val + delta) & 0xff;
    t += stepDur;
    steps++;
    if (steps >= n && restart !== 0 && t < MAX_SFX_S && !looped) {
      // looping sound — replay the segment to fill a usable one-shot sample
      n = Math.min(Math.floor(MAX_SFX_S / stepDur), n * Math.ceil(MAX_SFX_S / Math.max(t, 1e-3)));
      val = value;
      looped = true;
    }
  }
  return { ev, dur: t };
}

// Returns { pokey1, durationMs } for a `spec.alsoun = { audf, audc }`.
function expandAlsoun({ audf, audc }) {
  const a = expandSeq(0, audf); // AUDF1 (pitch)
  const b = expandSeq(1, audc); // AUDC1 (distortion + volume)
  // web-pokey walks the feed monotonically, so AUDF and AUDC events MUST be
  // merged into chronological order or later-but-earlier-timed writes are
  // applied in a lump at the end (→ a silent or wrong sound).
  const merged = [...a.ev, ...b.ev].sort((x, y) => x[2] - y[2]);
  return {
    pokey1: [8, 0x00, 0.0, ...merged.flat()],
    durationMs: Math.max(20, Math.round((Math.min(MAX_SFX_S, Math.max(a.dur, b.dur)) + 0.02) * 1000)),
  };
}

// ── Star Wars 4-byte FX-record expander ───────────────────────────────────────
// Star Wars stores each effect as per-channel *lists* of 4-byte records
// `[count, duration, value, delta]` (NOT Tempest's single 6-byte ALSOUN record).
// A record emits `count` values stepping by `delta`, each held `duration` ticks,
// then the list advances. A `count=0` record terminates the list and writes 0 to
// the register (so a volume list's terminator silences the channel — that's what
// ends the effect). See sfx-data.mjs and the cabinet's FX_Functions.asm.
//
// ── THE TICK IS 8.192 ms, NOT THE 4.096 ms SOUND IRQ ─────────────────────────
// This constant was 0.004096 until sw6-4, on the reasonable-sounding belief that
// the FX driver is walked by the sound IRQ. It is not. The IRQ is 4.096 ms, but
// AUDDO — the FX driver — is GATED behind a one-bit test of the interrupt counter
// (SNDAUX.MAC:165-168):
//
//     LDA $INTCT      ; incremented once per 4 ms IRQ (SNDAUX.MAC:102)
//     LSRA            ; shift bit 0 into carry
//     IFCC            ; ?8 MILL BOUNDARY?   <- the ROM's own words
//     JSR AUDDO       ; THEN AUDIO SPECIAL EFFECTS
//     ENDIF
//
// so it runs on every OTHER interrupt. Every effect baked at 4.096 ms was twice
// as fast as the cabinet's — and it was invisible, because this constant scales
// the TIME axis only and never touches AUDF: a sweep ran twice as fast through
// the *identical* pitches. Nothing was transposed, so nothing sounded wrong; the
// effects were merely short. That is why an ear signoff passed them.
//
// ⚠ DO NOT "correct" this to 16.384 ms on the strength of AUDDO's own header,
// which says `AUDDO - UPDATE AUDIO EVERY 16 MILS` (SNDAUD.MAC:1084). That comment
// is STALE. Its caller gates on ONE bit — 16 ms would need a two-bit test
// (`ANDA #03`) — and AUDDO's body (SNDAUD.MAC:1086-1126) has NO internal divider:
// one `DEC AU$TMR(X)` per call, per channel. Its tick IS its call rate.
// A label's comment is not its caller. (sw6-1 learned the same lesson from PMBEN,
// which is labelled ";BENS THEME (START OF TOWER)" and is the game-over theme.)
export const SW_BEAT = 0.008192; // FX driver tick — the 8 ms boundary, not the 4 ms IRQ

// Walk one register list → { steps: [[value, time], …], dur }.
function expandRecords(records) {
  const steps = [];
  let t = 0;
  for (const [count, duration, value, delta] of records) {
    if (count === 0) {
      steps.push([0, t]); // terminator: write 0 (AUDC=0 ⇒ silence) and stop
      break;
    }
    const stepDur = Math.max(1, duration) * SW_BEAT;
    let v = value;
    for (let i = 0; i < count; i++) {
      if (t > MAX_SFX_S) return { steps, dur: t };
      steps.push([v & 0xff, Number(t.toFixed(5))]);
      v = (v + delta) & 0xff;
      t += stepDur;
    }
  }
  return { steps, dur: t };
}

// Expand a `spec.swfx = { channels: [{ freq, vol }, …] }` dispatch entry.
// Channels map to AUDF/AUDC pairs across two POKEY chips (≤4 channels each),
// mirroring the cabinet's 2-POKEY, 8-channel FX board. The volume list's
// terminator bounds each channel's audible length; freq writes past it are
// dropped (the channel is already silent).
function expandSwfx({ channels }) {
  const feeds = { 1: [], 2: [] }; // chip → [[reg, value, time], …]
  let maxDur = 0;
  channels.forEach((ch, i) => {
    const chip = i < 4 ? 1 : 2;
    const fReg = (i % 4) * 2;     // AUDFn
    const vReg = fReg + 1;        // AUDCn
    const vol = expandRecords(ch.vol);
    const freq = expandRecords(ch.freq);
    const chanEnd = vol.dur;
    if (chanEnd > maxDur) maxDur = chanEnd;
    for (const [val, t] of freq.steps) {
      if (t <= chanEnd + 1e-9) feeds[chip].push([fReg, val, t]);
    }
    for (const [val, t] of vol.steps) feeds[chip].push([vReg, val, t]);
  });
  const build = (arr) => (arr.length
    ? [8, 0x00, 0.0, ...arr.sort((a, b) => a[2] - b[2]).flat()]
    : null);
  return {
    pokey1: build(feeds[1]),
    pokey2: build(feeds[2]),
    durationMs: Math.max(20, Math.round((Math.min(MAX_SFX_S, maxDur) + 0.02) * 1000)),
  };
}

// ── render one SFX to a Float32 sample buffer ─────────────────────────────────
function renderSfx(spec) {
  const nSamples = Math.max(1, Math.ceil((spec.durationMs / 1000) * SAMPLE_RATE));
  const gain = spec.gain ?? 1.0;

  const p1 = new POKEY('L');
  if (spec.pokey1?.length) p1.feed(spec.pokey1.slice());
  let p2 = null;
  if (spec.pokey2?.length) {
    p2 = new POKEY('R');
    p2.feed(spec.pokey2.slice());
  }

  const out = new Float32Array(nSamples);
  let peak = 0;
  for (let i = 0; i < nSamples; i++) {
    // apply any register writes scheduled at/before this sample (time = i/rate)
    p1.processEvents(i);
    let s = p1.get();
    if (p2) {
      p2.processEvents(i);
      s = (s + p2.get()) * 0.5; // mix two chips to mono
    }
    s *= gain;
    out[i] = s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }

  if ((normalize || spec.normalize) && peak > 1e-6) {
    const k = 0.9 / peak;
    for (let i = 0; i < nSamples; i++) out[i] *= k;
    peak = 0.9;
  }
  return { out, peak };
}

// ── 16-bit mono PCM WAV writer ────────────────────────────────────────────────
function writeWav(path, samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);        // fmt chunk size
  buf.writeUInt16LE(1, 20);         // PCM
  buf.writeUInt16LE(1, 22);         // channels = 1
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);         // block align
  buf.writeUInt16LE(16, 34);        // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  writeFileSync(path, buf);
}

// Bake one spec to samples. Exported so a test can exercise the expander without
// writing any files — importing this module must never bake anything by itself.
export function bakeSfx(spec) {
  // Authentic Star Wars entries carry a 4-byte-record `swfx` dispatch entry;
  // expand it to per-chip register events. (Tempest's `alsoun` form still works.)
  if (spec.swfx) {
    const e = expandSwfx(spec.swfx);
    spec.pokey1 = e.pokey1;
    spec.pokey2 = e.pokey2;
    spec.durationMs = e.durationMs;
  } else if (spec.alsoun) {
    const e = expandAlsoun(spec.alsoun);
    spec.pokey1 = e.pokey1;
    spec.durationMs = e.durationMs;
  }
  const { out, peak } = renderSfx(spec);
  return { samples: out, peak, sampleRate: SAMPLE_RATE, seconds: out.length / SAMPLE_RATE };
}

// ── main ──────────────────────────────────────────────────────────────────────
// Guarded: this file is imported by bake-sfx.test.mjs. Without the guard, merely
// importing it would bake every effect to disk as a side effect of the import.
if (process.argv[1] && process.argv[1].endsWith('bake-sfx.mjs')) {
  mkdirSync(outDir, { recursive: true });
  console.log(`Baking ${SFX.length} SFX @ ${SAMPLE_RATE} Hz → ${outDir}\n`);
  let made = 0;
  let silent = 0;
  for (const spec of SFX) {
    const { samples, peak, seconds } = bakeSfx(spec);
    writeWav(join(outDir, `${spec.name}.wav`), samples, SAMPLE_RATE);
    made++;
    const warn = peak < 1e-4 ? '  ⚠ SILENT — check register data' : '';
    if (warn) silent++;
    console.log(`  ✓ ${spec.name}.wav  ${seconds.toFixed(3)}s  peak=${peak.toFixed(3)}${warn}`);
  }
  console.log(`\nBaked ${made} file(s), 16-bit mono WAV.${silent ? `  (${silent} silent — likely placeholder/empty data)` : ''}`);
}
