// Music module for the CyberHUD helper.
// - Track info comes from playerctl (MPRIS: Spotify, browsers, mpv, etc.).
// - The spectrum comes from parec, which reads the default audio output
//   monitor (the same audio you hear). It never touches the microphone.

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const RATE = 44100;   // sample rate requested from parec
export const WINDOW = 1024;  // samples per FFT (~23 ms)
export const HOP = 512;      // new samples between FFTs (~86 updates/s)
export const BANDS = 24;     // frequency bars shown on the page
const F_MIN = 40;            // lowest band edge (Hz)
const F_MAX = 16000;         // highest band edge (Hz)
const META_INTERVAL_MS = 1000;

// Hann window reduces spectral leakage between bins.
const HANN = Float32Array.from(
  { length: WINDOW },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1))
);

// Log-spaced band edges, so bass and treble get similar visual space.
const binHz = RATE / WINDOW;
const EDGES = Array.from({ length: BANDS + 1 }, (_, i) => F_MIN * (F_MAX / F_MIN) ** (i / BANDS));
const BAND_BINS = Array.from({ length: BANDS }, (_, i) => {
  const lo = Math.max(1, Math.floor(EDGES[i] / binHz));
  const hi = Math.max(lo + 1, Math.ceil(EDGES[i + 1] / binHz));
  return [lo, hi];
});

// In-place iterative radix-2 FFT. Arrays must have a power-of-two length.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

// Turns one WINDOW of samples (-1..1) into BANDS values (0..1).
export function bandsFromWindow(samples) {
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) re[i] = samples[i] * HANN[i];
  fft(re, im);

  const out = new Array(BANDS);
  for (let b = 0; b < BANDS; b++) {
    const [lo, hi] = BAND_BINS[b];
    let sum = 0;
    for (let k = lo; k < hi; k++) sum += Math.hypot(re[k], im[k]);
    const mag = sum / (hi - lo) / (WINDOW / 2);
    const db = 20 * Math.log10(mag + 1e-12);
    // -70 dB maps to 0, about -15 dB and louder maps to 1.
    out[b] = Math.min(1, Math.max(0, (db + 70) / 55));
  }
  return out;
}

// --- Audio capture ----------------------------------------------------------

const ring = new Float32Array(WINDOW);
let ringPos = 0;
let sinceHop = 0;
const smoothed = new Float32Array(BANDS);
let bandsOut = new Array(BANDS).fill(0);

function onAudio(buf) {
  const count = buf.length >> 1; // s16le mono: 2 bytes per sample
  for (let i = 0; i < count; i++) {
    ring[ringPos] = buf.readInt16LE(i * 2) / 32768;
    ringPos = (ringPos + 1) % WINDOW;
    if (++sinceHop === HOP) {
      sinceHop = 0;
      const ordered = new Float32Array(WINDOW);
      for (let k = 0; k < WINDOW; k++) ordered[k] = ring[(ringPos + k) % WINDOW];
      const raw = bandsFromWindow(ordered);
      for (let b = 0; b < BANDS; b++) {
        // Bars jump up instantly and fall gradually.
        smoothed[b] = Math.max(raw[b], smoothed[b] * 0.82);
      }
      bandsOut = Array.from(smoothed, (v) => Math.round(v * 1000) / 1000);
    }
  }
}

// The capture process is only running while a player reports "Playing".
// PipeWire shows a recording indicator for any active capture stream, so
// stopping it when playback ends keeps the indicator off the rest of the time.
let capture = null;
let captureMissing = false;

function startCapture() {
  const proc = spawn(
    'parec',
    ['-d', '@DEFAULT_MONITOR@', '--format=s16le', `--rate=${RATE}`, '--channels=1', '--latency-msec=30'],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  );
  capture = proc;
  proc.stdout.on('data', (buf) => {
    if (capture === proc) onAudio(buf);
  });
  proc.on('error', (err) => {
    if (capture === proc) capture = null;
    if (err.code === 'ENOENT') {
      captureMissing = true;
      console.warn('music: parec not found. Install libpulse to enable the spectrum.');
    }
  });
  proc.on('exit', () => {
    if (capture === proc) capture = null;
  });
}

function stopCapture() {
  if (capture) {
    const proc = capture;
    capture = null;
    proc.kill();
  }
  smoothed.fill(0);
  bandsOut = new Array(BANDS).fill(0);
}

function syncCapture() {
  const playing = meta.status === 'Playing';
  if (playing && !capture && !captureMissing) startCapture();
  else if (!playing && capture) stopCapture();
}

// --- Track metadata ---------------------------------------------------------

let meta = { status: 'NO PLAYER', artist: '', title: '', album: '' };

// Each failure gets its own status so the page can say what's wrong.
function setError(status, title) {
  meta = { status, artist: '', title, album: '' };
}

// Parses `playerctl -a metadata` output (one line per player) and picks the
// best candidate: a Playing player first, then a Paused one. Browsers often
// keep paused media tabs registered, so the first player listed is not
// necessarily the one that is actually playing.
const STATUS_RANK = { Playing: 0, Paused: 1, Stopped: 2 };

export function pickPlayer(stdout) {
  const players = stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [player = '', status = '', artist = '', title = '', album = ''] = line.split('\t');
      return { player, status: status || 'Stopped', artist, title, album };
    });
  if (players.length === 0) return null;
  return players.reduce((best, p) =>
    (STATUS_RANK[p.status] ?? 3) < (STATUS_RANK[best.status] ?? 3) ? p : best
  );
}

async function pollMeta() {
  try {
    const { stdout } = await run('playerctl', [
      '-a',
      'metadata',
      '--format',
      '{{playerName}}\t{{status}}\t{{artist}}\t{{title}}\t{{album}}',
    ]);
    const best = pickPlayer(stdout);
    meta = best
      ? { status: best.status, artist: best.artist, title: best.title, album: best.album }
      : { status: 'NO PLAYER', artist: '', title: 'No active media player', album: '' };
  } catch (err) {
    if (err.code === 'ENOENT') {
      setError('MISSING', 'playerctl is not installed (sudo pacman -S playerctl)');
    } else if (/No players found/i.test(err.stderr || '')) {
      setError('NO PLAYER', 'No active media player');
    } else {
      const reason = (err.stderr || err.message || 'unknown error').trim().split('\n')[0];
      setError('ERROR', `playerctl error: ${reason}`);
    }
  }
}

// --- Public API -------------------------------------------------------------

export function startMusic() {
  let timer = null;
  const tick = async () => {
    await pollMeta();
    syncCapture();
  };
  tick();
  timer = setInterval(tick, META_INTERVAL_MS);
  return {
    state: () => ({
      ...meta,
      // Only send spectrum data while something is actually playing.
      bands: meta.status === 'Playing' ? bandsOut : new Array(BANDS).fill(0),
    }),
    stop: () => {
      clearInterval(timer);
      stopCapture();
    },
  };
}
