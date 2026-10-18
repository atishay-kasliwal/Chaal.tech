/** Explicit operator commands for Phase 5; never invoked during deploy, startup or a member request.
 *   migrate            create the indexes the intelligence views use
 *   export [since]     warehouse rows as NDJSON on stdout (public facts only)
 *   quality            run the data-quality checks and print them */
import { MongoClient } from 'mongodb';
import { migrateIntel } from '../server/analytics/intel/schema.mjs';
import { exportRows, toNdjson } from '../server/analytics/intel/export.mjs';
import { dataQuality } from '../server/analytics/intel/quality.mjs';
import { clubRecords } from '../server/analytics/data.mjs';

const [action, arg] = process.argv.slice(2);
if (!['migrate', 'export', 'quality'].includes(action)) throw new Error('Usage: analytics-intel.mjs migrate | export [sinceMs] | quality');
if (!process.env.MONGODB_ADMIN_URI) throw new Error('Set MONGODB_ADMIN_URI; no production action is automatic.');
const client = new MongoClient(process.env.MONGODB_ADMIN_URI);
try {
	await client.connect();
	const db = client.db(process.env.MONGODB_DB || 'chaal');
	if (action === 'migrate') {
		await migrateIntel(db);
		console.log('Phase 5 indexes ready.');
	}
	if (action === 'export') {
		const records = await clubRecords(db, { since: Number(arg) || 0, limit: 1_000_000 });
		const text = records.flatMap(exportRows);
		if (text.length) console.log(toNdjson(text));
	}
	if (action === 'quality') console.log(JSON.stringify(await dataQuality(db), null, 2));
} finally {
	await client.close();
}
