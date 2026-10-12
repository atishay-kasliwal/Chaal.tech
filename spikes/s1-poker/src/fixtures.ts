import { SessionManager, selectDecisionContext } from 'poker-engine-ts';
import type { Card, SeatBootstrapConfig, SessionConfig } from 'poker-engine-ts';

export const baseConfig = (maxSeats: number, startingStack: number, sb = 5, bb = 10): SessionConfig => ({
  tableVariant: 'texas-holdem',
  bettingStructure: 'no-limit',
  maxSeats,
  startingStack,
  blindSchedule: [{ level: 1, smallBlind: sb, bigBlind: bb }],
  personaPolicy: { defaultStyle: 'balanced' },
  ruleSet: {
    streets: ['preflop', 'flop', 'turn', 'river', 'showdown'],
    postingOrder: ['small-blind', 'big-blind'],
    minRaisePolicy: 'double-last-bet',
    showdownOrdering: 'high-card',
    cardDistribution: { holeCardsPerPlayer: 2, burnPerStreet: [0, 1, 1], communityReveal: [0, 3, 1, 1] },
  },
  evaluationPolicy: { engine: 'lookup-table', evaluatorId: 'default', supportsHiLo: false, cacheSize: 1024 },
  autoAdvance: true,
});

export const DECK: Card[] = [
  'As','Ks','Qs','Js','Ts','9s','8s','7s','6s','5s','4s','3s','2s',
  'Ah','Kh','Qh','Jh','Th','9h','8h','7h','6h','5h','4h','3h','2h',
];

export function table(stacks: number[], opts: { sb?: number; bb?: number; maxSeats?: number } = {}) {
  const ids = stacks.map((_, i) => 'pABCDEFGH'[i + 1] ?? `p${i}`);
  const seats: SeatBootstrapConfig[] = stacks.map((stack, i) => ({ playerId: ids[i]!, seatIndex: i, stack }));
  const manager = SessionManager.create(
    baseConfig(opts.maxSeats ?? Math.max(stacks.length, 2), Math.max(...stacks), opts.sb, opts.bb),
    seats,
    { deck: DECK },
  );
  return { manager, ids };
}

export const decision = (m: SessionManager) => selectDecisionContext(m.session);
export const legalTypes = (m: SessionManager) =>
  decision(m).availableActions.filter((o) => !o.disabled).map((o) => o.type);
export const option = (m: SessionManager, type: string) =>
  decision(m).availableActions.find((o) => o.type === type);

let n = 0;
export async function act(
  m: SessionManager,
  actor: string,
  requested: { type: 'fold' } | { type: 'call'; amount?: number } | { type: 'check' } | { type: 'raise'; amount: number } | { type: 'all-in'; amount?: number },
) {
  const res = await m.applyIntent({
    id: `${actor}-${n++}`,
    actor,
    requested: requested as never,
    origin: 'ui',
    issuedAt: Date.now(),
    expectedSnapshotVersion: m.session.activeSnapshot.index,
  });
  return res.validation;
}
