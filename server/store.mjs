import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
	constructor(filename) {
		if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
		this.db = new DatabaseSync(filename);
		this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, player_id TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS rooms (name TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (player_id TEXT NOT NULL, command_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(player_id,command_id));
      CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY, room TEXT NOT NULL, hand_id TEXT, revision INTEGER NOT NULL, kind TEXT NOT NULL, entries TEXT NOT NULL, created_at INTEGER NOT NULL);
      PRAGMA user_version=1;`);
	}
	checkReadiness() {
		return this.db.prepare('PRAGMA quick_check(1)').get()?.quick_check === 'ok';
	}
	session(hash) {
		return this.db.prepare('SELECT player_id FROM sessions WHERE hash=?').get(hash)?.player_id;
	}
	createSession(hash, id) {
		this.db.prepare('INSERT INTO sessions VALUES (?,?)').run(hash, id);
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
					'INSERT INTO rooms VALUES (?,?) ON CONFLICT(name) DO UPDATE SET snapshot=excluded.snapshot'
				)
				.run(room.name, JSON.stringify(room));
			this.db
				.prepare('INSERT INTO receipts VALUES (?,?,?,?)')
				.run(id, command, fingerprint, JSON.stringify(result));
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
						Date.now()
					);
			this.db.exec('COMMIT');
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
