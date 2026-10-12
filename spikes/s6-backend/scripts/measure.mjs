// Run against a deployed spike: node scripts/measure.mjs wss://<host>
const base = process.argv[2];
if (!base) throw new Error('usage: node scripts/measure.mjs wss://host');
const room = `measure-${Date.now()}`;
const players = Array.from({ length: 8 }, (_, i) => `p${i}`);
let idc = 0;

function open(player) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base}/room/${room}/ws?player=${player}`);
    const pending = new Map();
    const seqs = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.player === player) seqs.push(m.seq);
      if (m.id && m.player === player && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    ws.onopen = () => resolve({ ws, pending, seqs, player });
    ws.onerror = (e) => reject(new Error('ws error ' + (e.message ?? '')));
  });
}
function call(c, msg, timeoutMs = 10000) {
  const id = `${c.player}-${idc++}`;
  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => { c.pending.delete(id); reject(new Error('timeout ' + msg.t)); }, timeoutMs);
    c.pending.set(id, (m) => { clearTimeout(to); resolve({ m, ms: performance.now() - t0 }); });
    c.ws.send(JSON.stringify({ ...msg, id }));
  });
}
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const out = { room, base };

const clients = await Promise.all(players.map(open));
const [c0] = clients;
for (const c of clients) await call(c, { t: 'mint', op: `seed-${c.player}`, to: c.player, amount: 5000 });
await call(c0, { t: 'mint', op: 'seed-pot', to: 'pot', amount: 1 });

// ---- 60 hands x 8 players, all players concurrent ----
const lat = [];
const t0 = performance.now();
for (let h = 0; h < 60; h++) {
  await Promise.all(clients.map(async (c) => {
    let r = await call(c, { t: 'transfer', op: `boot-${h}-${c.player}`, type: 'BOOT', from: c.player, to: 'pot', amount: 10 }); lat.push(r.ms);
    for (let k = 0; k < 4; k++) { r = await call(c, { t: 'transfer', op: `bet-${h}-${c.player}-${k}`, type: 'BET', from: c.player, to: 'pot', amount: 5 }); lat.push(r.ms); }
  }));
  const bal = (await call(c0, { t: 'balances' })).m.result;
  const w = await call(c0, { t: 'transfer', op: `win-${h}`, type: 'POT_WIN', from: 'pot', to: players[h % 8], amount: bal.pot }); lat.push(w.ms);
}
out.session = { seconds: +((performance.now() - t0) / 1000).toFixed(1), messages: lat.length };
out.latencyMs = { p50: +pct(lat, 0.5).toFixed(0), p95: +pct(lat, 0.95).toFixed(0), p99: +pct(lat, 0.99).toFixed(0), max: +Math.max(...lat).toFixed(0) };
const v1 = (await call(c0, { t: 'verify' })).m.result;
out.verifyAfterSession = v1;
out.usageAfterSession = (await call(c0, { t: 'usage' })).m.result;

// ---- alarm timer: 5 s ----
const ta = performance.now();
await call(c0, { t: 'timer', player: 'p3', ms: 5000 });
let fired = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const list = (await call(c0, { t: 'timeouts' })).m.result;
  if (list.includes('p3')) { fired = performance.now() - ta; break; }
}
out.alarm = { requestedMs: 5000, observedMs: fired === null ? null : Math.round(fired) };

// ---- hibernation: idle 30 s then the same sockets must still work with seq continuing ----
const before = clients[1].seqs.at(-1);
await new Promise((r) => setTimeout(r, 30000));
const after = (await call(clients[1], { t: 'ping' })).m;
out.hibernation = { idleSeconds: 30, seqBefore: before, seqAfter: after.seq, continuous: after.seq === before + 1 };

// ---- point-in-time recovery ----
const balBefore = (await call(c0, { t: 'balances' })).m.result;
const bookmark = (await call(c0, { t: 'bookmark' })).m.result.bookmark;
await new Promise((r) => setTimeout(r, 1500));
for (let i = 0; i < 5; i++) await call(c0, { t: 'transfer', op: `post-bookmark-${i}`, type: 'GIFT', from: 'p0', to: 'p1', amount: 100 });
const balChanged = (await call(c0, { t: 'balances' })).m.result;
const restoreAck = await call(c0, { t: 'restore', bookmark }).catch((e) => ({ m: { result: { error: String(e) } } }));
await new Promise((r) => setTimeout(r, 3000));
const c9 = await open('p9');
const balRestored = (await call(c9, { t: 'balances' })).m.result;
const v2 = (await call(c9, { t: 'verify' })).m.result;
out.pitr = {
  restoreAck: restoreAck.m.result,
  changedBefore: balChanged.p0 !== balBefore.p0,
  restoredEqualsBookmarkState: JSON.stringify(balRestored) === JSON.stringify(balBefore),
  verifyAfterRestore: v2,
};

for (const c of [...clients, c9]) c.ws.close();
console.log(JSON.stringify(out, null, 2));
