import { GameError } from '../engine.mjs';

/** A private table: at most this many different people can be emailed per room. */
export const MAX_ROOM_INVITES = 10;
/** The same address is not emailed again within this window. */
export const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Clean, de-duplicate and validate the addresses a player typed. */
export function inviteEmails(input) {
	if (!Array.isArray(input) || input.length === 0)
		throw new GameError('Add at least one email address', 'INVALID_INVITE');
	if (input.length > MAX_ROOM_INVITES)
		throw new GameError(`Invite up to ${MAX_ROOM_INVITES} people at a time`, 'INVALID_INVITE');
	const emails = [];
	for (const value of input) {
		const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
		if (email.length > 254 || !EMAIL.test(email))
			throw new GameError(
				`“${String(value).slice(0, 60)}” is not a valid email address`,
				'INVALID_INVITE'
			);
		if (!emails.includes(email)) emails.push(email);
	}
	return emails;
}

/**
 * Decide who gets an email now. `previous` is the room's invite record:
 * [{ email, at, by }]. Returns the addresses to send and the next record.
 */
export function planInvites(previous, emails, playerId, now) {
	const record = Array.isArray(previous) ? previous.map((entry) => ({ ...entry })) : [];
	const send = [];
	const skipped = [];
	for (const email of emails) {
		const existing = record.find((entry) => entry.email === email);
		if (existing) {
			if (now - existing.at < RESEND_COOLDOWN_MS) {
				skipped.push(email);
				continue;
			}
			existing.at = now;
			existing.by = playerId;
		} else {
			if (record.length >= MAX_ROOM_INVITES)
				throw new GameError(
					`This table can invite ${MAX_ROOM_INVITES} people by email; share the link with anyone else`,
					'INVITE_LIMIT'
				);
			record.push({ email, at: now, by: playerId });
		}
		send.push(email);
	}
	return { send, skipped, record };
}

const escapeHtml = (value) =>
	String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The email itself: short, readable on a phone, one obvious button. */
export function inviteMessage({ inviter, link, boot, buyIn }) {
	const name = inviter.trim() || 'A friend';
	const stakes = `Buy-in ₹${buyIn.toLocaleString('en-IN')} · boot ₹${boot}`;
	const subject = `${name} invited you to Teen Patti on Chaal`;
	const text = `${name} saved you a seat at their Teen Patti table.\n\n${stakes}\n\nJoin here: ${link}\n\nVideo and voice work right in the browser — no app needed.`;
	const html = `<!doctype html>
<html><body style="margin:0;background:#0c1411;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#f1ebdc">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c1411;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#14221c;border-radius:18px;border:1px solid #3a3420">
<tr><td style="padding:32px 28px 8px;text-align:center">
<div style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:12px;background:#e2b862;color:#1c1408;font-size:22px">♠</div>
<h1 style="margin:18px 0 6px;font-size:22px;color:#f4d68c">${escapeHtml(name)} saved you a seat</h1>
<p style="margin:0;font-size:15px;color:#cfc8b6">Teen Patti with friends, on video.</p>
<p style="margin:14px 0 0;font-size:13px;color:#a59f8f">${escapeHtml(stakes)}</p>
</td></tr>
<tr><td style="padding:24px 28px;text-align:center">
<a href="${escapeHtml(link)}" style="display:inline-block;background:#e2b862;color:#24180a;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:999px">Join the table</a>
</td></tr>
<tr><td style="padding:0 28px 28px;text-align:center;font-size:12px;color:#8a8576">
Or open this link: <a href="${escapeHtml(link)}" style="color:#e2b862;word-break:break-all">${escapeHtml(link)}</a><br><br>
You got this because ${escapeHtml(name)} entered your address at chaal.tech. No account or app needed.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
	return { subject, text, html };
}

/** Send one email per person (so nobody sees the other addresses) in a single Resend call. */
export async function sendWithResend({ apiKey, from, emails, message, fetcher = fetch }) {
	const response = await fetcher('https://api.resend.com/emails/batch', {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(
			emails.map((email) => ({
				from,
				to: [email],
				subject: message.subject,
				html: message.html,
				text: message.text
			}))
		),
		signal: AbortSignal.timeout(8000)
	});
	if (!response.ok) throw new Error(`Resend rejected the invite (${response.status})`);
}
