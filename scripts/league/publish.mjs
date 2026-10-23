import { validateLeagueReport, saveLeagueReport } from '../../server/league/store.mjs';
import { MongoClient } from 'mongodb';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Publish summaries only. The standard application URI may be used if it has write access. */
export async function publishReport(input) {
	const report = validateLeagueReport(input);
	if (process.env.LEAGUE_PUBLISH_KEY && process.env.LEAGUE_PUBLISH_URL) {
		const endpoint = new URL(process.env.LEAGUE_PUBLISH_URL);
		if (endpoint.protocol !== 'https:' && endpoint.hostname !== '127.0.0.1')
			throw new Error('League publisher requires HTTPS');
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${process.env.LEAGUE_PUBLISH_KEY}`
			},
			body: JSON.stringify(report),
			signal: AbortSignal.timeout(30000)
		});
		if (!response.ok)
			throw new Error(
				`League upload failed (${response.status}); the report remains saved locally.`
			);
		const body = await response.json();
		if (!body.ok || body.id !== report.id)
			throw new Error('League publisher did not confirm the expected competition.');
		return;
	}

	const uri = process.env.MONGODB_ADMIN_URI || process.env.MONGODB_URI;
	if (!uri)
		throw new Error(
			'Set MONGODB_ADMIN_URI or MONGODB_URI. The completed report remains saved locally.'
		);
	const client = new MongoClient(uri, {
		serverSelectionTimeoutMS: 10000,
		connectTimeoutMS: 10000,
		maxPoolSize: 1
	});
	try {
		await client.connect();
		await saveLeagueReport(client.db(process.env.MONGODB_DB || 'chaal'), report);
	} finally {
		await client.close();
	}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const file = process.argv[2];
	if (!file)
		throw new Error(
			'Usage: node --env-file-if-exists=.env scripts/league/publish.mjs <report.json>'
		);
	await publishReport(JSON.parse(await readFile(file, 'utf8')));
	console.log('Published league summary.');
}
