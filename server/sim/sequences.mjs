/**
 * Phase 4 behavioural sequences (brief §11): conditional counts over one seat's decisions, enough
 * to read each character's signature chains with plain statistics (no classifier):
 *  - blind play under pressure: raise, call, look or pack while blind with seen players pushing,
 *    and the blind round at which it finally looks, pressured or not (Rohit);
 *  - after a big loss: seen raises, re-raises when raised, and bluff raises with weak hands, by hands
 *    since the loss (1 to 8), against hands with no loss in the last 8 (Virat's tilt and recovery);
 *  - strength and pressure: what it does facing a raise with a strong, a middling and a weak hand,
 *    and whether strong hands are raised after it recently gave way under pressure (GG).
 * Hand grades come from the offline judge (row.q), never from anything another player could see.
 */
const BIG = 20;
const cell = () => ({ n: 0, raise: 0, chaal: 0, see: 0, pack: 0, show: 0 });
const bump = (c, name) => {
	c.n++;
	if (name in c) c[name]++;
};

export function sequenceStudy(seat) {
	const s = {
		blindPressured: cell(),
		blindCalm: cell(),
		lookPressured: { n: 0, rounds: 0, never: 0 },
		lookCalm: { n: 0, rounds: 0, never: 0 },
		// Index 0: no big loss in the last 8 hands; 1..8: hands since the loss.
		afterLoss: Array.from({ length: 9 }, () => ({ seen: cell(), facing: cell(), weak: cell() })),
		facingStrong: cell(),
		facingMid: cell(),
		facingWeak: cell(),
		strongAfterGiveUp: cell(),
		strongOther: cell()
	};
	let lossAt = -99;
	let gaveUpAt = -99;
	let h = 0;
	let pressured = false;
	let lookedAt = null;
	return {
		decision({ move, row }) {
			if (row.seat !== seat || row.forced) return;
			const q = row.q ?? {};
			const pressure = (move.trace?.pressure ?? 0) > 0 || row.facing;
			if (row.blind) {
				if (pressure) pressured = true;
				bump(pressure ? s.blindPressured : s.blindCalm, row.name);
				if (row.name === 'see') lookedAt = row.rounds;
				return;
			}
			const since = h - lossAt;
			const a = s.afterLoss[since >= 1 && since <= 8 ? since : 0];
			bump(a.seen, row.name);
			if (row.facing) bump(a.facing, row.name);
			if (q.weak && row.raiseOk) bump(a.weak, row.name);
			if (row.facing) {
				const strong = q.strong || q.monster;
				bump(strong ? s.facingStrong : q.weak ? s.facingWeak : s.facingMid, row.name);
			}
			if ((q.strong || q.monster) && row.raiseOk)
				bump(h - gaveUpAt <= 2 && h > gaveUpAt ? s.strongAfterGiveUp : s.strongOther, row.name);
			if (row.name === 'pack' && pressure) gaveUpAt = h;
		},
		hand(hand) {
			const me = hand.seats.find((x) => x.seat === seat);
			const mine = hand.decisions.filter((d) => d.seat === seat);
			if (mine.length) {
				const l = pressured ? s.lookPressured : s.lookCalm;
				if (lookedAt != null) {
					l.n++;
					l.rounds += lookedAt;
				} else if (mine.some((d) => d.blind)) l.never++;
			}
			if (me && me.net <= -BIG) lossAt = h;
			h++;
			pressured = false;
			lookedAt = null;
		},
		result: () => s
	};
}
