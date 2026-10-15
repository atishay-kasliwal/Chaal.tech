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

const rupees = (value) => `₹${Number(value).toLocaleString('en-IN')}`;

/**
 * The email itself: a private-table invite, one obvious button. Table layout and
 * inline styles so Gmail, Apple Mail and Outlook all render it the same way.
 */
export function inviteMessage({ inviter, link, boot, buyIn, seats }) {
	const name = inviter.trim() || 'A friend';
	const stakes = `Buy-in ${rupees(buyIn)} · boot ${rupees(boot)}`;
	const subject = `${name} saved you a seat ♠`;
	const preheader = 'Your private Teen Patti table is ready.';
	const text = `${name} saved you a seat at their Teen Patti table.\n\n${stakes} · ${seats} seats\n\nTake your seat: ${link}\n\nNo signup needed. Camera optional until you join.\n\nYou got this because ${name} entered your address at chaal.tech.`;
	const who = escapeHtml(name);
	const href = escapeHtml(link);
	const initial = escapeHtml((Array.from(name)[0] ?? 'A').toUpperCase());
	// Served from static/email; image-blocking clients and Outlook show the plain colour behind it.
	const assets = `${new URL(link).origin}/email`;
	const backdrop = escapeHtml(`${assets}/invite-table.jpg`);
	const phoneBackdrop = escapeHtml(`${assets}/invite-table-phone.jpg`);
	const brandLogo = escapeHtml(`${new URL(link).origin}/brand/chaal-email.png`);
	const sans = 'Arial,Helvetica,sans-serif';
	const serif = "Georgia,'Times New Roman',Times,serif";
	const stat = (value, label, divider) => `<td class="stat" width="33%" align="center" valign="top" style="padding:14px 6px 12px;${divider ? 'border-left:1px solid #2a3527;' : ''}">
<div class="stat-value" style="font-family:${sans};font-size:26px;line-height:32px;font-weight:700;color:#E8B955;white-space:nowrap">${escapeHtml(value)}</div>
<div style="font-family:${sans};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#A9AEA7;padding-top:4px">${label}</div>
</td>`;
	const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
a{text-decoration:none}
@media only screen and (max-width:620px){
.shell{padding:0!important;background-image:url('${phoneBackdrop}')!important;background-size:100% auto!important}
.pad{padding-left:20px!important;padding-right:20px!important}
.r-top{padding-top:22px!important}
.logo{width:180px!important;height:auto!important}
.rules{margin-top:8px!important}
.rule{width:24px!important}
.r-icon{padding-top:18px!important}
.icon{width:46px!important;height:46px!important;line-height:46px!important;font-size:28px!important;border-radius:12px!important}
.r-head{padding-top:14px!important}
.headline{font-size:30px!important;line-height:34px!important}
.sub{margin-top:8px!important;font-size:15px!important;line-height:21px!important}
.r-stats{padding-top:18px!important}
.stat{padding:11px 2px 10px!important}
.stat-value{font-size:20px!important;line-height:24px!important}
.r-cta{padding-top:18px!important}
.cta{width:100%!important}
.cta-a{padding:15px 20px!important}
.r-trust{padding-top:10px!important;font-size:12px!important}
.r-div{padding-top:16px!important}
.r-foot{padding-top:14px!important;padding-bottom:18px!important}
.trouble{padding-top:8px!important}
.legal{padding-top:8px!important;font-size:10px!important;line-height:14px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background:#07110D" bgcolor="#07110D">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#07110D;opacity:0">${preheader}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#07110D" style="background:#07110D">
<tr><td class="shell" align="center" valign="top" background="${backdrop}" style="padding:12px 12px;background-color:#07110D;background-image:url('${backdrop}');background-repeat:no-repeat;background-position:center top;background-size:1400px auto">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td class="pad r-top" align="center" style="padding:24px 48px 0">
<a href="https://chaal.tech" aria-label="Chaal.tech" style="display:inline-block;text-decoration:none"><img class="logo" src="${brandLogo}" width="220" height="54" alt="Chaal.tech" style="display:block;width:220px;max-width:100%;height:auto;border:0"></a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="rules" style="margin-top:12px"><tr>
<td class="rule" width="48" style="width:48px"><div style="height:1px;line-height:1px;font-size:1px;background:#3a4436">&nbsp;</div></td>
<td style="padding:0 14px;font-family:${sans};font-size:11px;line-height:16px;letter-spacing:3px;color:#C9C6BC;white-space:nowrap">PRIVATE TABLE INVITE</td>
<td class="rule" width="48" style="width:48px"><div style="height:1px;line-height:1px;font-size:1px;background:#3a4436">&nbsp;</div></td>
</tr></table>
</td></tr>
<tr><td class="pad r-icon" align="center" style="padding:20px 48px 0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="icon" width="54" height="54" align="center" valign="middle" bgcolor="#E8B955" style="width:54px;height:54px;background:#E8B955;border-radius:13px;font-family:${sans};font-size:32px;line-height:54px;color:#07110D">&#9824;&#65038;</td>
</tr></table>
</td></tr>
<tr><td class="pad r-head" align="center" style="padding:16px 48px 0">
<h1 class="headline" style="margin:0;font-family:${serif};font-size:38px;line-height:43px;font-weight:700;color:#F4F0E6">${who} saved you<br><span style="color:#E8B955">a seat.</span></h1>
<p class="sub" style="margin:10px 0 0;font-family:${serif};font-size:18px;line-height:26px;color:#A9AEA7">Teen Patti is better when everyone shows up.</p>
</td></tr>
<tr><td class="pad r-stats" style="padding:22px 48px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#13251C" style="border-collapse:separate;background:#13251C;border:1px solid #2a3527;border-radius:12px">
<tr>
${stat(rupees(buyIn), 'Buy in', false)}
${stat(rupees(boot), 'Boot', true)}
${stat(String(seats), 'Seats', true)}
</tr>
</table>
</td></tr>
<tr><td class="pad r-cta" align="center" style="padding:22px 48px 0">
<table role="presentation" class="cta" width="76%" cellpadding="0" cellspacing="0" border="0" style="width:76%"><tr>
<td align="center" bgcolor="#E8B955" style="background:#E8B955;border-radius:999px">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:54px;v-text-anchor:middle;width:400px" arcsize="50%" stroke="f" fillcolor="#E8B955"><w:anchorlock/><center style="color:#07110D;font-family:Arial,sans-serif;font-size:17px;font-weight:bold">Take your seat &#8594;</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a class="cta-a" href="${href}" style="display:block;padding:16px 24px;font-family:${sans};font-size:17px;line-height:20px;font-weight:700;color:#07110D;text-decoration:none;border-radius:999px">Take your seat&nbsp;&#8594;</a><!--<![endif]-->
</td>
</tr></table>
</td></tr>
<tr><td class="pad r-trust" align="center" style="padding:12px 48px 0;font-family:${sans};font-size:13px;line-height:20px;color:#A9AEA7">
⚡&nbsp;No signup needed&nbsp;&nbsp;<span style="color:#4a5548">·</span>&nbsp;&nbsp;Camera optional until you join
</td></tr>
<tr><td class="pad r-div" style="padding:20px 48px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height:1px;line-height:1px;font-size:1px;background:#2a3527" bgcolor="#2a3527">&nbsp;</td></tr></table></td></tr>
<tr><td class="pad r-foot" align="center" style="padding:16px 48px 20px;font-family:${sans}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="36" height="36" align="center" valign="middle" bgcolor="#1C2A1F" style="width:36px;height:36px;border-radius:18px;background:#1C2A1F;font-family:${sans};font-size:15px;line-height:36px;font-weight:700;color:#E8B955">${initial}</td>
<td style="padding-left:12px;font-family:${sans};font-size:13px;line-height:20px;color:#A9AEA7">Invited by <span style="color:#F4F0E6">${who}</span> through Chaal</td>
</tr></table>
<div class="trouble" style="padding-top:8px;font-size:12px;line-height:18px"><a href="${href}" style="color:#E8B955;text-decoration:underline">Having trouble? Open invitation&nbsp;&#8594;</a></div>
<div class="legal" style="padding-top:10px;font-size:11px;line-height:16px;color:#6b7368">You got this because ${who} entered your address at chaal.tech.</div>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
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
