import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEMA_VERSION = 2;

export const RETENTION_POLICY = Object.freeze({
	smallRoomDays: 30,
	roomDays: 365,
	receiptDays: 30,
	ledgerDays: 365,
	sessionDays: 365
});

function hasColumn(db, table, column) {
	return db
		.prepare(`PRAGMA table_info(${table})`)
		.all()
		.some((row) => row.name === column);
}

export class Store {
	constructor(filename, { clock = Date.now } = {}) {
		if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
		this.db = new DatabaseSync(filename);
		this.clock = clock;
		this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, player_id TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS rooms (name TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (player_id TEXT NOT NULL, command_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(player_id,command_id));
      CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY, room TEXT NOT NULL, hand_id TEXT, revision INTEGER NOT NULL, kind TEXT NOT NULL, entries TEXT NOT NULL, created_at INTEGER NOT NULL);`);

		const currentVersion = this.db.prepare('PRAGMA user_version').get().user_version;
		if (currentVersion > SCHEMA_VERSION) {
			this.db.close();
			throw new Error(`Database schema ${currentVersion} is newer than this service supports`);
		}

		this.db.exec('BEGIN IMMEDIATE');
		try {
			if (!hasColumn(this.db, 'sessions', 'last_seen_at'))
				this.db.exec('ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0');
			if (!hasColumn(this.db, 'rooms', 'updated_at'))
				this.db.exec('ALTER TABLE rooms ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0');
			if (!hasColumn(this.db, 'receipts', 'room'))
				this.db.exec('ALTER TABLE receipts ADD COLUMN room TEXT');
			if (!hasColumn(this.db, 'receipts', 'created_at'))
				this.db.exec('ALTER TABLE receipts ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');

			if (currentVersion < SCHEMA_VERSION) {
				// Give legacy records a full retention window instead of expiring them on upgrade.
				const migratedAt = this.clock();
				this.db.prepare('UPDATE sessions SET last_seen_at=? WHERE last_seen_at=0').run(migratedAt);
				this.db.prepare('UPDATE rooms SET updated_at=? WHERE updated_at=0').run(migratedAt);
				this.db.prepare('UPDATE receipts SET created_at=? WHERE created_at=0').run(migratedAt);
			}

			this.db.exec(`
        CREATE INDEX IF NOT EXISTS rooms_updated_at_idx ON rooms(updated_at);
        CREATE INDEX IF NOT EXISTS receipts_created_at_idx ON receipts(created_at);
        CREATE INDEX IF NOT EXISTS receipts_room_idx ON receipts(room);
        CREATE INDEX IF NOT EXISTS ledger_created_at_idx ON ledger(created_at);
        PRAGMA user_version=${SCHEMA_VERSION};
      `);
			this.db.exec('COMMIT');
		} catch (error) {
			this.db.exec('ROLLBACK');
			this.db.close();
			throw error;
		}
	}

	checkReadiness() {
		return this.db.prepare('PRAGMA quick_check(1)').get()?.quick_check === 'ok';
	}
	session(hash) {
		const row = this.db.prepare('SELECT player_id FROM sessions WHERE hash=?').get(hash);
		if (!row) return undefined;
		this.db.prepare('UPDATE sessions SET last_seen_at=? WHERE hash=?').run(this.clock(), hash);
		return row.player_id;
	}
	createSession(hash, id) {
		this.db
			.prepare('INSERT INTO sessions(hash,player_id,last_seen_at) VALUES (?,?,?)')
			.run(hash, id, this.clock());
	}
	room(name) {
		const row = this.db.prepare('SELECT snapshot FROM rooms WHERE name=?').get(name);
		return row ? JSON.parse(row.snapshot) : null;
	}
	rooms() {
		return this.db
			.prepare('SELECT snapshot FROM rooms')
			.all()
			.map((row) => JSON.parse(row.snapshot));
	}
	receipt(id, command) {
		const row = this.db
			.prepare('SELECT * FROM receipts WHERE player_id=? AND command_id=?')
			.get(id, command);
		return row ? { ...row, result: JSON.parse(row.result) } : null;
	}
	commit(room, id, command, fingerprint, result, movement, expectedRevision) {
		const committedAt = this.clock();
		this.db.exec('BEGIN IMMEDIATE');
		try {
			const current = this.db.prepare('SELECT snapshot FROM rooms WHERE name=?').get(room.name);
			if (
				expectedRevision === null
					? !!current
					: !current || JSON.parse(current.snapshot).revision !== expectedRevision
			) {
				const conflict = new Error('Room changed before commit');
				conflict.code = 'PERSISTENCE_CONFLICT';
				throw conflict;
			}
			this.db
				.prepare(
					'INSERT INTO rooms(name,snapshot,updated_at) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET snapshot=excluded.snapshot, updated_at=excluded.updated_at'
				)
				.run(room.name, JSON.stringify(room), committedAt);
			this.db
				.prepare(
					'INSERT INTO receipts(player_id,command_id,fingerprint,result,room,created_at) VALUES (?,?,?,?,?,?)'
				)
				.run(id, command, fingerprint, JSON.stringify(result), room.name, committedAt);
			if (movement)
				this.db
					.prepare(
						'INSERT INTO ledger(room,hand_id,revision,kind,entries,created_at) VALUES (?,?,?,?,?,?)'
					)
					.run(
						room.name,
						room.handId,
						room.revision,
						movement.kind,
						JSON.stringify(movement.entries),
						committedAt
					);
			this.db.exec('COMMIT');
		} catch (error) {
			this.db.exec('ROLLBACK');
			throw error;
		}
	}
	cleanupRetention({ now = this.clock(), connectedRooms = new Set() } = {}) {
		const before = {
			smallRoom: now - RETENTION_POLICY.smallRoomDays * DAY_MS,
			room: now - RETENTION_POLICY.roomDays * DAY_MS,
			receipt: now - RETENTION_POLICY.receiptDays * DAY_MS,
			ledger: now - RETENTION_POLICY.ledgerDays * DAY_MS,
			session: now - RETENTION_POLICY.sessionDays * DAY_MS
		};
		const removed = { rooms: 0, receipts: 0, ledger: 0, sessions: 0 };
		this.db.exec('BEGIN IMMEDIATE');
		try {
			const rows = this.db.prepare('SELECT name,snapshot,updated_at FROM rooms').all();
			const expiredRooms = [];
			for (const row of rows) {
				if (connectedRooms.has(row.name)) continue;
				const snapshot = JSON.parse(row.snapshot);
				if (snapshot.isStarted === true && snapshot.gameShow !== true) continue;
				const joinerIds = new Set(
					(Array.isArray(snapshot.players) ? snapshot.players : [])
						.map((player) => player?.id)
						.filter((id) => typeof id === 'string')
				);
				const cutoff = joinerIds.size < 3 ? before.smallRoom : before.room;
				if (row.updated_at <= cutoff) expiredRooms.push(row.name);
			}

			const deleteRoom = this.db.prepare('DELETE FROM rooms WHERE name=?');
			const deleteRoomReceipts = this.db.prepare('DELETE FROM receipts WHERE room=?');
			const deleteRoomLedger = this.db.prepare('DELETE FROM ledger WHERE room=?');
			for (const name of expiredRooms) {
				deleteRoom.run(name);
				removed.rooms++;
				removed.receipts += Number(deleteRoomReceipts.run(name).changes);
				removed.ledger += Number(deleteRoomLedger.run(name).changes);
			}

			removed.receipts += Number(
				this.db.prepare('DELETE FROM receipts WHERE created_at <= ?').run(before.receipt).changes
			);
			removed.ledger += Number(
				this.db.prepare('DELETE FROM ledger WHERE created_at <= ?').run(before.ledger).changes
			);

			const retainedPlayerIds = new Set();
			for (const row of this.db.prepare('SELECT snapshot FROM rooms').all()) {
				const snapshot = JSON.parse(row.snapshot);
				for (const player of Array.isArray(snapshot.players) ? snapshot.players : [])
					if (typeof player?.id === 'string') retainedPlayerIds.add(player.id);
			}
			const oldSessions = this.db
				.prepare('SELECT hash,player_id FROM sessions WHERE last_seen_at <= ?')
				.all(before.session);
			const deleteSession = this.db.prepare('DELETE FROM sessions WHERE hash=?');
			for (const session of oldSessions) {
				if (!retainedPlayerIds.has(session.player_id)) {
					removed.sessions += Number(deleteSession.run(session.hash).changes);
				}
			}
			this.db.exec('COMMIT');
			return removed;
		} catch (error) {
			this.db.exec('ROLLBACK');
			throw error;
		}
	}
	close() {
		try {
			// Flush committed WAL pages when possible; SQLite retains a valid WAL if readers block truncation.
			this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
		} finally {
			this.db.close();
		}
	}
}
