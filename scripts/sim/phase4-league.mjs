/**
 * Phase 4 league (brief §2, §16): who beats whom.
 *  - Matchup matrix: each champion in seat 0 against four copies of one league member, on the same
 *    tables for every champion (so rows are comparable column by column).
 *  - Population league: tables of five drawn from the whole roster (champions, historical versions,
 *    baselines, human archetypes), every seat watched: each member's result with its interval, and
 *    the spread of a champion's sessions (its worst decile).
 * Direct matchup statistics are reported as they are; no rating system is fitted on top.
 */
import { combine, measure } from '../../server/sim/evaluate.mjs';
import { STYLES } from '../../server/bots/dna-styles.mjs';
import { leagueRoster, leagueMember, CHAMPIONS, SHORT } from '../../server/sim/league.mjs';
import { ci, tail } from '../../server/sim/p4stats.mjs';
import { stream } from '../../server/sim/seeds.mjs';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';
import { flat } from './phase4-stages.mjs';

const b100 = (s) => (s.total.net / Math.max(s.hands, 1)) * 100;

export async function league({ SEED, SCALE, run, save, opt }) {
	const TM = Math.round(Number(opt('matchTables', 24)) * SCALE);
	const TP = Math.round(Number(opt('popTables', 1500)) * SCALE);
	const H = Number(opt('hands', 100));
	const roster = leagueRoster();
	const specs = [];
	for (const c of CHARACTER_IDS)
		for (const col of roster) {
			// Four copies of one character cannot all sit as that published character (the engine
			// seats each character once): copies play the same style, decided in the simulator.
			const base = leagueMember(col.key);
			const m = typeof base === 'string' && STYLES[base] ? { id: base, style: STYLES[base] } : base;
			for (let t = 0; t < TM; t++)
				specs.push({
					seed: SEED,
					table: 3000 + t,
					hands: H,
					seats: [CHAMPIONS[c], m, m, m, m],
					matched: true,
					summary: { seats: [0] },
					meta: { run: 'matrix', row: c, col: col.key }
				});
		}
	for (let t = 0; t < TP; t++) {
		const random = stream(SEED, 'league-table', t).random;
		const picked = [];
		while (picked.length < 5) {
			const r = roster[Math.floor(random() * roster.length)];
			// At most one version of any character at a table, as in the Phase 3 population.
			if (picked.some((p) => p.key === r.key || (p.character && p.character === r.character)))
				continue;
			picked.push(r);
		}
		specs.push({
			seed: SEED,
			table: 50000 + t,
			hands: H,
			seats: picked.map((p) => leagueMember(p.key)),
			matched: true,
			summary: { seats: [0, 1, 2, 3, 4] },
			meta: { run: 'pop', keys: picked.map((p) => p.key) }
		});
	}
	console.log(`league: ${specs.length} tables (${roster.length} members)`);
	const res = flat(await run(specs, 'league'));
	const out = {
		seed: SEED,
		matchTables: TM,
		popTables: TP,
		roster,
		matrix: {},
		members: {},
		champions: {}
	};
	for (const c of CHARACTER_IDS) {
		out.matrix[c] = {};
		for (const col of roster) {
			const rows = res
				.filter((r) => r.run === 'matrix' && r.row === c && r.col === col.key)
				.map((r) => r.seats[0]);
			out.matrix[c][col.key] = ci(rows.map(b100));
		}
	}
	const byMember = {};
	for (const r of res.filter((x) => x.run === 'pop'))
		r.seats.forEach((s) => (byMember[r.keys[s.seat]] ??= []).push(s));
	for (const col of roster) {
		const ss = byMember[col.key] ?? [];
		const m = ss.length ? measure(combine(ss)) : null;
		out.members[col.key] = {
			group: col.group,
			tables: ss.length,
			hands: ss.reduce((s, x) => s + x.hands, 0),
			decisions: ss.reduce((s, x) => s + (x.total.decisions ?? 0), 0),
			boots: ci(ss.map(b100)),
			badActionRate: m?.badActionRate ?? null
		};
	}
	for (const c of CHARACTER_IDS) {
		const key = CHAMPIONS[c];
		const sessions = (byMember[key] ?? []).map(b100);
		const cols = Object.entries(out.matrix[c]).filter(([k]) => k !== key);
		const worst = cols.sort((a, b) => a[1].mean - b[1].mean)[0];
		const mine = byMember[key] ?? [];
		const m = mine.length ? measure(combine(mine)) : {};
		out.champions[c] = {
			worstMatchup: { member: worst[0], ...worst[1] },
			worstDecile: tail(sessions, 0.1),
			sessions: sessions.length,
			badActions: {
				strongPacked: m.strongPackRate,
				monsterNotRaised: m.monsterNoRaiseRate,
				weakCalled: m.weakCallRate
			}
		};
		console.log(
			`${SHORT[c].padEnd(6)} league ${Math.round(out.members[key].boots.mean)} ± ${Math.round(out.members[key].boots.ci)}; worst matchup ${worst[0]} ${Math.round(worst[1].mean)} ± ${Math.round(worst[1].ci)}; worst decile ${Math.round(out.champions[c].worstDecile)}`
		);
	}
	save(`league-${SEED}`, out);
}
