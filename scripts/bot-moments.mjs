/** Explicit operator command: create the Atlas vector index for bot moments. Never run on a request.
 *   npm run bots:moments:index */
import { MongoClient } from 'mongodb';
import { createAtlasIndex } from '../server/bots/memory/moments.mjs';

if (!process.env.MONGODB_ADMIN_URI) throw new Error('Set MONGODB_ADMIN_URI; no production action is automatic.');
const client = new MongoClient(process.env.MONGODB_ADMIN_URI);
try {
	await client.connect();
	console.log(JSON.stringify(await createAtlasIndex(client.db(process.env.MONGODB_DB || 'chaal'))));
} finally {
	await client.close();
}
