// node scripts/latency.mjs <host> [label]   e.g. node scripts/latency.mjs s6.chaal.tech
import { execFileSync } from 'node:child_process';
const host = process.argv[2];
const label = process.argv[3] ?? host;
if (!host) throw new Error('usage: node scripts/latency.mjs <host> [label]');
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : null; };
const summ = (a) => ({ n: a.length, p50: pct(a, 0.5), p95: pct(a, 0.95), p99: pct(a, 0.99), max: a.length ? +Math.max(...a).toFixed(1) : null });
const ms = (x) => +(parseFloat(x) * 1000).toFixed(1);

// ---- HTTP breakdown with curl: fresh connection per request ----
function curlFresh(path, n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const o = execFileSync('curl', ['-s', '-o', '/dev/null', '-m', '30', '-w', '%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total}', `https://${host}${path}?r=${Math.random()}`], { encoding: 'utf8' }).trim().split(' ');
    const [dns, connect, tls, ttfb, total] = o.map(ms);
    rows.push({ dnsMs: dns, tcpMs: +(connect - dns).toFixed(1), tlsMs: +(tls - connect).toFixed(1), ttfbMs: +(ttfb - tls).toFixed(1), totalMs: total });
  }
  const col = (k) => summ(rows.map((r) => r[k]));
  return { dns: col('dnsMs'), tcp: col('tcpMs'), tls: col('tlsMs'), timeToFirstByteAfterTls: col('ttfbMs'), total: col('totalMs') };
}
// ---- reused connection: many requests in one curl process (setup paid once) ----
function curlReused(path, n) {
  const urls = Array.from({ length: n }, () => `https://${host}${path}?r=${Math.random()}`);
  const o = execFileSync('curl', ['-s', '-o', '/dev/null', '-m', '60', '-w', '%{time_total}\n', ...urls], { encoding: 'utf8' }).trim().split('\n').map(ms);
  return { firstRequestMs: o[0], laterRequests: summ(o.slice(1)) };
}
// ---- server timing from the Worker / Durable Object (body JSON) ----
async function serverTiming(path, n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = await fetch(`https://${host}${path}?r=${Math.random()}`, { cache: 'no-store' });
    rows.push((await r.json()));
  }
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.srv ?? {})))];
  return { colo: rows[0]?.colo ?? null, ...Object.fromEntries(keys.map((k) => [k, summ(rows.map((r) => r.srv?.[k]).filter((x) => x != null))])) };
}
// ---- WebSocket ----
const room = `lat-${Date.now()}`;
const wsUrl = `wss://${host}/room/${room}/ws?player=tester`;
function wsOpen(url) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now(); const ws = new WebSocket(url);
    ws.onopen = () => resolve({ ws, ms: +(performance.now() - t0).toFixed(1) });
    ws.onerror = () => reject(new Error('ws error'));
  });
}
function rpc(ws, msg) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2); const t0 = performance.now();
    const h = (e) => { const m = JSON.parse(e.data); if (m.id === id) { ws.removeEventListener('message', h); resolve({ ms: performance.now() - t0, srv: m.result?.srv }); } };
    ws.addEventListener('message', h); ws.send(JSON.stringify({ ...msg, id }));
  });
}
async function wsRtt(ws, type, n) {
  const rtt = [], doMs = [], sqlMs = [];
  for (let i = 0; i < n; i++) { const r = await rpc(ws, { t: type }); rtt.push(r.ms); if (r.srv) { doMs.push(r.srv.doMs); sqlMs.push(r.srv.sqlMs); } }
  return { clientRoundTripMs: summ(rtt), durableObjectProcessingMs: summ(doMs), sqliteMs: summ(sqlMs) };
}

const out = { label, host, startedAt: new Date().toISOString() };
out.dnsServerAnswers = { A: execFileSync('dig', ['+short', 'A', host, '@1.1.1.1'], { encoding: 'utf8' }).trim().split('\n') };
out.httpWorkerOnly_freshConnections = curlFresh('/ping', 10);
out.httpWorkerOnly_reusedConnection = curlReused('/ping', 12);
out.httpThroughDurableObject_freshConnections = curlFresh(`/room/${room}/ping`, 10);
out.httpThroughDurableObject_reusedConnection = curlReused(`/room/${room}/ping`, 12);
out.serverTimingWorkerOnly = await serverTiming('/ping', 10);
out.serverTimingThroughDurableObject = await serverTiming(`/room/${room}/ping`, 12);
const opens = [];
for (let i = 0; i < 5; i++) { const { ws, ms: m } = await wsOpen(`wss://${host}/room/${room}-c${i}/ws?player=tester`); opens.push(m); ws.close(); }
out.websocketConnect = { samplesMs: opens, ...summ(opens) };
const { ws } = await wsOpen(wsUrl);
out.wsEcho_noSql = await wsRtt(ws, 'echo', 100);
out.wsSqlRead = await wsRtt(ws, 'sqlread', 100);
out.wsSqlWrite_ledgerTransfer = await wsRtt(ws, 'sqlwrite', 60);
ws.close();
out.finishedAt = new Date().toISOString();
console.log(JSON.stringify(out, null, 1));
