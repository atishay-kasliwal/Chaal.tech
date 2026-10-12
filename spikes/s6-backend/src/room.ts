import { DurableObject } from 'cloudflare:workers';
import { SessionManager, selectDecisionContext } from 'poker-engine-ts';
import type { Card, SeatBootstrapConfig, SessionConfig } from 'poker-engine-ts';
import { Ledger, type TransferResult, type TxType } from './ledger';

interface Attachment {
  playerId: string;
  seq: number;
}

export class Room extends DurableObject<Cloudflare.Env> {
  private ledger: Ledger;
  messagesReceived = 0;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ledger = new Ledger(ctx.storage.sql, (fn) => ctx.storage.transactionSync(fn));
    ctx.blockConcurrencyWhile(async () => {
      this.ledger.init();
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS timeouts (id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT NOT NULL, fired_at INTEGER NOT NULL)');
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS timers (player TEXT PRIMARY KEY, due INTEGER NOT NULL)');
    });
  }

  // ---- ledger RPC ----
  mint(opKey: string, to: string, amount: number, kind?: string): TransferResult {
    return this.ledger.mint(opKey, to, amount, kind);
  }
  transfer(opKey: string, type: TxType, from: string, to: string, amount: number, crashAfterDebit = false): TransferResult {
    return this.ledger.transfer(opKey, type, from, to, amount, crashAfterDebit);
  }
  balances() { return this.ledger.balances(); }
  verify() { return this.ledger.verify(); }
  transactionCount() { return this.ledger.transactionCount(); }
  usage() { return { rowsRead: this.ledger.rowsRead, rowsWritten: this.ledger.rowsWritten, messagesReceived: this.messagesReceived }; }

  // ---- turn timers via alarms ----
  async startTurnTimer(player: string, ms: number): Promise<void> {
    const due = Date.now() + ms;
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO timers (player, due) VALUES (?, ?)', player, due);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || due < current) await this.ctx.storage.setAlarm(due);
  }
  timeouts(): string[] {
    return this.ctx.storage.sql.exec('SELECT player FROM timeouts ORDER BY id').toArray().map((r) => r.player as string);
  }
  async alarm(): Promise<void> {
    const rows = this.ctx.storage.sql.exec('SELECT player FROM timers').toArray();
    this.ctx.storage.transactionSync(() => {
      for (const r of rows) {
        this.ctx.storage.sql.exec('INSERT INTO timeouts (player, fired_at) VALUES (?, ?)', r.player as string, Date.now());
        this.ctx.storage.sql.exec('DELETE FROM timers WHERE player = ?', r.player as string);
      }
    });
  }

  // ---- hibernating WebSockets ----
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const playerId = new URL(request.url).searchParams.get('player') ?? 'anon';
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId, seq: 0 } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    this.messagesReceived += 1;
    const att = ws.deserializeAttachment() as Attachment;
    const next: Attachment = { ...att, seq: att.seq + 1 };
    ws.serializeAttachment(next);
    const msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    let result: unknown = { error: 'unknown message' };
    if (msg.t === 'transfer') result = this.ledger.transfer(msg.op, msg.type, msg.from, msg.to, msg.amount);
    else if (msg.t === 'ping') result = { pong: true };
    const reply = JSON.stringify({ seq: next.seq, player: att.playerId, result });
    for (const peer of this.ctx.getWebSockets()) peer.send(reply); // broadcast like a room would
  }

  webSocketClose(ws: WebSocket, code: number): void {
    ws.close(code, 'closing');
  }

  // ---- engine compatibility: run a real poker hand inside the Workers runtime ----
  async runPokerHand(): Promise<{ stage: string; pot: number }> {
    const config: SessionConfig = {
      tableVariant: 'texas-holdem', bettingStructure: 'no-limit', maxSeats: 6, startingStack: 1000,
      blindSchedule: [{ level: 1, smallBlind: 5, bigBlind: 10 }], personaPolicy: { defaultStyle: 'balanced' },
      ruleSet: { streets: ['preflop', 'flop', 'turn', 'river', 'showdown'], postingOrder: ['small-blind', 'big-blind'],
        minRaisePolicy: 'double-last-bet', showdownOrdering: 'high-card',
        cardDistribution: { holeCardsPerPlayer: 2, burnPerStreet: [0, 1, 1], communityReveal: [0, 3, 1, 1] } },
      evaluationPolicy: { engine: 'lookup-table', evaluatorId: 'default', supportsHiLo: false, cacheSize: 1024 },
      autoAdvance: true,
    };
    const seats: SeatBootstrapConfig[] = ['a', 'b', 'c'].map((p, i) => ({ playerId: p, seatIndex: i, stack: 1000 }));
    const deck: Card[] = ['As', 'Ks', 'Qs', 'Js', 'Ts', '9s', '8s', '7s', '6s', '5s', '4s', '3s'];
    const manager = SessionManager.create(config, seats, { deck });
    const decision = selectDecisionContext(manager.session);
    const actor = decision.actor!;
    await manager.applyIntent({ id: 'x1', actor, requested: { type: 'fold' } as never, origin: 'ui', issuedAt: Date.now(),
      expectedSnapshotVersion: manager.session.activeSnapshot.index });
    const snap = manager.session.activeSnapshot;
    return { stage: snap.hand.stage, pot: snap.pots.main.amount };
  }
}
