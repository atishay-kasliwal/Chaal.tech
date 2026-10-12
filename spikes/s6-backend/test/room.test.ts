import { env, evictDurableObject, runDurableObjectAlarm } from 'cloudflare:test';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

let n = 0;
const room = () => env.ROOM.get(env.ROOM.idFromName(`room-${n++}`));

describe('S6 ledger in a Durable Object', () => {
  test('mint and transfer move chips and keep the invariant', async () => {
    const r = room();
    await r.mint('m1', 'alice', 1000);
    await r.mint('m2', 'bob', 1000);
    expect(await r.transfer('t1', 'GIFT', 'alice', 'bob', 300)).toEqual({ ok: true, duplicate: false });
    expect(await r.balances()).toEqual({ alice: 700, bob: 1300 });
    expect(await r.verify()).toMatchObject({ ok: true, totalBalances: 2000, totalMinted: 2000 });
  });

  test('insufficient funds is rejected with no partial effect', async () => {
    const r = room();
    await r.mint('m1', 'alice', 100);
    await r.mint('m2', 'bob', 100);
    expect(await r.transfer('t1', 'BET', 'alice', 'bob', 101)).toEqual({ ok: false, reason: 'insufficient_funds' });
    expect(await r.balances()).toEqual({ alice: 100, bob: 100 });
    expect(await r.transactionCount()).toBe(2);
  });

  test('a crash between debit and credit rolls everything back (atomicity)', async () => {
    const r = room();
    await r.mint('m1', 'alice', 500);
    await r.mint('m2', 'bob', 500);
    expect(await r.transfer('t1', 'BET', 'alice', 'bob', 200, true)).toEqual({ ok: false, reason: 'rolled_back' });
    expect(await r.balances()).toEqual({ alice: 500, bob: 500 });
    expect((await r.verify()).ok).toBe(true);
    // the same operation key can be retried afterwards because nothing was recorded
    expect(await r.transfer('t1', 'BET', 'alice', 'bob', 200)).toEqual({ ok: true, duplicate: false });
  });

  test('idempotency: the same operation key applies once', async () => {
    const r = room();
    await r.mint('m1', 'alice', 1000);
    await r.mint('m2', 'bob', 0 + 1);
    await r.transfer('t1', 'GIFT', 'alice', 'bob', 250);
    expect(await r.transfer('t1', 'GIFT', 'alice', 'bob', 250)).toEqual({ ok: true, duplicate: true });
    expect((await r.balances()).alice).toBe(750);
    expect(await r.mint('m1', 'alice', 1000)).toEqual({ ok: true, duplicate: true });
    expect((await r.verify()).totalMinted).toBe(1001);
  });

  test('invalid amounts, same account and unknown accounts are rejected', async () => {
    const r = room();
    await r.mint('m1', 'alice', 100);
    expect(await r.transfer('a', 'GIFT', 'alice', 'bob', 5)).toEqual({ ok: false, reason: 'unknown_account' });
    await r.mint('m2', 'bob', 100);
    expect(await r.transfer('b', 'GIFT', 'alice', 'bob', 0)).toEqual({ ok: false, reason: 'invalid_amount' });
    expect(await r.transfer('c', 'GIFT', 'alice', 'bob', 1.5)).toEqual({ ok: false, reason: 'invalid_amount' });
    expect(await r.transfer('d', 'GIFT', 'alice', 'alice', 5)).toEqual({ ok: false, reason: 'same_account' });
    expect(await r.transfer('e', 'GIFT', 'alice', 'bob', -5)).toEqual({ ok: false, reason: 'invalid_amount' });
  });

  test('concurrent transfers from one account never overdraw', async () => {
    const r = room();
    await r.mint('m1', 'alice', 1000);
    await r.mint('m2', 'bob', 1);
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => r.transfer(`c${i}`, 'GIFT', 'alice', 'bob', 100)));
    expect(results.filter((x) => x.ok).length).toBe(10);
    const b = await r.balances();
    expect(b.alice).toBe(0);
    expect(b.bob).toBe(1001);
    expect((await r.verify()).ok).toBe(true);
  });

  test('property: random transfers (valid and invalid, with replays) conserve chips', async () => {
    const accounts = ['p1', 'p2', 'p3', 'p4', 'banker', 'pot'];
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ from: fc.constantFrom(...accounts), to: fc.constantFrom(...accounts), amount: fc.integer({ min: -5, max: 700 }), replay: fc.boolean() }), { maxLength: 40 }),
        async (ops) => {
          const r = room();
          for (const [i, a] of accounts.entries()) await r.mint(`seed${i}`, a, 500);
          for (const [i, o] of ops.entries()) {
            await r.transfer(`op${i}`, 'BET', o.from, o.to, o.amount);
            if (o.replay) await r.transfer(`op${i}`, 'BET', o.from, o.to, o.amount);
          }
          const v = await r.verify();
          const bal = Object.values(await r.balances());
          return v.ok && v.totalBalances === 3000 && bal.every((x) => x >= 0);
        },
      ),
      { numRuns: 40 },
    );
  });

  test('state survives eviction (restart recovery)', async () => {
    const r = room();
    await r.mint('m1', 'alice', 1000);
    await r.mint('m2', 'bob', 1000);
    await r.transfer('t1', 'GIFT', 'alice', 'bob', 111);
    await evictDurableObject(r);
    expect(await r.balances()).toEqual({ alice: 889, bob: 1111 });
    expect(await r.transfer('t1', 'GIFT', 'alice', 'bob', 111)).toEqual({ ok: true, duplicate: true });
    expect((await r.verify()).ok).toBe(true);
  });
});

