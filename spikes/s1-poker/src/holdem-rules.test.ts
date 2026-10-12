import { describe, expect, test } from 'vitest';
import { selectTableView, dealHoleCards } from 'poker-engine-ts';
import { act, decision, legalTypes, option, table } from './fixtures';

describe('S1: our Hold\'em rules (DECISIONS.md section C) against poker-engine-ts', () => {
  test('3-handed: button acts first preflop; blinds are left of the button', () => {
    const { manager, ids } = table([1000, 1000, 1000]);
    const hand = manager.session.activeSnapshot.hand as any;
    expect(hand.buttonSeat).toBe(0);
    expect(hand.blinds.smallBlind.playerId).toBe(ids[1]);
    expect(hand.blinds.bigBlind.playerId).toBe(ids[2]);
    expect(decision(manager).actor).toBe(ids[0]);
  });

  test('heads-up: button posts the small blind and acts first preflop', () => {
    const { manager, ids } = table([1000, 1000]);
    const hand = manager.session.activeSnapshot.hand as any;
    expect(hand.blinds.smallBlind.playerId).toBe(ids[hand.buttonSeat]);
    expect(decision(manager).actor).toBe(ids[hand.buttonSeat]);
  });

  // KNOWN MISMATCH (see docs/spikes/s1-poker-engine-evaluation.md): on the live path the engine
  // keeps blinds out of the round's turns, so an open raise to 30 is counted as a raise of 30 (from 0)
  // instead of 20 (from the big blind). Minimum re-raise comes out 60 instead of 50. test.fails keeps
  // the suite green while recording the gap; it will fail loudly (as a pass) once fixed.
  test.fails('PREFLOP min raise equals the last full raise (open to 30, next min raise-to is 50)', async () => {
    const { manager, ids } = table([1000, 1000, 1000]);
    expect((await act(manager, ids[0]!, { type: 'raise', amount: 30 })).kind).toBe('accepted');
    const raise = option(manager, 'raise') as any;
    expect(raise.min).toBe(50);
  });

  // KNOWN DEFECT 2: on the live path the small blind's call is charged the full big blind (10) on top
  // of the 5 already posted (contribution 15, pot 25). Correct: SB completes to 10 (pot 20), and the
  // big blind then gets a check option. Recorded with test.fails; see the S1 report.
  test.fails('heads-up: small blind completing to the big blind adds only the difference', async () => {
    const { manager, ids } = table([1000, 1000]);
    await act(manager, ids[0]!, { type: 'call' });
    const snap = manager.session.activeSnapshot as any;
    expect(snap.pots.main.contributions[ids[0]!]).toBe(10);
    expect(snap.pots.main.amount).toBe(20);
  });

  test.fails('heads-up: big blind has a check option after the small blind completes', async () => {
    const { manager, ids } = table([1000, 1000]);
    await act(manager, ids[0]!, { type: 'call' });
    expect(decision(manager).actor).toBe(ids[1]);
    expect(legalTypes(manager)).toContain('check');
  });

  test.skip('POSTFLOP min raise equals the last full raise (bet 30, next min raise-to is 60)', async () => {
    const { manager, ids } = table([1000, 1000]);
    await act(manager, decision(manager).actor!, { type: 'call' });
    await act(manager, decision(manager).actor!, { type: 'check' });
    expect(manager.session.activeSnapshot.hand.stage).toBe('flop');
    await act(manager, decision(manager).actor!, { type: 'raise', amount: 30 });
    expect((option(manager, 'raise') as any).min).toBe(60);
  });

  test('a raise below the minimum is rejected', async () => {
    const { manager, ids } = table([1000, 1000, 1000]);
    await act(manager, ids[0]!, { type: 'raise', amount: 30 });
    const v = await act(manager, ids[1]!, { type: 'raise', amount: 40 });
    expect(v.kind).not.toBe('accepted');
  });

  test('a short all-in (less than a full raise) does not reopen betting for players who already acted', async () => {
    // a opens to 30 (raise of 20). b has 40 total: all-in to 40 is +10, a short raise.
    const { manager, ids } = table([1000, 40, 1000]);
    await act(manager, ids[0]!, { type: 'raise', amount: 30 });
    expect(decision(manager).actor).toBe(ids[1]);
    expect((await act(manager, ids[1]!, { type: 'all-in' })).kind).toBe('accepted');
    await act(manager, ids[2]!, { type: 'call' });
    expect(decision(manager).actor).toBe(ids[0]);
    expect(legalTypes(manager)).not.toContain('raise');
    expect(legalTypes(manager)).toContain('call');
    expect(legalTypes(manager)).toContain('fold');
  });

  test('a full all-in raise reopens betting', async () => {
    const { manager, ids } = table([1000, 100, 1000]);
    await act(manager, ids[0]!, { type: 'raise', amount: 30 });
    await act(manager, ids[1]!, { type: 'all-in' }); // to 100: +70, a full raise
    await act(manager, ids[2]!, { type: 'call' });
    expect(decision(manager).actor).toBe(ids[0]);
    expect(legalTypes(manager)).toContain('raise');
  });

  test('8 seats: all seated, blinds posted, first actor is left of the big blind', () => {
    const { manager, ids } = table(Array(8).fill(1000), { maxSeats: 8 });
    const hand = manager.session.activeSnapshot.hand as any;
    expect(hand.blinds.smallBlind.playerId).toBe(ids[1]);
    expect(hand.blinds.bigBlind.playerId).toBe(ids[2]);
    expect(decision(manager).actor).toBe(ids[3]);
  });

  test('unequal all-ins create layered side pots and conserve chips', async () => {
    const stacks = [100, 300, 1000];
    const { manager, ids } = table(stacks);
    await act(manager, ids[0]!, { type: 'all-in' }); // 100
    await act(manager, ids[1]!, { type: 'all-in' }); // 300
    await act(manager, ids[2]!, { type: 'call' });
    const snap = manager.session.activeSnapshot as any;
    const pots = [snap.pots.main, ...snap.pots.sides];
    const potTotal = pots.reduce((s: number, p: any) => s + p.amount, 0);
    const stacksNow = snap.seating.seats.reduce((s: number, x: any) => s + (x.stack ?? 0), 0);
    expect(potTotal + stacksNow).toBe(stacks.reduce((a, b) => a + b, 0));
    // main pot has all three eligible, a side pot excludes the 100-chip player
    expect(pots.length).toBeGreaterThanOrEqual(2);
    expect(pots[0].eligiblePlayers).toHaveLength(3);
    expect(pots[1].eligiblePlayers).not.toContain(ids[0]);
  });

  test('chips are conserved across folds and calls', async () => {
    const { manager, ids } = table([1000, 1000, 1000]);
    await act(manager, ids[0]!, { type: 'call' });
    await act(manager, ids[1]!, { type: 'fold' });
    const snap = manager.session.activeSnapshot as any;
    const pot = [snap.pots.main, ...snap.pots.sides].reduce((s: number, p: any) => s + p.amount, 0);
    const stacks = snap.seating.seats.reduce((s: number, x: any) => s + (x.stack ?? 0), 0);
    expect(pot + stacks).toBe(3000);
  });

  test('duplicate intent id is rejected or ignored, never applied twice', async () => {
    const { manager, ids } = table([1000, 1000, 1000]);
    const req = {
      id: 'dup-1', actor: ids[0]!, requested: { type: 'call' } as never, origin: 'ui' as const,
      issuedAt: Date.now(), expectedSnapshotVersion: manager.session.activeSnapshot.index,
    };
    const first = await manager.applyIntent(req);
    expect(first.validation.kind).toBe('accepted');
    const second = await manager.applyIntent(req);
    expect(second.validation.kind).not.toBe('accepted');
  });

  test('stale snapshot version is rejected', async () => {
    const { manager, ids } = table([1000, 1000, 1000]);
    await act(manager, ids[0]!, { type: 'call' });
    const stale = await manager.applyIntent({
      id: 'stale-1', actor: ids[1]!, requested: { type: 'call' } as never, origin: 'ui',
      issuedAt: Date.now(), expectedSnapshotVersion: 0,
    });
    expect(stale.validation.kind).not.toBe('accepted');
  });

  test('public table view never contains hole cards (server snapshot does)', () => {
    const { manager, ids } = table([1000, 1000, 1000]);
    const dealt = dealHoleCards(manager.session, ids);
    const serverHole = (dealt.session.activeSnapshot as any).hand?.cards?.holeCards
      ?? JSON.stringify(dealt.session.activeSnapshot);
    expect(JSON.stringify(dealt.dealtCards.length)).toBe('6');
    expect(String(JSON.stringify(serverHole))).toContain(dealt.dealtCards[0]!);
    const view = JSON.stringify(selectTableView(dealt.session));
    for (const card of dealt.dealtCards) expect(view).not.toContain(`"${card}"`);
  });
});
