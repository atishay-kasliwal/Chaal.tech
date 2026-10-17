/**
 * Ended tables: the night's summary saved for the club page, and the thank-you email everyone who
 * played gets, in the beta emails' look (server/club/beta-emails.mjs).
 */
export const NIGHTS = 'club_nights';

const escapeHtml = (value) =>
	String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const proper = (name) =>
	String(name ?? '').replace(
		/(^|[\s\-'’.])(\p{Ll})/gu,
		(_, before, letter) => before + letter.toUpperCase()
	);
const rupees = (value) => `₹${Math.abs(value).toLocaleString('en-IN')}`;
const signed = (value) =>
	value > 0 ? `+${rupees(value)}` : value < 0 ? `−${rupees(value)}` : '₹0';

/** Save an ended table's night (one document per table; tables settle up on their own). */
export async function saveNight(db, night) {
	await db.collection(NIGHTS).insertOne({ ...night, savedAt: new Date() });
}

/** The latest nights for the club page: newest first, within the last week. */
export async function recentNights(db, now = Date.now(), limit = 4) {
	const since = new Date(now - 7 * 24 * 60 * 60 * 1000);
	const nights = await db
		.collection(NIGHTS)
		.find({ savedAt: { $gte: since } }, { projection: { _id: 0 } })
		.sort({ savedAt: -1 })
		.limit(limit)
		.toArray();
	return nights.map((night) => ({
		table: night.table,
		endedAt: night.endedAt,
		hands: night.hands,
		realNet: night.realNet,
		settleUp: night.settleUp,
		biggest: night.biggest
	}));
}

/** How long the night ran, in words: "3h 12m". */
export function nightLength(startedAt, endedAt) {
	if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return '';
	const minutes = Math.round((endedAt - startedAt) / 60000);
	return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

/**
 * The thank-you email for one person: how their night went, who they settle with, and a nudge to
 * play again. `gameName` turns a rules version into a name.
 */
export function nightEmail({ playerId, name, night, gameName, appUrl = 'https://chaal.tech' }) {
	const you = night.realNet.find((p) => p.id === playerId);
	const mine = night.settleUp.filter((p) => p.from === playerId || p.to === playerId);
	const favourite = Object.entries(night.games ?? {}).sort((a, b) => b[1] - a[1])[0];
	const length = nightLength(night.startedAt, night.at);
	const first = proper(name).split(' ')[0] || 'friend';
	const result =
		you && you.net > 0
			? `You finished ${signed(you.net)}. Nicely played.`
			: you && you.net < 0
				? `You finished ${signed(you.net)}. The cards will turn next time.`
				: 'You finished all square.';
	const payments = mine.map((p) =>
		p.from === playerId
			? `You pay ${proper(p.toName)} ${rupees(p.amount)}`
			: `${proper(p.fromName)} pays you ${rupees(p.amount)}`
	);
	const facts = [
		length && `${length} at the table`,
		`${night.hands} hand${night.hands === 1 ? '' : 's'}`,
		favourite && `most played: ${gameName(favourite[0])}`,
		night.biggest &&
			`biggest pot: ${rupees(night.biggest.amount)} to ${proper(night.biggest.winner)}`
	].filter(Boolean);
	const clubUrl = new URL('/club', appUrl).href;
	const ink = '#1B1A17';
	const muted = '#6B655B';
	const font = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
	const subject = `Thanks for tonight, ${first} ♠`;
	const text = [
		`Hi ${first},`,
		'',
		'Thank you for playing with us tonight. It was a fun one.',
		result,
		...(payments.length ? ['', 'Settle up:', ...payments] : []),
		'',
		facts.join(' · '),
		'',
		`Let's do it again soon: ${clubUrl}`,
		'',
		'Chaal'
	].join('\n');
	const row = (label) =>
		`<tr><td style="padding:10px 0;border-top:1px solid #E6E0D3;font-family:${font};font-size:18px;line-height:24px;color:${ink}">${escapeHtml(label)}</td></tr>`;
	const html = `<!doctype html><html><body style="margin:0;background:#FAF8F3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FAF8F3"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="font-family:${font};font-size:30px;line-height:36px;font-weight:800;color:${ink}">That's the night, ${escapeHtml(first)} 🌙</td></tr>
<tr><td style="padding-top:14px;font-family:${font};font-size:19px;line-height:27px;color:${ink}">Thank you for playing with us tonight. It was a fun one.</td></tr>
<tr><td style="padding-top:8px;font-family:${font};font-size:19px;line-height:27px;color:${ink}"><strong>${escapeHtml(result)}</strong></td></tr>
${
	payments.length
		? `<tr><td style="padding-top:22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2EEE6" style="border-radius:16px;padding:18px 22px">
<tr><td style="padding-bottom:6px;font-family:${font};font-size:13px;letter-spacing:2px;font-weight:700;color:${muted}">SETTLE UP</td></tr>
${payments.map(row).join('')}
</table></td></tr>`
		: ''
}
<tr><td style="padding-top:20px;font-family:${font};font-size:16px;line-height:23px;color:${muted}">${escapeHtml(facts.join(' · '))}</td></tr>
<tr><td style="padding-top:28px"><a href="${clubUrl}" style="display:inline-block;background:#EDC463;color:${ink};font-family:${font};font-size:18px;font-weight:700;text-decoration:none;padding:16px 28px;border-radius:16px">Let's do it again soon →</a></td></tr>
<tr><td style="padding-top:30px;font-family:${font};font-size:15px;color:${muted}">Chaal</td></tr>
</table></td></tr></table></body></html>`;
	return { subject, html, text };
}
