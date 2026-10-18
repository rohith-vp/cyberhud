import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import si from 'systeminformation';
import { startMusic } from './music.mjs';

const PORT = 7777;
const COLLECT_MS = 2000;     // how often fast stats are collected
const SLOW_MS = 30000;       // GPU, gateway, and fan data change rarely
const LATENCY_MS = 15000;    // latency needs a network ping
const MUSIC_PUSH_MS = 66;    // ~15 spectrum updates per second
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, 'dist');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
};

// One unsupported sensor shouldn't break the whole response.
const safe = (fn, fallback) => Promise.resolve().then(fn).catch(() => fallback);
const toGB = (b) => (b ?? 0) / 1024 ** 3;
const toMBps = (b) => Math.max(0, b || 0) / 1e6;

let latencyCache = null;
let latest = null;
let busy = false;
let slow = { graphics: null, gateway: null, fans: [], at: 0 };

async function refreshSlow() {
  const [graphics, gateway, fans] = await Promise.all([
    safe(() => si.graphics(), null),
    safe(() => si.networkGatewayDefault(), null),
    safe(() => si.fans(), []),
  ]);
  slow = { graphics, gateway, fans, at: Date.now() };
}

async function collect() {
  const [load, speed, temp, mem, disks, netStats, diskIO, battery, time] = await Promise.all([
    safe(() => si.currentLoad(), null),
    safe(() => si.cpuCurrentSpeed(), null),
    safe(() => si.cpuTemperature(), null),
    safe(() => si.mem(), null),
    safe(() => si.fsSize(), []),
    safe(() => si.networkStats(), []),
    safe(() => si.fsStats(), null),
    safe(() => si.battery(), null),
    safe(() => si.time(), null),
  ]);

  // Prefer the root filesystem ('/' on Linux, 'C:' on Windows).
  const mainDisk = disks.find((d) => d.mount === '/' || d.mount === 'C:') ?? [...disks].sort((a, b) => b.size - a.size)[0];
  const activeNics = (netStats || []).filter(
    (n) => n.iface && !/^lo|loopback/i.test(n.iface) && n.rx_sec != null
  );
  const rx = activeNics.reduce((s, n) => s + (n.rx_sec || 0), 0);
  const tx = activeNics.reduce((s, n) => s + (n.tx_sec || 0), 0);

  return {
    cpu: {
      percent: load ? Math.round(load.currentLoad) : null,
      cores: load ? load.cpus.map((c) => Math.round(c.load)) : [],
      freqGHz: speed?.avg ?? null,
      tempC: temp?.main > 0 ? temp.main : null,
      fanRpm: slow.fans?.[0]?.rpm ?? null,
    },
    gpu: { tempC: slow.graphics?.controllers?.[0]?.temperatureGpu ?? null },
    ram: mem ? { usedGB: toGB(mem.active), totalGB: toGB(mem.total) } : null,
    disk: mainDisk
      ? {
          usedGB: toGB(mainDisk.used),
          totalGB: toGB(mainDisk.size),
          readMBps: toMBps(diskIO?.rx_sec),
          writeMBps: toMBps(diskIO?.wx_sec),
        }
      : null,
    net: {
      rxMBps: toMBps(rx),
      txMBps: toMBps(tx),
      latencyMs: latencyCache,
      gateway: slow.gateway || null,
      online: latencyCache !== null,
    },
    battery: battery?.hasBattery
      ? { percent: battery.percent, charging: battery.isCharging, acConnected: battery.acConnected }
      : { percent: null, charging: null, acConnected: null },
    uptimeSec: time?.uptime ?? null,
  };
}

async function refresh() {
  if (busy) return;
  busy = true;
  try {
    if (Date.now() - slow.at > SLOW_MS) await refreshSlow();
    latest = await collect();
  } catch (e) {
    console.error(e);
  } finally {
    busy = false;
  }
}

// Latency involves a network ping, so check it less often.
async function refreshLatency() {
  latencyCache = await safe(() => si.inetLatency(), null);
}

const music = startMusic();

refresh();
refreshLatency();
setInterval(refresh, COLLECT_MS);
setInterval(refreshLatency, LATENCY_MS);

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Server-Sent Events: pushes music state and spectrum.
  if (url.pathname === '/music') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = () => res.write(`data: ${JSON.stringify(music.state())}\n\n`);
    send();
    const timer = setInterval(send, MUSIC_PUSH_MS);
    req.on('close', () => clearInterval(timer));
    return;
  }

  if (url.pathname === '/stats') {
    if (!latest) { res.writeHead(503); return res.end('warming up'); }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(latest));
  }

  const file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`CyberHUD running at http://127.0.0.1:${PORT}`);
});
