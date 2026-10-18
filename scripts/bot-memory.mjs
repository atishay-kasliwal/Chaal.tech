/** Explicit operator commands; never invoked during deploy, startup or a member request. */
import { MongoClient } from 'mongodb';
import { migrateMemory, rebuildMemory } from '../server/bots/memory/store.mjs';
import { memoryHealth } from '../server/bots/memory/diagnostics.mjs';
const [action, botId] = process.argv.slice(2);
if (!['migrate','rebuild','health'].includes(action)) throw new Error('Usage: bot-memory.mjs migrate | rebuild <botId> | health');
if (!process.env.MONGODB_ADMIN_URI) throw new Error('Set MONGODB_ADMIN_URI; no production action is automatic.');
const client = new MongoClient(process.env.MONGODB_ADMIN_URI);
try {
	await client.connect();
	const db=client.db(process.env.MONGODB_DB || 'chaal');
	if(action==='migrate') {await migrateMemory(db); console.log('Memory schema ready. Rebuild each bot explicitly; publish adaptive styles separately.');}
	if(action==='rebuild') console.log(JSON.stringify(await rebuildMemory(db,{botId}),null,2));
	if(action==='health') console.log(JSON.stringify(await memoryHealth(db),null,2));
} finally {await client.close();}
