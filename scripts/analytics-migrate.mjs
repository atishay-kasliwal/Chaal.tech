/**
 * Create or update the hand recorder's MongoDB collections, validators and indexes, and publish
 * the code-defined bot styles. Idempotent. Run by a person with an admin connection, never by the
 * Worker (whose account needs only read/write on documents):
 *   MONGODB_ADMIN_URI=... npm run analytics:migrate
 * See docs/archive/ANALYTICS_OPERATIONS.md for the roles.
 */
import { MongoClient } from 'mongodb';
import { migrateAnalytics, COLLECTIONS, SCHEMA_VERSION } from '../server/analytics/store.mjs';

const uri = process.env.MONGODB_ADMIN_URI;
if (!uri) {
	console.error('Set MONGODB_ADMIN_URI to a connection for a user that may manage this database\'s schema (and optionally MONGODB_DB).');
	process.exit(1);
}
const client = new MongoClient(uri);
try {
	await client.connect();
	const db = client.db(process.env.MONGODB_DB || 'chaal');
	await migrateAnalytics(db);
	console.log(`Analytics schema v${SCHEMA_VERSION} ready in ${db.databaseName}: ${Object.values(COLLECTIONS).join(', ')}`);
} finally {
	await client.close();
}
