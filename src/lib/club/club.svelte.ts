import { browser } from '$app/env';
import { serverConfigError, serverURL } from '#lib/config.js';

export interface Member {
	memberId: string;
	playerId: string;
	nickname: string;
	characterId: string;
	role: 'owner' | 'member';
	reducedMotion: boolean;
	onboarded: boolean;
}
export type ProfileChange = Partial<Pick<Member, 'nickname' | 'characterId' | 'reducedMotion'>>;

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
		const headers = new Headers(init.headers);
		headers.set('Content-Type', 'application/json');
		if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
		const response = await fetch(`${serverURL}${path}`, { ...init, headers });
		const body = await response.json().catch(() => ({}));
		return { response, body };
	}

	private accept(member: Member) {
		this.member = member;
		this.status = 'signedIn';
		this.notice = '';
		write(memberKey, JSON.stringify(member));
		applyMotion(member.reducedMotion);
	}

	async refresh() {
		try {
			const { response, body } = await this.call('/me');
			if (response.status === 401 || response.status === 403) return this.expire(body);
			if (response.ok && body.member) this.accept(body.member);
			else if (!this.member) this.status = 'signedOut';
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
			return true;
		} catch {
			this.notice = 'Can’t reach the club right now. Check your connection and try again.';
			return false;
		} finally {
			this.busy = false;
		}
	}

	async save(change: ProfileChange, onboard = false): Promise<string | null> {
		this.busy = true;
		try {
			const { response, body } = await this.call('/me', {
				method: 'POST',
				body: JSON.stringify({ profile: change, onboard })
			});
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
