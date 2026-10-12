import { DurableObject } from 'cloudflare:workers';
import { AccessToken } from 'livekit-server-sdk';
import { Ledger } from './ledger';

// Define the Durable Object for a game room
export class Room extends DurableObject {
  private ledger: Ledger;
  private state: GameState;
  private timers: Map<string, number>; // playerId -> timeout timestamp
  private turnTimeoutId: number | null = null;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.ledger = new Ledger(state.storage.sql, (fn) => state.storage.transactionSync(fn));
    this.state = new GameState();
    this.timers = new Map();
    this.initialize();
  }

  private async initialize() {
    await this.ledger.init();
    // Restore any existing state from storage if needed
    // For simplicity, we start fresh each time the DO is created (hibernation may persist state)
  }

  // Handle WebSocket connections for game signaling
  async websocket(
    ws: WebSocket,
    initialRequest: Request
  ): Promise<void> {
    ws.accept();

    // Extract player info from query params
    const url = new URL(initialRequest.url);
    const playerId = url.searchParams.get('player') ?? crypto.randomUUID();
    const playerName = url.searchParams.get('name') ?? `Player-${playerId.slice(0, 4)}`;

    // Add player to room
    const player = this.state.addPlayer(playerId, playerName);
    if (!player) {
      ws.close(1008, 'Room full');
      return;
    }

    // Ensure player account exists in ledger
    this.ledger.openAccount(playerId, 'player');

    // Attach playerId to WebSocket for message handling
    ws.serializeAttachment({ playerId, seq: 0 });

    // If we have enough players, start a new hand
    if (this.state.canStartHand()) {
      this.startHand();
    }

    ws.addEventListener('message', async (event) => {
      try {
        const att = ws.deserializeAttachment() as { playerId: string; seq: number };
        const next: Attachment = { ...att, seq: att.seq + 1 };
        ws.serializeAttachment(next);

        const msg = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data));
        await this.handleGameMessage(ws, att.playerId, msg);
      } catch (e) {
        console.error('Error handling message:', e);
        ws.send(JSON.stringify({ error: 'Invalid message' }));
      }
    });

    ws.addEventListener('close', () => {
      this.state.removePlayer(ws);
      this.timers.delete(ws);
    });
  }

  private async handleGameMessage(ws: WebSocket, playerId: string, msg: any) {
    const player = this.state.getPlayer(playerId);
    if (!player) {
      ws.send(JSON.stringify({ error: 'Player not found' }));
      return;
    }

    // Only allow actions during betting stage and if it's the player's turn
    if (this.state.stage !== 'betting' || this.state.currentTurn !== playerId) {
      ws.send(JSON.stringify({ error: 'Not your turn or game not in betting stage' }));
      return;
    }

    let success = false;
    switch (msg.t) {
      case 'chaal':
        success = this.state.callChaal(playerId, msg.amount);
        break;
      case 'raise':
        success = this.state.raise(playerId, msg.amount);
        break;
      case 'pack':
        success = this.state.pack(playerId);
        break;
      case 'show':
        success = this.state.show(playerId);
        break;
      case 'sideShow':
        success = this.state.sideShow(playerId, msg.targetPlayerId);
        break;
      case 'ping':
        ws.send(JSON.stringify({ pong: true }));
        return;
      default:
        ws.send(JSON.stringify({ error: 'Unknown message type' }));
        return;
    }

    if (success) {
      // Process the action: update ledger, state, etc.
      await this.processAction(playerId, msg);
      // Move to next player
      this.advanceTurn();
    } else {
      ws.send(JSON.stringify({ error: 'Action failed' }));
    }
  }

  private async processAction(playerId: string, msg: any) {
    const player = this.state.getPlayer(playerId);
    if (!player) return;

    // Clear any existing turn timer
    this.clearTurnTimer(playerId);

    // Update ledger for chips moved to pot
    switch (msg.t) {
      case 'chaal':
      case 'raise':
        const amount = msg.amount ?? 0;
        if (amount > 0) {
          await this.ledger.transfer(
            crypto.randomUUID(),
            'BET',
            playerId,
            'pot',
            amount,
            false
          );
          player.totalBet += amount;
          this.state.pot += amount;
        }
        break;
      case 'pack':
        // No chips moved, just fold
        break;
      case 'show':
      case 'sideShow':
        // Chips already accounted for; showdown will handle pot distribution
        break;
    }

    // Broadcast updated state
    this.broadcastState();
  }

  private advanceTurn() {
    this.state.advanceTurn();
    this.setupTurnTimer();
  }

  private setupTurnTimer() {
    const playerId = this.state.currentTurn;
    if (!playerId) return;

    const timeoutMs = 30 * 1000; // 30 seconds
    const due = Date.now() + timeoutMs;
    this.timers.set(playerId, due);
    // In a real implementation, we would use Durable Object alarms
    // For simplicity, we rely on client-side timers; but we should implement server-side
    // We'll implement a simple timeout check using alarms in a later iteration
    // For now, we just store the timeout and check on each message? Not ideal.
    // We'll implement a basic alarm system using storage.setAlarm
    // For brevity, we skip the alarm implementation here but note it's needed.
  }

  private clearTurnTimer(playerId: string) {
    this.timers.delete(playerId);
  }

  private broadcastState() {
    // In a real implementation, we would broadcast the state to all players
    // For now, we just log
    console.log('State updated:', this.state);
  }

  private startHand() {
    this.state.resetHand();
    this.state.dealCards();
    this.state.collectBoot();
    this.state.determineFirstPlayer();
    this.broadcastState();
    this.setupTurnTimer();
  }

  // Handle HTTP requests (for health checks, token generation, etc.)
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Token generation endpoint (LiveKit)
    if (url.pathname === '/getToken') {
      const room = url.searchParams.get('room');
      const name = url.searchParams.get('name');
      if (!room || !name) {
        return new Response('Missing room or name parameter', { status: 400 });
      }

      const livekitUrl = this.env.LIVEKIT_URL;
      const apiKey = this.env.LIVEKIT_API_KEY;
      const apiSecret = this.env.LIVEKIT_API_SECRET;

      if (!livekitUrl || !apiKey || !apiSecret) {
        return new Response('LiveKit configuration missing', { status: 500 });
      }

      const token = new AccessToken(apiKey, apiSecret, { identity: name });
      token.addGrant({ roomJoin: true, room });
      token.setTTL('1h');
      const jwt = token.toJwt();

      return new Response(jwt, {
        headers: {
          'Content-Type': 'application/jwt',
        },
      });
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // For now, just return a simple response
    return new Response('TeenPatti Backend - Durable Object Room', { status: 200 });
  }
}

