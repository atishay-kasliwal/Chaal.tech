/**
 * Plain-text explanation of one bot decision from its trace, for the developer inspector
 * (scripts/sim/explain.mjs). Developer and owner use only: a trace carries the bot's own hand
 * strength, which must never reach other players.
 */
const pct = (p) => `${Math.round(p * 100)}%`.padStart(4);
const signed = (v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2));

export function explainDecision({ name, move, decision }) {
	const t = move.trace ?? {};
	const lines = [`${name.toUpperCase()} DECISION`];
	lines.push(
		`  Situation:   ${decision.blind ? 'blind' : 'seen'}, ${decision.rounds} rounds in, ${decision.alive} players in${decision.facing ? ', facing a raise' : ''}${decision.showOk ? ', show available' : ''}`
	);
	if (t.eq !== undefined)
		lines.push(
			`  Hand:        beats one random hand ${pct(t.eq)}; vs everyone still in ${pct(t.s)}`
		);
	if (t.probs)
		lines.push(
			`  Options:     ${Object.entries(t.probs)
				.map(([a, p]) => `${a} ${pct(p)}`)
				.join('  ')}`
		);
	if (t.utility)
		lines.push(
			`  Utility:     ${Object.entries(t.utility)
				.map(([a, u]) => `${a} ${signed(u)}`)
				.join('  ')}   (temperature ${t.tau})`
		);
	if (t.base) {
		// tp-character@2: the base brain, personality and quirks separately, and how bounded.
		const row = (label, o) =>
			`  ${label.padEnd(13)}${Object.entries(o)
				.map(([a, v]) => `${a} ${signed(v)}`)
				.join('  ')}`;
		lines.push(row('Base:', t.base));
		lines.push(
			`${row('Personality:', t.persona)}   (scaled by ${t.lambda}: base clarity ${t.clarity})`
		);
		// tp-character@3: mood, relationships and opponent memory, each bounded the same way.
		const moved = (o) => o && Object.values(o).some((v) => v !== 0);
		if (moved(t.state)) lines.push(row('Mood:', t.state));
		if (moved(t.social)) lines.push(row('Relations:', t.social));
		if (moved(t.model)) lines.push(row('Memory:', t.model));
		if (moved(t.quirk)) lines.push(row('Quirks:', t.quirk));
		if (t.capped) lines.push(`  Capped:      ${t.capped.join(', ')} (influence limit reached)`);
	}
	if (t.mood)
		lines.push(
			`  Mind:        ${Object.entries(t.mood)
				.map(([k, v]) => `${k} ${v.toFixed(2)}`)
				.join(', ')}; pressure ${t.pressure}${t.facing ? `; facing a raise from ${t.facing}` : ''}`
		);
	if (t.memoryRefs?.length)
		lines.push(
			`  Beliefs:     ${t.memoryRefs.map(([id, stat, p, n]) => `${id} ${stat} ${Math.round(p * 100)}% (n=${n.toFixed(0)})`).join('; ')}`
		);
	if (t.factors?.length) {
		lines.push('  Factors:');
		for (const [f, d] of t.factors)
			lines.push(
				`    ${f.padEnd(22)} ${Object.entries(d)
					.map(([a, v]) => `${a} ${signed(v)}`)
					.join('  ')}`
			);
	}
	if (t.alternatives?.length) {
		// v2 rows: [move, p, total, base, personality, quirk]; v3 adds mood, relations, memory.
		const parts = (alt) =>
			alt.length > 6
				? [
						['base', alt[3]],
						['personality', alt[4]],
						['mood', alt[5]],
						['relations', alt[6]],
						['memory', alt[7]],
						['quirk', alt[8]]
					]
				: [
						['base', alt[3]],
						['personality', alt[4]],
						['quirk', alt[5]]
					];
		lines.push(
			`  vs others:   ${t.alternatives
				.map(
					(alt) =>
						`${alt[0]}: total ${signed(alt[2])} (${parts(alt)
							.filter(([k, v]) => k === 'base' || v)
							.map(([k, v]) => `${k} ${signed(v)}`)
							.join(', ')})`
				)
				.join('; ')}`
		);
	}
	if (t.baseBest !== undefined)
		lines.push(
			`  Base brain:  would pick ${t.baseBest}; policy's best ${t.best}${t.override ? ' (personality override)' : ''}`
		);
	const against = t.key ?? t.rival;
	if (t.margins?.length)
		lines.push(
			`  Why ${decision.name} over ${against}: ${t.margins.map(([f, m]) => `${f} ${signed(m)}`).join(', ')}`
		);
	if (t.resisted?.length) lines.push(`  Resisted:    ${t.resisted.join(', ')} (fundamentals held)`);
	lines.push(`  Decision:    ${decision.name}`);
	lines.push(
		`  Primary:     ${move.reason}${t.secondary?.length ? `   Secondary: ${t.secondary.join(', ')}` : ''}`
	);
	lines.push(`  Path:        ${(t.path ?? []).join(' > ')}`);
	return lines.join('\n');
}
