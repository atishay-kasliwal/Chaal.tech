/** Explicit operator command: publish version 3 of each active character. Idempotent.
 *   npm run bots:publish-v3     (needs MONGODB_ADMIN_URI) */
import { MongoClient } from 'mongodb';
import { publishV3 } from '../server/bots/v3.mjs';

if (!process.env.MONGODB_ADMIN_URI) throw new Error('Set MONGODB_ADMIN_URI; no production action is automatic.');
const client = new MongoClient(process.env.MONGODB_ADMIN_URI);
try {
	await client.connect();
	const db = client.db(process.env.MONGODB_DB || 'chaal');
	const owner = await db.collection('members').findOne({ role: 'owner', status: { $ne: 'suspended' } });
	if (!owner) throw new Error('No owner member found');
	console.log(JSON.stringify(await publishV3(db, owner, { log: console.log }), null, 2));
} finally {
	await client.close();
}
