import { MongoClient } from 'mongodb';
import { migrateAnalytics } from '../server/analytics/store.mjs';
import { seedCharacters } from '../server/bots/directory.mjs';

if (!process.env.MONGODB_ADMIN_URI)
	throw new Error(
		'Set MONGODB_ADMIN_URI and optionally MONGODB_DB. This migration never runs in a member request.'
	);
const client = new MongoClient(process.env.MONGODB_ADMIN_URI);
try {
	await client.connect();
	const db = client.db(process.env.MONGODB_DB || 'chaal');
	await migrateAnalytics(db);
	await seedCharacters(db);
	console.log(
		`Character bots ready in ${db.databaseName}. Legacy identities and all hands preserved.`
	);
} finally {
	await client.close();
}
