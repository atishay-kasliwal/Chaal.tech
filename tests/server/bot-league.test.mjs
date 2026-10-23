import test from 'node:test';
import assert from 'node:assert/strict';
import {
	competitionSpecs,
	summarizeCompetition,
	ROSTER
} from '../../server/league/competition.mjs';
import { newYorkClock } from '../../scripts/league/schedule-time.mjs';
import { leagueHistory } from '../../server/league/store.mjs';

function resultSet(net = [4, 1, 0, -2, -3]) {
	return competitionSpecs({ hands: 1000, seed: 77 }).map((spec) => ({
		block: spec.block,
		rotation: spec.rotation,
		hands: 100,
		rows: spec.ids.map((id) => ({
			id,
			net: net[ROSTER.findIndex((c) => c.id === id)],
			wins: 20,
			decisions: 300,
			raises: 40,
			folds: 10
		}))
	}));
}
const options = {
	hands: 1000,
	seed: 77,
	startedAt: '2026-10-22T11:00:00Z',
	completedAt: '2026-10-22T11:01:00Z'
};
test('league rotates the canonical cast through every seat on identical deck streams', () => {
	const specs = competitionSpecs({ hands: 1000, seed: 77 });
	assert.equal(specs.length, 10);
	for (let block = 0; block < 2; block++)
		for (let seat = 0; seat < 5; seat++)
			assert.equal(new Set(specs.filter((s) => s.block === block).map((s) => s.ids[seat])).size, 5);
	assert.throws(() => competitionSpecs({ hands: 501, seed: 1 }));
	assert.throws(() => competitionSpecs({ hands: NaN, seed: 1 }));
});
test('league ranks net profit, counts shared hands once, and never publishes partial or unbalanced results', () => {
	const results = resultSet();
	const report = summarizeCompetition(results, options);
	assert.equal(report.standings[0].id, ROSTER[0].id);
	assert.equal(report.hands, 1000);
	assert.equal(report.participations, 5000);
	assert.equal(report.winner, ROSTER[0].id);
	assert.equal(
		report.standings.reduce((n, s) => n + s.net, 0),
		0
	);
	assert.throws(() => summarizeCompetition(results.slice(1), options), /Incomplete/);
	assert.throws(
		() => summarizeCompetition([...results.slice(1), results[1]], options),
		/Incomplete/
	);
	results[0].rows[0].net++;
	assert.throws(() => summarizeCompetition(results, options), /Invalid/);
});
test('uncertain results get a leader but no trophy, and exhibitions never create daily titles', () => {
	const rows = resultSet([0, 0, 0, 0, 0]);
	const tied = summarizeCompetition(rows, options);
	assert.equal(tied.winner, null);
	assert.equal(tied.decisive, false);
	const exhibition = summarizeCompetition(resultSet(), { ...options, kind: 'exhibition' });
	assert.equal(exhibition.winner, null);
	const a = ROSTER[0].id,
		b = ROSTER[1].id;
	const report = summarizeCompetition(resultSet(), options);
	assert.equal(report.gaps[a][b].mean, -report.gaps[b][a].mean);
});
test('7am schedule follows New York in winter, summer and both DST transition days', () => {
	for (const [before, at] of [
		['2026-01-15T11:59:00Z', '2026-01-15T12:00:00Z'],
		['2026-07-15T10:59:00Z', '2026-07-15T11:00:00Z'],
		['2026-03-08T10:59:00Z', '2026-03-08T11:00:00Z'],
		['2026-11-01T11:59:00Z', '2026-11-01T12:00:00Z']
	]) {
		assert.equal(newYorkClock(new Date(before)).due, false);
		assert.equal(newYorkClock(new Date(at)).due, true);
	}
	assert.equal(newYorkClock(new Date('2026-10-23T02:00:00Z')).day, '20261022');
});
test('league history excludes storage IDs and merges the recorded snapshot without duplicate runs', async () => {
	const report = summarizeCompetition(resultSet(), options);
	const db = {
		collection: (name) => {
			assert.equal(name, 'bot_league_runs');
			return {
				find: (query) => {
					assert.deepEqual(query.kind, { $in: ['daily', 'exhibition'] });
					return {
						sort: () => ({
							limit: () => ({ toArray: async () => [{ _id: report.id, ...report }] })
						})
					};
				}
			};
		}
	};
	const body = await leagueHistory(db);
	assert.equal(body.reports.find((r) => r.id === report.id)._id, undefined);
	assert.equal(body.schedule.timeZone, 'America/New_York');
});

test('publisher validates the completed result and strips unrecognised fields', async () => {
	const { validateLeagueReport } = await import('../../server/league/store.mjs');
	const report = {
		...summarizeCompetition(resultSet(), options),
		commit: 'a'.repeat(40),
		privatePlayerData: 'must not escape'
	};
	const clean = validateLeagueReport(report);
	assert.equal(clean.privatePlayerData, undefined);
	assert.throws(() =>
		validateLeagueReport({
			...report,
			standings: report.standings.map((s, i) => (i === 0 ? { ...s, hands: 3 } : s))
		})
	);
	assert.throws(() => validateLeagueReport({ ...report, winner: 'gg' }));
	assert.throws(() => validateLeagueReport({ ...report, commit: 'not-a-commit' }));
});