describe('S6 alarms (turn timers)', () => {
  test('an alarm fires the timeout handler', async () => {
    const r = room();
    await r.startTurnTimer('alice', 30_000);
    expect(await runDurableObjectAlarm(r)).toBe(true);
    expect(await r.timeouts()).toEqual(['alice']);
    expect(await runDurableObjectAlarm(r)).toBe(false); // consumed
  });

  test('a timer set before eviction still fires after eviction', async () => {
    const r = room();
    await r.startTurnTimer('bob', 30_000);
    await evictDurableObject(r);
    expect(await runDurableObjectAlarm(r)).toBe(true);
    expect(await r.timeouts()).toEqual(['bob']);
  });
});

describe('S6 WebSockets with hibernation', () => {
  async function connect(r: ReturnType<typeof room>, player: string) {
    const res = await r.fetch(`https://room.test/ws?player=${player}`, { headers: { Upgrade: 'websocket' } });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();
    const inbox: any[] = [];
    ws.addEventListener('message', (e) => inbox.push(JSON.parse(e.data as string)));
    return { ws, inbox };
  }
  const settle = () => new Promise((res) => setTimeout(res, 50));

  test('messages round trip and broadcast to every connected player', async () => {
    const r = room();
    await r.mint('m1', 'alice', 1000);
    await r.mint('m2', 'bob', 1000);
    const a = await connect(r, 'alice');
    const b = await connect(r, 'bob');
    a.ws.send(JSON.stringify({ t: 'transfer', op: 'w1', type: 'GIFT', from: 'alice', to: 'bob', amount: 50 }));
    await settle();
    expect(a.inbox[0]).toMatchObject({ seq: 1, player: 'alice', result: { ok: true } });
    expect(b.inbox[0]).toMatchObject({ seq: 1, player: 'alice' });
    expect((await r.balances()).bob).toBe(1050);
  });

  test('after hibernation the socket stays connected and its attachment (seq) is restored', async () => {
    const r = room();
    const a = await connect(r, 'alice');
    a.ws.send(JSON.stringify({ t: 'ping' }));
    a.ws.send(JSON.stringify({ t: 'ping' }));
    await settle();
    expect(a.inbox.map((m) => m.seq)).toEqual([1, 2]);
    await evictDurableObject(r, { webSockets: 'hibernate' });
    a.ws.send(JSON.stringify({ t: 'ping' }));
    await settle();
    expect(a.inbox.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(a.inbox[2].player).toBe('alice');
  });

  test('duplicate transfer over the socket is applied once', async () => {
    const r = room();
    await r.mint('m1', 'alice', 100);
    await r.mint('m2', 'bob', 100);
    const a = await connect(r, 'alice');
    const msg = JSON.stringify({ t: 'transfer', op: 'dup', type: 'GIFT', from: 'alice', to: 'bob', amount: 40 });
    a.ws.send(msg);
    a.ws.send(msg);
    await settle();
    expect((await r.balances()).alice).toBe(60);
    expect(a.inbox[1].result).toEqual({ ok: true, duplicate: true });
  });
});

describe('S6 engine compatibility in the Workers runtime', () => {
  test('poker-engine-ts runs a hand inside the Durable Object', async () => {
    const r = room();
    const out = await r.runPokerHand();
    expect(out.stage).toBeDefined();
    expect(out.pot).toBeGreaterThan(0);
  });
});

describe('S6 expected usage for a simulated 2-hour, 8-player session (local counters)', () => {
  test('60 hands x 8 players stays far below the free daily limits', async () => {
    const r = room();
    const players = Array.from({ length: 8 }, (_, i) => `p${i}`);
    await r.mint('seed-pot', 'pot', 1);
    for (const p of players) await r.mint(`seed-${p}`, p, 5000);
    const sockets = await Promise.all(players.map(async (p) => {
      const res = await r.fetch(`https://room.test/ws?player=${p}`, { headers: { Upgrade: 'websocket' } });
      res.webSocket!.accept();
      return res.webSocket!;
    }));
    const HANDS = 60;
    let sent = 0;
    for (let h = 0; h < HANDS; h++) {
      for (const [i, p] of players.entries()) {
        sockets[i]!.send(JSON.stringify({ t: 'transfer', op: `boot-${h}-${p}`, type: 'BOOT', from: p, to: 'pot', amount: 10 })); sent++;
        for (let k = 0; k < 4; k++) { sockets[i]!.send(JSON.stringify({ t: 'transfer', op: `bet-${h}-${p}-${k}`, type: 'BET', from: p, to: 'pot', amount: 5 })); sent++; }
      }
      // settle: pot pays the winner everything
      const potBalance = (await r.balances()).pot!;
      await r.transfer(`win-${h}`, 'POT_WIN', 'pot', players[h % 8]!, potBalance);
    }
    await settle();
    const u = await r.usage();
    console.log('S6 USAGE (local, 60 hands x 8 players):', JSON.stringify({ sent, ...u, txRows: await r.transactionCount(), verify: await r.verify() }));
    // worst case every incoming WebSocket message is billed as one request (it is billed less, but we do not rely on that)
    expect(u.messagesReceived).toBe(sent);
    expect(sent + 2 * HANDS).toBeLessThan(100_000 * 0.1);
    expect(u.rowsWritten).toBeLessThan(100_000 * 0.2);
    expect((await r.verify()).ok).toBe(true);
  });
  const settle = () => new Promise((res) => setTimeout(res, 300));
});
