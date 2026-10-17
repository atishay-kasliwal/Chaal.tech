/**
 * Replay stored hands from their sealed inputs and check they reproduce exactly.
 *   npm run analytics:replay -- [--room <name>] [--hand <room:handId>] [--limit <n>]
 * Exits 1 if any hand fails to reproduce, cannot be replayed by this code, or lacks its public record.
 */
import { MongoClient } from 'mongodb';
import { verifyStoredHands } from '../server/analytics/store.mjs';

const args = process.argv.slice(2);
const option = (name) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : undefined;
};
const filter = option('hand')
	? { _id: option('hand') }
	: option('room')
		? { _id: { $regex: `^${option('room').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:` } }
		: {};
const uri = process.env.MONGODB_URI;
if (!uri) {
	console.error('Set MONGODB_URI (and optionally MONGODB_DB).');
	process.exit(1);
}
const client = new MongoClient(uri);
try {
	await client.connect();
	const db = client.db(process.env.MONGODB_DB || 'chaal');
	const report = await verifyStoredHands(db, { filter, limit: Number(option('limit') ?? 0) });
	console.log(
		`Checked ${report.checked} hands: ${report.reproduced} reproduced exactly, ${report.compatible} compatibly.`
	);
	for (const miss of report.missingPublic) console.log(`  missing public record: ${miss}`);
	for (const gone of report.unavailable) console.log(`  UNAVAILABLE ${gone.id}: ${gone.reason} (not approximated)`);
	for (const kept of report.keptForRebuild) console.log(`  kept raw, not recorded: ${kept.id} (${kept.status})`);
	for (const bad of report.mismatched) console.log(`  MISMATCH ${bad.id}: ${bad.reason}`);
	if (report.mismatched.length || report.missingPublic.length || report.unavailable.length) process.exitCode = 1;
} finally {
	await client.close();
}