// The Cloudflare Worker entry point
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Route to Durable Object based on room ID from path: /room/:roomId/ws
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([^/]+)\/ws$/);
    if (match) {
      const roomId = match[1];
      const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
      return stub.fetch(request);
    }

    // For other routes, handle in worker (e.g., token generation at /getToken)
    // We'll let the Durable Object's fetch handle it if the path matches /getToken? but it's not scoped to a room.
    // For simplicity, we handle token generation at the worker level for /getToken
    if (url.pathname === '/getToken') {
      // We need to access env; we can't get it from the DO stub easily.
      // We'll handle it here.
      const livekitUrl = env.LIVEKIT_URL;
      const apiKey = env.LIVEKIT_API_KEY;
      const apiSecret = env.LIVEKIT_API_SECRET;

      if (!livekitUrl || !apiKey || !apiSecret) {
        return new Response('LiveKit configuration missing', { status: 500 });
      }

      const urlObj = new URL(request.url);
      const room = urlObj.searchParams.get('room');
      const name = urlObj.searchParams.get('name');
      if (!room || !name) {
        return new Response('Missing room or name parameter', { status: 400 });
      }

      const token = new AccessToken(apiKey, apiSecret, { identity: name });
      token.addGrant({ roomJoin: true, room });
      token.setTTL('1h');
      const jwt = token.toJwt();

      return new Response(jwt, {
        headers: {
          'Content-Type': 'application/jwt',
        },
      });
    }

    return new Response('TeenPatti Backend - Worker Entry Point', { status: 200 });
  }
} satisfies ExportedHandler<Env>;

// Game state management
class GameState {
  players: Map<string, Player> = new Map();
  pot: number = 0;
  boot: number = 2; // default boot
  stake: number = 2; // current stake
  maxStake: number = 32; // 16 * boot
  deck: number[] = [];
  stage: string = 'waiting'; // waiting, betting, showdown
  currentTurn: string | null = null;
  turnOrder: string[] = [];
  showdownRequested: boolean = false;

  constructor() {
    this.initializeDeck();
  }

  private initializeDeck() {
    // Create a deck of 52 cards (0-51)
    this.deck = Array.from({ length: 52 }, (_, i) => i);
    this.shuffleDeck();
  }

