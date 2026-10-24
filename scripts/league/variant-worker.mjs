import { runTable } from '../../server/sim/table.mjs';

/**
 * One table of one game for the variant league: the usual per-seat money, plus how the bots
 * used the game's own moves (table moves by kind, Show calls) and how hands ended.
 */
process.on('message', (spec) => {
	if (spec === null) return process.disconnect();
	try {
		const rows = spec.ids.map((id) => ({
			id,
			net: 0,
			wins: 0,
			decisions: 0,
			raises: 0,
			folds: 0,
			moves: {}
		}));
		const reasons = {};
		let hands = 0;
		let steps = 0;
		runTable(
			spec,
			(h) => {
				hands++;
				reasons[h.reason] = (reasons[h.reason] ?? 0) + 1;
				for (const s of h.seats) {
					rows[s.seat].net += s.net;
					rows[s.seat].wins += Number(s.won);
				}
				for (const d of h.decisions) {
					const r = rows[d.seat];
					steps++;
					r.decisions++;
					if (d.name === 'raise') r.raises++;
					if (d.name === 'pack') r.folds++;
					const key = d.q ? `${d.name}:${d.q}` : d.name;
					r.moves[key] = (r.moves[key] ?? 0) + 1;
				}
			},
			{
				// Name the kind of a table move (draw, trade, bid ...) or a Show's call.
				decision: ({ move }) =>
					move.action === 'table'
						? `${move.payload.kind}${move.payload.index === -1 ? '-keep' : ''}${
								move.payload.kind === 'bid' ? `-${move.payload.bid}` : ''
							}`
						: (move.payload?.declare ?? null)
			}
		);
		process.send({ block: spec.block, rotation: spec.rotation, hands, steps, rows, reasons });
	} catch (e) {
		process.send({ error: `${spec.rulesVersion}: ${e.stack?.split('\n').slice(0, 3).join(' | ') ?? e.message}` });
	}
});
