/** Explicit operator command: publish the canonical DNA characters (docs/archive/bots/CANONICAL.md).
 *   npm run bots:publish-dna            (plan only)
 *   npm run bots:publish-dna -- --publish [--descriptions]
 * Needs MONGODB_ADMIN_URI. Idempotent: a bot already on its canonical style is skipped. */
import { MongoClient } from 'mongodb';
import { publishDna } from '../server/bots/publish-dna.mjs';

if (!process.env.MONGODB_ADMIN_URI)
	throw new Error('Set MONGODB_ADMIN_URI; no production action is automatic.');
const publish = process.argv.includes('--publish');
const descriptions = process.argv.includes('--descriptions');
const client = new MongoClient(process.env.MONGODB_ADMIN_URI);
try {
	await client.connect();
	const db = client.db(process.env.MONGODB_DB || 'chaal');
	const owner = await db
		.collection('members')
		.findOne({ role: 'owner', status: { $ne: 'suspended' } });
	if (!owner) throw new Error('No owner member found');
	console.log(
		JSON.stringify(
			await publishDna(db, owner, { publish, descriptions, log: console.log }),
			null,
			2
		)
	);
	if (!publish) console.log('Plan only. Run again with --publish to publish.');
} finally {
	await client.close();
}