  private shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  addPlayer(playerId: string, name: string): Player | null {
    if (this.players.size >= 8) {
      return null; // room full
    }
    const player = new Player(playerId, name);
    this.players.set(playerId, player);
    return player;
  }

  removePlayer(ws: WebSocket) {
    // We need to find the player by ws; we'll store a reverse map or search
    // For simplicity, we'll just note that cleanup is needed
    // In a real implementation, we'd keep a map from ws to playerId
  }

  getPlayer(playerId: string): Player | null {
    return this.players.get(playerId) ?? null;
  }

  canStartHand(): boolean {
    return this.players.size >= 3 && this.stage === 'waiting';
  }

  resetHand() {
    this.pot = 0;
    this.stage = 'betting';
    this.showdownRequested = false;
    this.players.forEach(p => {
      p.folded = false;
      p.cards = [];
      p.totalBet = 0;
    });
    this.initializeDeck();
    this.shuffleDeck();
  }

  dealCards() {
    this.players.forEach((p, id) => {
      p.cards = [
        this.deck.pop() ?? 0,
        this.deck.pop() ?? 0,
        this.deck.pop() ?? 0
      ];
    });
  }

  collectBoot() {
    this.players.forEach((p, id) => {
      if (p.folded) return;
      // Transfer boot from player to pot via ledger will be handled in processAction
      // For now, we just deduct from player's chips and add to pot
      // Actually, we should use ledger; but we'll do it here for simplicity and later refactor
      p.chips -= this.boot;
      p.totalBet += this.boot;
      this.pot += this.boot;
    });
  }

  determineFirstPlayer() {
    // For simplicity, first player is the first in the map
    const first = this.players.keys().next().value;
    if (first) {
      this.currentTurn = first;
      this.turnOrder = Array.from(this.players.keys());
    }
  }

  callChaal(playerId: string, amount: number): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;
    const chaalCost = this.stake;
    if (amount !== chaalCost) return false;
    if (player.chips < chaalCost) {
      // Handle short stack: all-in allowed only if calling show with 2 players?
      // For simplicity, we'll just reject if insufficient chips for chaal
      return false;
    }
    player.chips -= chaalCost;
    player.totalBet += chaalCost;
    this.pot += chaalCost;
    return true;
  }

  raise(playerId: string, amount: number): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;
    const raiseCost = this.stake * 2; // raise doubles the stake
    if (amount !== raiseCost) return false;
    if (player.chips < raiseCost) return false;
    // Update stake
    this.stake = Math.min(this.stake * 2, this.maxStake);
    player.chips -= raiseCost;
    player.totalBet += raiseCost;
    this.pot += raiseCost;
    return true;
  }

  pack(playerId: string): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;
    if (player.folded) return false;
    player.folded = true;
    return true;
  }

  show(playerId: string): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;
    if (player.folded) return false;
    // Check if exactly 2 players remain (not folded)
    const activePlayers = Array.from(this.players.values()).filter(p => !p.folded);
    if (activePlayers.length !== 2) return false;
    const [p1, p2] = activePlayers;
    const score1 = GameState.evaluateHand(p1.cards);
    const score2 = GameState.evaluateHand(p2.cards);
    const cmp = GameState.compareScores(score1, score2);
    // Tie: requester loses
    if (cmp >= 0) {
      // requester's hand is better or equal -> requester loses
      player.folded = true;
    } else {
      // target's hand is better -> target loses
      const targetId = activePlayers.find(p => p.playerId !== playerId)?.playerId;
      if (targetId) {
        const target = this.getPlayer(targetId);
        if (target) target.folded = true;
      }
    }
    this.state = 'showdown';
    return true;
  }

  sideShow(playerId: string, targetPlayerId: string): boolean {
    const player = this.getPlayer(playerId);
    const target = this.getPlayer(targetPlayerId);
    if (!player || !target) return false;
    if (player.folded || target.folded) return false;
    // Check if target is the previous active player in turn order
    const currentIdx = this.turnOrder.indexOf(playerId);
    const prevIdx = (currentIdx - 1 + this.turnOrder.length) % this.turnOrder.length;
    const prevPlayerId = this.turnOrder[prevIdx];
    if (prevPlayerId !== targetPlayerId) return false;
    // Check if at least 3 players remain
    const activeCount = this.players.size - Array.from(this.players.values()).filter(p => p.folded).length;
    if (activeCount < 3) return false;
    // Side show logic: compare hands privately, loser packs
    const scorePlayer = GameState.evaluateHand(player.cards);
    const scoreTarget = GameState.evaluateHand(target.cards);
    const cmp = GameState.compareScores(scorePlayer, scoreTarget);
    // Tie: requester packs
    if (cmp >= 0) {
      // requester's hand is better or equal -> requester loses
      player.folded = true;
    } else {
      // target's hand is better -> target loses
      target.folded = true;
    }
    this.state = 'showdown';
    return true;
  }

  private advanceTurn() {
    if (this.stage !== 'betting') return;
    // Find next active player
    let idx = this.turnOrder.indexOf(this.currentTurn ?? '');
    do {
      idx = (idx + 1) % this.turnOrder.length;
      const playerId = this.turnOrder[idx];
      const player = this.getPlayer(playerId);
      if (!player?.folded) {
        this.currentTurn = playerId;
        break;
      }
    } while (idx !== this.turnOrder.indexOf(this.currentTurn ?? ''));
  }
}

