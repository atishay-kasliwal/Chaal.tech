import { browser } from '$app/env';
import { club } from '#lib/club/club.svelte.js';
import { SHEET_CELLS } from './catalog.js';
export { SHEET_CELLS } from './catalog.js';

/**
 * Personal mascots: each friend drawn as aligned 3x3 sprite sheets, served from
 * static/mascots/<id>/<outfit>/<sheet>.webp. `directions` holds nine head turns; every
 * other sheet holds nine expressions. The manifest lists which sheets exist so far, and
 * an expression that isn't drawn yet falls back to the closest one that is.
 */
export type Manifest = Record<string, Record<string, string[]>>;
export type Direction =
	'up-left' | 'up' | 'up-right' | 'left' | 'center' | 'right' | 'down-left' | 'down' | 'down-right';

export const OUTFITS = [
	'signature',
	'tshirt',
	'formal',
	'diwali',
	'wedding',
	'winter',
	'cricket',
	'party',
	'vacation',
	'gym'
] as const;

/** When an expression isn't drawn yet, the closest ones that might be. */
const FALLBACKS: Record<string, string[]> = {
	blind: ['bashful'],
	cry: ['dizzy', 'surprised'],
	angry: ['dizzy', 'surprised'],
	smug: ['bashful', 'delighted'],
	nervous: ['surprised'],
	thinking: [],
	laugh: ['delighted'],
	shocked: ['surprised'],
	rich: ['starstruck', 'delighted']
};

class Mascots {
	manifest = $state<Manifest>({});
	ready = $state(false);
	private loading = false;

	load() {
		if (!browser || this.loading) return;
		this.loading = true;
		fetch('/mascots/manifest.json', { cache: 'no-cache' })
			.then((response) => (response.ok ? response.json() : {}))
			.then((manifest: Manifest) => (this.manifest = manifest ?? {}))
			.catch(() => {})
			.finally(() => (this.ready = true));
	}

	has(id: string | null | undefined): id is string {
		return !!id && !!this.manifest[id]?.signature?.includes('directions');
	}

	/** Outfits drawn far enough to wear (they have their head turns). */
	outfits(id: string): string[] {
		return OUTFITS.filter((outfit) => this.manifest[id]?.[outfit]?.includes('directions'));
	}

	private look(id: string, outfit: string) {
		return this.manifest[id]?.[outfit]?.includes('directions') ? outfit : 'signature';
	}

	sheet(id: string, outfit: string, name: string): string | null {
		const look = this.look(id, outfit);
		return this.manifest[id]?.[look]?.includes(name) ? `/mascots/${id}/${look}/${name}.webp` : null;
	}

	/** Expression sheets for this outfit, in a stable order. */
	sheets(id: string, outfit: string) {
		const look = this.look(id, outfit);
		return (this.manifest[id]?.[look] ?? [])
			.filter((name) => name !== 'directions' && SHEET_CELLS[name])
			.map((name) => ({ name, url: `/mascots/${id}/${look}/${name}.webp` }));
	}
}

export const mascots = new Mascots();

/** The sheet and cell that show an expression, or null if nothing close is drawn. */
export function sheetCell(id: string, outfit: string, reaction: string) {
	for (const candidate of [reaction, ...(FALLBACKS[reaction] ?? [])]) {
		for (const [name, cells] of Object.entries(SHEET_CELLS)) {
			const index = cells.indexOf(candidate);
			const url = index === -1 ? null : mascots.sheet(id, outfit, name);
			if (url) return { url, index };
		}
	}
	return null;
}

/** The mascot linked to a player, if the owner has linked one and its art exists. */
export function mascotFor(playerId: string | undefined): string | null {
	if (!playerId) return null;
	const member =
		club.member?.playerId === playerId
			? club.member
			: club.members.find((candidate) => candidate.playerId === playerId);
	return mascots.has(member?.mascotId) ? member!.mascotId! : null;
}

export const pick = <T>(options: readonly T[]) =>
	options[Math.floor(Math.random() * options.length)];

/** Short reactions on top of a seat's resting face, keyed by player. */
class Reactions {
	byPlayer = $state<Record<string, { pose: string; key: number }>>({});
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private nextKey = 1;

	show(playerId: string | undefined, pose: string, ms = 2600) {
		if (!playerId) return;
		clearTimeout(this.timers.get(playerId));
		this.byPlayer[playerId] = { pose, key: this.nextKey++ };
		this.timers.set(
			playerId,
			setTimeout(() => {
				delete this.byPlayer[playerId];
				this.timers.delete(playerId);
			}, ms)
		);
	}

	clear() {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
		this.byPlayer = {};
	}
}

export const reactions = new Reactions();
