/**
 * Recorder health from MongoDB (read-only): attempted, recorded, failed and waiting hands, the last
 * good hand, failure reasons, rooms that keep failing, and hands the leaderboard archive saw that
 * the recorder did not.
 *   npm run analytics:health
 * Exits 1 when anything needs attention.
 */
import { MongoClient } from 'mongodb';
import { recorderHealth } from '../server/analytics/store.mjs';

const uri = process.env.MONGODB_URI;
if (!uri) {
	console.error('Set MONGODB_URI (and optionally MONGODB_DB).');
	process.exit(1);
}
const client = new MongoClient(uri);
try {
	await client.connect();
	const health = await recorderHealth(client.db(process.env.MONGODB_DB || 'chaal'));
	console.log(JSON.stringify(health, null, 2));
	const attention =
		health.failed || health.repeatedlyRetrying.length || health.unaccountedHands.length || health.keptForRebuild;
	if (attention) {
		console.error('Recorder needs attention (see failed, repeatedlyRetrying, unaccountedHands, keptForRebuild).');
		process.exitCode = 1;
	}
} finally {
	await client.close();
}