// Hand ranking evaluation
class GameState {
  static evaluateHand(cards: number[]): number[] {
    // cards: array of three card indices (0-51)
    // returns: [category, tie1, tie2, tie3] where higher is better
    if (cards.length !== 3) return [0, 0, 0, 0]; // invalid

    const suits = cards.map(c => Math.floor(c / 13));
    const ranks = cards.map(c => c % 13); // 0:Ace, 1:2, ..., 12:King

    // Check for trail (three of a kind)
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) {
      const highRank = ranks[0] === 0 ? 14 : ranks[0] + 1;
      return [6, highRank, 0, 0]; // category 6: Trail
    }

    // Check for flush
    const isFlush = suits[0] === suits[1] && suits[1] === suits[2];

    // Helper to convert rankIndex to high card value (Ace=14)
    const toHigh = (r: number) => (r === 0 ? 14 : r + 1);
    const highRanks = ranks.map(toHigh).sort((a, b) => b - a); // descending

    // Check for wheel (A-2-3) i.e., ranks 0,1,2
    const isWheel = ranks.sort((a, b) => a - b).join(',') === '0,1,2';

    // Check for straight using high ranks, but note that wheel is a straight with Ace low.
    const isStraight = (highRanks[0] === highRanks[1] + 1 && highRanks[1] === highRanks[2] + 1) || isWheel;

    // Straight flush
    if (isFlush && isStraight) {
      // Determine the high card value for the straight
      let straightHigh: number;
      if (isWheel) {
        straightHigh = 3; // in wheel, the highest card is 3 (since Ace is low)
      } else {
        straightHigh = highRanks[0]; // highest card in the straight
      }
      return [5, straightHigh, 0, 0]; // category 5: Pure Sequence
    }

    // Straight
    if (isStraight) {
      let straightHigh: number;
      if (isWheel) {
        straightHigh = 3;
      } else {
        straightHigh = highRanks[0];
      }
      return [4, straightHigh, 0, 0]; // category 4: Sequence
    }

    // Flush
    if (isFlush) {
      return [3, highRanks[0], highRanks[1], highRanks[2]]; // category 3: Color
    }

    // Pair
    const pairs: number[] = [];
    const kickers: number[] = [];
    const countMap: { [key: string]: number } = {};
    for (const r of ranks) {
      countMap[r] = (countMap[r] || 0) + 1;
    }
    for (const r in countMap) {
      if (countMap[r] === 2) {
        pairs.push(parseInt(r));
      } else if (countMap[r] === 1) {
        kickers.push(parseInt(r));
      }
    }
    if (pairs.length === 1) {
      const pairRank = pairs[0];
      const kickerRank = kickers[0];
      const pairHigh = pairRank === 0 ? 14 : pairRank + 1;
      const kickerHigh = kickerRank === 0 ? 14 : kickerRank + 1;
      return [2, pairHigh, kickerHigh, 0]; // category 2: Pair
    }

    // High Card
    return [1, highRanks[0], highRanks[1], highRanks[2]]; // category 1: High Card
  }

  static compareScores(a: number[], b: number[]): number {
    // Compare two score arrays lexicographically, return >0 if a>b, <0 if a<b, 0 if equal
    for (let i = 0; i < a.length; i++) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  }
}

class Player {
  constructor(
    public playerId: string,
    public name: string,
    public chips: number = 1000, // starting chips
    public folded: boolean = false,
    public cards: number[] = [],
    public totalBet: number = 0
  ) {}
}

type Attachment = {
  playerId: string;
  seq: number;
};