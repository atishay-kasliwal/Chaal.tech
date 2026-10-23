import { runTable } from '../../server/sim/table.mjs';
process.on('message', (spec) => {
	if (spec === null) return process.disconnect();
	try {
		const rows = spec.ids.map((id) => ({ id, net: 0, wins: 0, decisions: 0, raises: 0, folds: 0 }));
		let hands = 0;
		runTable(spec, (h) => {
			hands++;
			for (const s of h.seats) {
				rows[s.seat].net += s.net;
				rows[s.seat].wins += Number(s.won);
			}
			for (const d of h.decisions) {
				const r = rows[d.seat];
				r.decisions++;
				if (d.name === 'raise') r.raises++;
				if (d.name === 'pack') r.folds++;
			}
		});
		process.send({ block: spec.block, rotation: spec.rotation, hands, rows });
	} catch (e) {
		process.send({ error: e.message });
	}
});
