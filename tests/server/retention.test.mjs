import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store, RETENTION_POLICY } from '../../server/store.mjs';

const DAY = 24 * 60 * 60 * 1000;
const now = 2_000_000_000_000;

function snapshot(name, ids, overrides = {}) {
	return {
		name,
		players: ids.map((id) => ({ id })),
		isStarted: false,
		gameShow: false,
		revision: 1,
		handId: null,
		...overrides
	};
}

function saveRoom(store, room, command) {
	store.commit(
		room,
		room.players[0]?.id ?? 'system',
		command,
		command,
		{ ok: true, roomName: room.name },
		{ kind: 'test', entries: [] },
		null
	);
}

test('schema migration preserves legacy data and gives it a full retention grace period', async (t) => {
	const dir = await mkdtemp(path.join(tmpdir(), 'chaal-retention-migration-'));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const filename = path.join(dir, 'legacy.sqlite');
	const legacy = new DatabaseSync(filename);
	legacy.exec(`
    PRAGMA user_version=1;
    CREATE TABLE sessions (hash TEXT PRIMARY KEY, player_id TEXT NOT NULL UNIQUE);
    CREATE TABLE rooms (name TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
    CREATE TABLE receipts (player_id TEXT NOT NULL, command_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(player_id,command_id));
    CREATE TABLE ledger (id INTEGER PRIMARY KEY, room TEXT NOT NULL, hand_id TEXT, revision INTEGER NOT NULL, kind TEXT NOT NULL, entries TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
	legacy.prepare('INSERT INTO sessions VALUES (?,?)').run('session-hash', 'player-one');
	legacy
		.prepare('INSERT INTO rooms VALUES (?,?)')
		.run('old-room', JSON.stringify(snapshot('old-room', ['player-one', 'player-two'])));
	legacy
		.prepare('INSERT INTO receipts VALUES (?,?,?,?)')
		.run('player-one', 'command-one', 'fingerprint', JSON.stringify({ ok: true }));
	legacy
		.prepare(
			'INSERT INTO ledger(room,hand_id,revision,kind,entries,created_at) VALUES (?,?,?,?,?,?)'
		)
		.run('old-room', null, 1, 'legacy', '[]', 1);
	legacy.close();

	const store = new Store(filename, { clock: () => now });
	t.after(() => store.close());
	assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 2);
	assert.equal(store.session('session-hash'), 'player-one');
	assert.equal(store.db.prepare('SELECT last_seen_at FROM sessions').get().last_seen_at, now);
	assert.equal(store.db.prepare('SELECT updated_at FROM rooms').get().updated_at, now);
	assert.equal(store.receipt('player-one', 'command-one').result.ok, true);
	assert.equal(store.db.prepare('SELECT room,created_at FROM receipts').get().room, null);
	assert.equal(store.db.prepare('SELECT created_at FROM receipts').get().created_at, now);
	assert.equal(store.db.prepare('SELECT count(*) AS count FROM ledger').get().count, 1);
});

test('retention deletes inactive rooms by historical joiner count and protects live or in-progress rooms', (t) => {
	const store = new Store(':memory:', { clock: () => now });
	t.after(() => store.close());
	const sessions = [
		'small-a',
		'small-b',
		'group-a',
		'group-b',
		'group-c',
		'old-group-a',
		'old-group-b',
		'old-group-c',
		'connected-a',
		'connected-b',
		'playing-a',
		'playing-b',
		'no-room'
	];
	sessions.forEach((id, index) => store.createSession(`hash-${index}`, id));

	saveRoom(store, snapshot('small', ['small-a', 'small-b']), 'create-small');
	saveRoom(store, snapshot('group', ['group-a', 'group-b', 'group-c']), 'create-group');
	saveRoom(
		store,
		snapshot('old-group', ['old-group-a', 'old-group-b', 'old-group-c']),
		'create-old-group'
	);
	saveRoom(store, snapshot('connected', ['connected-a', 'connected-b']), 'create-connected');
	saveRoom(
		store,
		snapshot('playing', ['playing-a', 'playing-b'], { isStarted: true, gameShow: false }),
		'create-playing'
	);

	store.db.prepare('UPDATE rooms SET updated_at=? WHERE name=?').run(now - 31 * DAY, 'small');
	store.db.prepare('UPDATE rooms SET updated_at=? WHERE name=?').run(now - 31 * DAY, 'group');
	store.db.prepare('UPDATE rooms SET updated_at=? WHERE name=?').run(now - 366 * DAY, 'old-group');
	store.db.prepare('UPDATE rooms SET updated_at=? WHERE name=?').run(now - 31 * DAY, 'connected');
	store.db.prepare('UPDATE rooms SET updated_at=? WHERE name=?').run(now - 400 * DAY, 'playing');
	store.db.prepare('UPDATE sessions SET last_seen_at=?').run(now - 400 * DAY);
	store.db
		.prepare(
			'INSERT INTO receipts(player_id,command_id,fingerprint,result,room,created_at) VALUES (?,?,?,?,?,?)'
		)
		.run('no-room', 'expired-receipt', 'expired', '{}', null, now - 31 * DAY);
	store.db
		.prepare(
			'INSERT INTO receipts(player_id,command_id,fingerprint,result,room,created_at) VALUES (?,?,?,?,?,?)'
		)
		.run('no-room', 'recent-receipt', 'recent', '{}', null, now);
	store.db.prepare('UPDATE ledger SET created_at=? WHERE room=?').run(now - 366 * DAY, 'group');
	store.db.prepare('UPDATE ledger SET created_at=? WHERE room=?').run(now - 366 * DAY, 'old-group');

	const removed = store.cleanupRetention({ now, connectedRooms: new Set(['connected']) });
	assert.deepEqual(removed, { rooms: 2, receipts: 3, ledger: 3, sessions: 6 });
	assert.equal(store.room('small'), null);
	assert.ok(store.room('group'));
	assert.equal(store.room('old-group'), null);
	assert.ok(store.room('connected'));
	assert.ok(store.room('playing'));
	assert.equal(
		store.db
			.prepare('SELECT count(*) AS count FROM receipts WHERE command_id=?')
			.get('recent-receipt').count,
		1
	);
	assert.equal(
		store.db.prepare('SELECT count(*) AS count FROM ledger WHERE room=?').get('group').count,
		0
	);
	assert.equal(
		store.db.prepare('SELECT count(*) AS count FROM sessions WHERE player_id=?').get('group-a')
			.count,
		1
	);
	assert.equal(
		store.db.prepare('SELECT count(*) AS count FROM sessions WHERE player_id=?').get('old-group-a')
			.count,
		0
	);
	assert.equal(
		store.db.prepare('SELECT count(*) AS count FROM sessions WHERE player_id=?').get('playing-a')
			.count,
		1
	);
	assert.equal(RETENTION_POLICY.smallRoomDays, 30);
	assert.equal(RETENTION_POLICY.roomDays, 365);
});
