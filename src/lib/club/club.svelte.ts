import { browser } from '$app/env';
import { serverConfigError, serverURL } from '#lib/config.js';
import { track } from '#lib/analytics.js';
import { MASCOT_SIZE, isMascotSize } from '#lib/mascots/size.js';

export interface Member {
	memberId: string;
	playerId: string;
	nickname: string;
	characterId: string;
	/** Personal mascot drawn from their photo, linked by the owner. */
	mascotId?: string | null;
	photoDataUrl?: string | null;
	role: 'owner' | 'member';
	reducedMotion: boolean;
	onboarded: boolean;
}
export type ProfileChange = Partial<
	Pick<Member, 'nickname' | 'characterId' | 'reducedMotion' | 'photoDataUrl'>
>;

/** Club-wide choices an owner makes on the Admin page. */
export interface ClubSettings {
	table: { chips: number; boot: number; potLimit: number };
	look: {
		felt: 'emerald' | 'sapphire' | 'crimson' | 'onyx';
		cardBack: 'navy' | 'crimson' | 'forest';
	};
	/** Drawn sprite size in pixels; missing on older cached settings. */
	mascotSize?: number;
	/** Tonight's games in play order; empty means any game. */
	lineup?: string[];
	/** Hands each lineup game is played for; 0 means one round. */
	lineupHands?: number;
}
export const DEFAULT_CLUB_SETTINGS: ClubSettings = {
	table: { chips: 1000, boot: 10, potLimit: 128 },
	look: { felt: 'emerald', cardBack: 'navy' },
	mascotSize: MASCOT_SIZE.default
};
/** Last known club settings, so the table opens in the chosen look before the server answers. */
const settingsKey = 'chaal-club-settings-v1';

const tokenKey = 'chaal-club-session-v1';
/** Last known profile, so a returning friend sees their name at once instead of a blank form. */
const memberKey = 'chaal-club-member-v1';

function read(key: string) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function write(key: string, value: string | null) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		/* Sign-in lasts for this tab when storage is blocked. */
	}
}

const messages: Record<string, string> = {
	NOT_INVITED:
		'This Google account isn’t on the club’s guest list. Try the account you were invited with.',
	WRONG_ACCOUNT: 'Your invite is linked to a different Google account. Sign in with that one.',
	SUSPENDED: 'Your club access is paused. Ask the club owner.',
	SIGN_IN: 'Your sign-in expired. Sign in again to pick up where you left off.'
};

/** Who is signed in on this device. The server decides membership; this only remembers it. */
class Club {
	status = $state<'loading' | 'signedOut' | 'signedIn'>('loading');
	member = $state<Member | null>(null);
	members = $state<
		Pick<
			Member,
			'memberId' | 'playerId' | 'nickname' | 'characterId' | 'mascotId' | 'photoDataUrl'
		>[]
	>([]);
	settings = $state<ClubSettings>(DEFAULT_CLUB_SETTINGS);
	/** Why the last sign-in ended or failed, in words for the sign-in card. */
	notice = $state('');
	busy = $state(false);
	token: string | undefined;
	private signOutListeners = new Set<() => void>();
	private started = false;

	onSignOut(listener: () => void) {
		this.signOutListeners.add(listener);
	}

	/** Restore the saved sign-in and confirm it with the server in the background. */
	start() {
		if (!browser || this.started) return;
		this.started = true;
		this.token = read(tokenKey) ?? undefined;
		try {
			const cachedSettings = JSON.parse(read(settingsKey) ?? 'null');
			if (cachedSettings?.look && cachedSettings?.table) this.applySettings(cachedSettings);
		} catch {
			/* Defaults until the server answers. */
		}
		if (!this.token) {
			this.status = 'signedOut';
			return;
		}
		try {
			const cached = JSON.parse(read(memberKey) ?? 'null');
			if (cached?.memberId) {
				this.member = cached;
				this.status = 'signedIn';
			}
		} catch {
			/* Wait for the server instead. */
		}
		void this.refresh();
	}

	private async call(path: string, init: RequestInit = {}) {
		if (!serverURL) throw new Error(serverConfigError);
		const requestToken = this.token;
		const headers = new Headers(init.headers);
		headers.set('Content-Type', 'application/json');
		if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
		const response = await fetch(`${serverURL}${path}`, { ...init, headers });
		const body = await response.json().catch(() => ({}));
		if (
			response.ok &&
			requestToken === this.token &&
			Array.isArray(body.members) &&
			body.members.every(
				(entry: Record<string, unknown>) =>
					typeof entry.memberId === 'string' && !('email' in entry)
			)
		)
			this.members = body.members;
		return { response, body };
	}

	private accept(member: Member) {
		this.member = member;
		this.status = 'signedIn';
		this.notice = '';
		write(memberKey, JSON.stringify(member));
		applyMotion(member.reducedMotion);
	}

	private settingsRevision = 0;
	applySettings(settings: ClubSettings) {
		this.settingsRevision++;
		this.settings = {
			...settings,
			mascotSize: isMascotSize(settings.mascotSize) ? settings.mascotSize : MASCOT_SIZE.default
		};
		write(settingsKey, JSON.stringify(this.settings));
	}

