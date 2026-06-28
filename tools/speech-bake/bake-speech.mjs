#!/usr/bin/env node
// bake-speech.mjs — render Atari Star Wars TMS5220 speech to .wav, headless.
//
// Drives the independent TMS5220 synthesizer (tms5220.mjs) with the authentic
// LPC bitstreams in speech-data.mjs (transcribed from the cabinet's Speech*.asm
// disassembly) and writes one 8 kHz 16-bit mono WAV per phrase. Bake once, host
// on R2, play through the existing sampler (src/shell/audio.ts).
//
// Usage:
//   node tools/speech-bake/bake-speech.mjs [outDir] [--only <name>] [--gain N] [--normalize]
//
// Defaults: outDir = tools/speech-bake/out, gain = 2.0, no normalization.
// Prints frame diagnostics (frame count, voiced/unvoiced, stop frame, duration)
// so a parse can be sanity-checked without listening.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { synthesize, SAMPLE_RATE } from './tms5220.mjs';
import { SPEECH } from './speech-data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const normalize = argv.includes('--normalize');
const onlyFlag = argv.indexOf('--only');
const only = onlyFlag !== -1 ? argv[onlyFlag + 1] : null;
const gainFlag = argv.indexOf('--gain');
const gain = gainFlag !== -1 ? Number(argv[gainFlag + 1]) : 2.0;
const outDir = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--only' && argv[i - 1] !== '--gain')
  || join(__dirname, 'out');

// 16-bit mono PCM WAV writer.
function writeWav(path, samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);            // PCM
  buf.writeUInt16LE(1, 22);            // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  writeFileSync(path, buf);
}

mkdirSync(outDir, { recursive: true });
const list = only ? SPEECH.filter((s) => s.name === only) : SPEECH;
if (only && !list.length) {
  console.error(`No phrase named "${only}". Available: ${SPEECH.map((s) => s.name).join(', ')}`);
  process.exit(1);
}

console.log(`Baking ${list.length} phrase(s) @ ${SAMPLE_RATE} Hz, gain ${gain} → ${outDir}\n`);
let made = 0, suspect = 0;
for (const spec of list) {
  const r = synthesize(spec.lpc, { gain });
  let samples = r.samples;

  let peak = 0;
  for (const s of samples) { const a = Math.abs(s); if (a > peak) peak = a; }
  if (normalize && peak > 0) {
    const k = (0.9 * 32767) / peak;
    samples = Int16Array.from(samples, (v) => Math.round(v * k));
    peak = Math.round(0.9 * 32767);
  }

  const voiced = r.frames.filter((f) => !f.silent && !f.unvoiced).length;
  const unvoiced = r.frames.filter((f) => f.unvoiced).length;
  const silent = r.frames.filter((f) => f.silent).length;
  // Sanity flags: a clean phrase ends on a stop frame, has a mix of voiced and
  // unvoiced frames, and a plausible duration. Garbled bit-order/tables tend to
  // show as no stop frame, all-one-voicing, or an implausible length.
  const warn = [];
  if (!r.stopped) warn.push('no-stop-frame');
  if (voiced === 0 || unvoiced === 0) warn.push('single-voicing');
  if (peak < 64) warn.push('near-silent');
  if (warn.length) suspect++;

  const path = join(outDir, `${spec.name}.wav`);
  writeWav(path, samples, SAMPLE_RATE);
  made++;
  console.log(
    `  ${warn.length ? '⚠' : '✓'} ${spec.name}.wav  "${spec.phrase}"\n` +
    `      ${r.durationS.toFixed(2)}s  ${r.frames.length} frames ` +
    `(${voiced} voiced / ${unvoiced} unvoiced / ${silent} silent)  ` +
    `peak=${(peak / 32767).toFixed(2)}  stop=${r.stopped}` +
    (warn.length ? `  ⚠ ${warn.join(',')}` : ''),
  );
}
console.log(`\nBaked ${made} file(s), 16-bit mono WAV @ ${SAMPLE_RATE} Hz.` +
  (suspect ? `  (${suspect} flagged for inspection.)` : ''));
