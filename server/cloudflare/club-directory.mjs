/**
 * One object for the whole club: who has the app open, and which tables are live.
 * Rooms report their public summary here; the lobby reads it. Nothing private is stored.
 */
export const PRESENCE_STALE_MS = 90 * 1000;
/** An empty table drops off the lobby after this; any table after a quiet day. */
const EMPTY_TABLE_STALE_MS = 2 * 60 * 60 * 1000;
const TABLE_STALE_MS = 24 * 60 * 60 * 1000;
/** A table that has not reported for this long is asked for its current state. */
const RECHECK_MS = 10 * 60 * 1000;

const json = (data, status = 200) =>
	new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export function lobbyView(presence, tables, now) {
	const online = [...presence.values()]
		.filter((entry) => now - entry.at <= PRESENCE_STALE_MS)
		.map(({ memberId }) => memberId);
	const live = tables
		.filter((table) => !table.closed)
		.filter(
			(table) =>
				now - table.updatedAt <=
				(table.connectedMembers.length ? TABLE_STALE_MS : EMPTY_TABLE_STALE_MS)
		)
		.sort(
			(a, b) => b.connectedMembers.length - a.connectedMembers.length || b.updatedAt - a.updatedAt
		);
	return { online, tables: live };
}

export class ClubDirectory {
	constructor(ctx, env) {
		this.ctx = ctx;
		this.env = env;
		/** memberId → { memberId, at }. Heartbeats rebuild it within 30s after a restart. */
		this.presence = new Map();
	}

	async fetch(request) {
		const url = new URL(request.url);
		const now = Date.now();
		if (url.pathname === '/heartbeat' && request.method === 'POST') {
			const { memberId } = await request.json();
			if (typeof memberId === 'string') this.presence.set(memberId, { memberId, at: now });
			return json({ ok: true });
		}
		if (url.pathname === '/leave' && request.method === 'POST') {
			const { memberId } = await request.json();
			this.presence.delete(memberId);
			return json({ ok: true });
		}
		if (url.pathname === '/table' && request.method === 'POST') {
			const table = await request.json();
			if (typeof table?.name !== 'string') return json({ error: 'Invalid table' }, 400);
			if (table.closed) await this.ctx.storage.delete(`table:${table.name}`);
			else await this.ctx.storage.put(`table:${table.name}`, { ...table, updatedAt: now });
			return json({ ok: true });
		}
		if (url.pathname === '/lobby' && request.method === 'GET') {
			for (const [id, entry] of this.presence)
				if (now - entry.at > PRESENCE_STALE_MS) this.presence.delete(id);
			const stored = await this.recheck(
				[...(await this.ctx.storage.list({ prefix: 'table:' })).values()],
				now
			);
			const view = lobbyView(this.presence, stored, now);
			// Reconcile: forget tables that went stale instead of carrying them forever.
			const keep = new Set(view.tables.map((table) => table.name));
			const stale = stored
				.filter((table) => !keep.has(table.name))
				.map((table) => `table:${table.name}`);
			if (stale.length) await this.ctx.storage.delete(stale);
			return json(view);
		}
		return json({ error: 'Not found' }, 404);
	}

	/** Refresh quiet tables from the room itself; a room that is gone leaves the lobby. */
	async recheck(tables, now) {
		if (!this.env?.ROOMS) return tables;
		return Promise.all(
			tables.map(async (table) => {
				if (now - Math.max(table.updatedAt, table.checkedAt ?? 0) < RECHECK_MS) return table;
				try {
					const room = this.env.ROOMS.get(this.env.ROOMS.idFromName(table.name));
					const fresh = await (await room.fetch('https://room.internal/lobby-summary')).json();
					if (fresh.closed) {
						await this.ctx.storage.delete(`table:${table.name}`);
						return { ...table, closed: true };
					}
					const updated = {
						...fresh,
						updatedAt: fresh.anyoneConnected ? now : table.updatedAt,
						checkedAt: now
					};
					await this.ctx.storage.put(`table:${table.name}`, updated);
					return updated;
				} catch {
					return table;
				}
			})
		);
	}
}

export function clubDirectory(env) {
	return env.CLUB.get(env.CLUB.idFromName('club'));
}