	/** Keep open tables in sync with owner changes without a page reload. */
	watchSettings() {
		let stopped = false;
		let pending = false;
		const refresh = async () => {
			if (
				pending ||
				stopped ||
				document.visibilityState !== 'visible' ||
				this.status !== 'signedIn'
			)
				return;
			pending = true;
			const token = this.token;
			const revision = this.settingsRevision;
			try {
				const { response, body } = await this.call('/club/settings');
				if (
					!stopped &&
					token === this.token &&
					revision === this.settingsRevision &&
					response.ok &&
					body.settings
				) {
					this.applySettings(body.settings);
					if (body.member) this.accept(body.member);
				}
			} catch {
				/* Keep the last confirmed size while offline. */
			} finally {
				pending = false;
			}
		};
		void refresh();
		const timer = setInterval(refresh, 15_000);
		document.addEventListener('visibilitychange', refresh);
		return () => {
			stopped = true;
			clearInterval(timer);
			document.removeEventListener('visibilitychange', refresh);
		};
	}

	/** A signed-in request to the club server, for owner tools such as the Admin page. */
	async request(path: string, init: RequestInit = {}) {
		return this.call(path, init);
	}

	async refresh() {
		const requestToken = this.token;
		try {
			const { response, body } = await this.call('/me');
			if (requestToken !== this.token) return;
			if (response.status === 401 || response.status === 403) return this.expire(body);
			if (response.ok && body.member) {
				this.accept(body.member);
				if (body.settings) this.applySettings(body.settings);
			} else if (!this.member) this.status = 'signedOut';
		} catch {
			// Offline: keep a cached profile; the game connection retries on its own.
			if (!this.member) {
				this.status = 'signedOut';
				this.notice = 'Can’t reach the club right now. Check your connection and try again.';
			}
		}
	}

	/** Exchange a Google ID token for club membership. */
	async signIn(credential: string) {
		this.busy = true;
		this.notice = '';
		try {
			const previous = this.member?.memberId;
			const { response, body } = await this.call('/auth/google', {
				method: 'POST',
				body: JSON.stringify({ credential })
			});
			if (!response.ok || !body.clubToken) {
				this.notice = messages[body.code] ?? body.error ?? 'Sign-in failed. Try again.';
				return false;
			}
			// A different friend on this device must not inherit the last one's table.
			if (previous && previous !== body.member.memberId) this.clearLocal();
			this.token = body.clubToken;
			write(tokenKey, body.clubToken);
			this.accept(body.member);
			await this.refresh();
			if (this.status === 'signedIn') track('login', { method: 'Google' });
			return this.status === 'signedIn';
		} catch {
			this.notice = 'Can’t reach the club right now. Check your connection and try again.';
			return false;
		} finally {
			this.busy = false;
		}
	}

	async save(change: ProfileChange, onboard = false): Promise<string | null> {
		const savingToken = this.token;
		this.busy = true;
		try {
			const { response, body } = await this.call('/me', {
				method: 'POST',
				body: JSON.stringify({ profile: change, onboard })
			});
			if (savingToken !== this.token) return 'Your account changed. Open your profile again.';
			if (response.status === 401) {
				this.expire(body);
				return body.error ?? 'Sign in again';
			}
			if (!response.ok) return body.error ?? 'Could not save. Try again.';
			this.accept(body.member);
			return null;
		} catch {
			return 'Can’t reach the club right now. Try again.';
		} finally {
			this.busy = false;
		}
	}

	private clearLocal() {
		for (const listener of this.signOutListeners) listener();
		try {
			for (const key of Object.keys(sessionStorage))
				if (key.startsWith('chaal-pending-')) sessionStorage.removeItem(key);
		} catch {
			/* Nothing staged. */
		}
	}

	signOut(notice = '') {
		this.token = undefined;
		this.member = null;
		this.members = [];
		write(tokenKey, null);
		write(memberKey, null);
		this.clearLocal();
		this.status = 'signedOut';
		this.notice = notice;
		applyMotion(false);
		try {
			// Stop Google from silently picking the same account next time.
			(window as unknown as { google?: GoogleIdentity }).google?.accounts.id.disableAutoSelect();
		} catch {
			/* Google script not loaded. */
		}
	}

	/** The server no longer accepts this sign-in (expired, suspended, removed). */
	expire(reason?: { code?: string; error?: string; message?: string }) {
		if (this.status === 'signedOut') return;
		this.signOut(
			messages[reason?.code ?? 'SIGN_IN'] ?? reason?.error ?? reason?.message ?? messages.SIGN_IN
		);
	}
}

export interface GoogleIdentity {
	accounts: {
		id: {
			initialize(options: Record<string, unknown>): void;
			renderButton(element: HTMLElement, options: Record<string, unknown>): void;
			disableAutoSelect(): void;
		};
	};
}

function applyMotion(reduced: boolean) {
	if (!browser) return;
	if (reduced) document.documentElement.dataset.reducedMotion = '';
	else delete document.documentElement.dataset.reducedMotion;
}

export const club = new Club();
