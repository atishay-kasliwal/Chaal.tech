/**
 * The beta emails a friend gets as a private member, in the table invite's look
 * (server/cloudflare/invites.mjs):
 *
 *   1. Availability: when they're added. A personal note asking which night works (Google Form).
 *   2. It's set: once the owner picks the date and time. Date, time, add to calendar.
 *   3. Welcome to the private membership: a day after step 2. Their member card.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
export const BETA_STEPS = [1, 2, 3];
export const BETA_TIME_ZONE = 'Asia/Kolkata';
const GAME_HOURS = 3;

const escapeHtml = (value) =>
	String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const format = (date, options, timeZone = BETA_TIME_ZONE) =>
	new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(date);

/**
 * The chosen game time. Accepts "2026-10-24 21:00" (read as India time) or a full ISO time.
 * Returns labels for the email and a Google Calendar link.
 */
export function gameTime(start, appUrl = 'https://chaal.tech') {
	const text = String(start ?? '').trim();
	const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/.exec(text);
	const date = local
		? new Date(`${local[1]}T${local[2].padStart(2, '0')}:${local[3]}:00+05:30`)
		: new Date(text);
	if (!text || Number.isNaN(date.getTime()))
		throw new Error(
			'Give the game time as "YYYY-MM-DD HH:MM" (India time), e.g. "2026-10-24 21:00"'
		);
	const end = new Date(date.getTime() + GAME_HOURS * 60 * 60 * 1000);
	const stamp = (value) =>
		value
			.toISOString()
			.replace(/[-:]/g, '')
			.replace(/\.\d{3}/, '');
	const calendar = new URL('https://calendar.google.com/calendar/render');
	calendar.searchParams.set('action', 'TEMPLATE');
	calendar.searchParams.set('text', 'Chaal.tech private beta ♠');
	calendar.searchParams.set('dates', `${stamp(date)}/${stamp(end)}`);
	calendar.searchParams.set(
		'details',
		`Teen Patti night with the club. Join at ${new URL('/club', appUrl).href}`
	);
	calendar.searchParams.set('location', new URL('/club', appUrl).href);
	const time = format(date, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(
		/\s?([ap])m/i,
		(_, m) => ` ${m.toUpperCase()}M`
	);
	// Friends in the US read the same moment in Eastern time.
	const eastern = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York',
		hour: 'numeric',
		minute: '2-digit'
	}).format(date);
	return {
		start: date,
		day: format(date, { weekday: 'long' }),
		date: format(date, { weekday: 'short', day: 'numeric', month: 'short' }),
		time,
		zone: 'IST',
		eastern,
		label: `${format(date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${time} IST (${eastern} ET)`,
		calendarUrl: calendar.href
	};
}

/**
 * "Fri, 23 Oct or Sat, 24 Oct": the Friday and Saturday of next weekend (the first Friday at
 * least five days away), the two nights the availability email offers.
 */
export function candidateNights(from = new Date()) {
	let friday = new Date(from.getTime() + 5 * DAY_MS);
	while (format(friday, { weekday: 'short' }) !== 'Fri')
		friday = new Date(friday.getTime() + DAY_MS);
	const night = (date) =>
		format(date, { weekday: 'short', day: 'numeric', month: 'short' }).replace(' ', ', ');
	return `${night(friday)} or ${night(new Date(friday.getTime() + DAY_MS))}`;
}

/**
 * Day 1, a personal note from the host in a light, friendly layout: "Hey Raju", what's
 * happening, the two candidate nights, one button to the form. Mirrors the approved mockup.
 */
function availabilityMessage({ nickname, formUrl, nights, host, appUrl }) {
	const origin = new URL(appUrl).origin;
	const form = new URL(formUrl).href;
	const name = displayName(nickname);
	const from = displayName(host, 'Atishay');
	const subject = `Teen Patti night: ${nights}?`;
	const preheader = `${nights}. Let me know which night works for you.`;
	const text = `Hey ${name},

We're putting together a small Teen Patti night with a few friends next weekend and I'd love to have you at the table.

Teen Patti night: ${nights}
6 seats, just for our circle

Let me know which night works for you: ${form}

First game with this group, so things might break 😁

See you there,
${from}
Chaal`;
	const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
	const ink = '#121A16';
	const muted = '#6E7671';
	const asset = (file) => escapeHtml(`${origin}/email/${file}`);
	const href = escapeHtml(form);
	const row = (icon, title, detail, last) => `<tr>
<td width="44" valign="top" style="padding:${last ? '0' : '0 0 22px'};width:44px"><img src="${asset(icon)}" width="28" height="28" alt="" style="display:block;width:28px;height:28px;border:0"></td>
<td valign="top" style="padding:${last ? '0' : '0 0 22px'};font-family:${font}"><div class="panel-title" style="font-size:19px;line-height:24px;font-weight:700;color:${ink}">${title}</div><div class="panel-detail" style="padding-top:4px;font-size:17px;line-height:23px;color:${muted}">${detail}</div></td>
</tr>`;
	const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
:root{color-scheme:light only;supported-color-schemes:light}
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
a{text-decoration:none}
@media only screen and (max-width:620px){
.pad{padding-left:22px!important;padding-right:22px!important}
.hello{font-size:34px!important;line-height:40px!important}
.lead{font-size:17px!important;line-height:26px!important}
.cards{width:150px!important;height:auto!important}
.cards-cell{width:150px!important}
.panel{padding:22px 20px!important}
.body-text{font-size:17px!important;line-height:25px!important}
.cta-a{font-size:19px!important;padding:17px 20px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background:#FAF8F3;color:${ink}" bgcolor="#FAF8F3">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#FAF8F3;opacity:0">${escapeHtml(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FAF8F3" style="background:#FAF8F3">
<tr><td align="center" valign="top" style="padding:0">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td class="pad" align="left" style="padding:28px 32px 0">
<a href="${escapeHtml(origin)}" style="display:inline-block"><img src="${asset('logo-light.png')}" width="190" height="47" alt="Chaal.tech" style="display:block;width:190px;height:auto;border:0"></a>
</td></tr>
<tr><td class="pad" style="padding:30px 32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" style="font-family:${font}">
<h1 class="hello" style="margin:0;font-size:40px;line-height:46px;font-weight:800;letter-spacing:-0.5px;color:${ink}">Hey ${escapeHtml(name)},</h1>
<p class="lead" style="margin:16px 0 0;font-size:19px;line-height:29px;color:#26302B">We’re putting together a small Teen Patti night with a few friends next weekend and I’d love to have you at the table.</p>
</td>
<td class="cards-cell" width="210" valign="middle" align="right" style="width:210px;padding-left:4px"><img class="cards" src="${asset('beta-cards.png')}" width="210" height="190" alt="Ace, king and queen of cards" style="display:block;width:210px;height:auto;border:0"></td>
</tr></table>
</td></tr>
<tr><td class="pad" style="padding:26px 32px 0">
<table class="panel" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2EEE6" style="border-collapse:separate;background:#F2EEE6;border-radius:18px;padding:26px 28px">
${row('icon-calendar.png', 'Teen Patti night', escapeHtml(nights), false)}
${row('icon-seats.png', '6 seats', 'Just for our circle', true)}
</table>
</td></tr>
<tr><td class="pad body-text" style="padding:26px 32px 0;font-family:${font};font-size:19px;line-height:27px;color:${ink}">Let me know which night works for you.</td></tr>
<tr><td class="pad" style="padding:18px 32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="#EDC463" style="background:#EDC463;border-radius:16px">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:58px;v-text-anchor:middle;width:536px" arcsize="28%" stroke="f" fillcolor="#EDC463"><w:anchorlock/><center style="color:${ink};font-family:Arial,sans-serif;font-size:20px;font-weight:bold">Pick a night &#8594;</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a class="cta-a" href="${href}" style="display:block;padding:18px 24px;font-family:${font};font-size:21px;line-height:24px;font-weight:700;color:${ink};text-decoration:none;border-radius:16px">Pick a night&nbsp;&#8594;</a><!--<![endif]-->
</td></tr></table>
</td></tr>
<tr><td class="pad body-text" style="padding:26px 32px 0;font-family:${font};font-size:17px;line-height:25px;color:#4D5650">First game with this group, so things might break 😁</td></tr>
<tr><td class="pad" style="padding:18px 32px 0;font-family:${font}">
<div style="font-size:17px;line-height:25px;color:#4D5650">See you there,</div>
<div style="padding-top:6px;font-size:19px;line-height:25px;font-weight:700;color:${ink}">${escapeHtml(from)}</div>
<div style="padding-top:2px;font-size:17px;line-height:23px;color:${muted}">Chaal</div>
</td></tr>
<tr><td class="pad" style="padding:30px 32px 28px;font-family:${font};font-size:12px;line-height:18px;color:#A3A9A5">You got this because ${escapeHtml(from)} added you to chaal.tech. <a href="${href}" style="color:#A3A9A5;text-decoration:underline">Open the form</a> · reply if you’d rather not get these.</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
	return { subject, text, html };
}

const gold = (text) => `<span class="gold-text" style="color:#E8B955">${text}</span>`;

function displayName(nickname, fallback = 'Friend') {
	const raw = String(nickname ?? '').trim() || fallback;
	const first = Array.from(raw)[0] ?? '';
	return `${first.toLocaleUpperCase()}${raw.slice(first.length)}`;
}

/** What changes per email. Everything else is the shared invite layout below. */
function content(step, { name, game, appUrl, memberSince, from, email }) {
	const club = new URL('/club', appUrl).href;
	if (step === 'added')
		return {
			subject: `${from} added you to Chaal ♠`,
			preheader: 'You’re on the guest list. Sign in with Google to take your seat.',
			eyebrow: 'PRIVATE CLUB · YOU’RE IN',
			headline: `You’re on<br>${gold('the guest list, ' + name + '.')}`,
			sub: `${from} added you to Chaal, a private Teen Patti table for friends, on video. Sign in with Google using ${email} to take your seat.`,
			panel: { member: { name, since: memberSince } },
			cta: { label: 'Take your seat', href: club, help: 'Sign in with Google' },
			text: `You're on the guest list, ${name}.\n\n${from} added you to Chaal, a private Teen Patti table for friends, on video. Sign in with Google using ${email} to take your seat.\n\nTake your seat: ${club}`
		};
	if (step === 2)
		return {
			subject: `It’s set: ${game.date}, ${game.time} ♠`,
			preheader: `The chaal.tech private beta is on ${game.label}.`,
			eyebrow: 'PRIVATE BETA · IT’S SET',
			headline: `${game.day} night.<br>${gold('Cards at ' + game.time + '.')}`,
			sub: 'Thanks for the replies. Most of the table can make this one, so the cards go out then. Save the date.',
			panel: {
				stats: [
					[game.date, 'Date'],
					[game.time, game.zone],
					['6', 'Seats']
				]
			},
			cta: { label: 'Add to calendar', href: game.calendarUrl, help: 'Open the calendar invite' },
			text: `It's set: the chaal.tech private beta is on ${game.label}.\n\nThanks for the replies. Most of the table can make this one, so the cards go out then. Save the date.\n\nAdd to calendar: ${game.calendarUrl}`
		};
	return {
		subject: 'Welcome to the private membership ♠',
		preheader: 'Your chaal.tech membership is active. Your seat is held.',
		eyebrow: 'PRIVATE MEMBERSHIP',
		headline: `Welcome to<br>${gold('the club, ' + name + '.')}`,
		sub: 'Your membership is active. Your seat, your chips and your table are held for you, every game night.',
		panel: { member: { name, since: memberSince, first: game?.label } },
		cta: { label: 'Enter the club', href: club, help: 'Open chaal.tech' },
		text: `Welcome to the club, ${name}.\n\nYour chaal.tech private membership is active. Your seat, your chips and your table are held for you, every game night.${game ? `\n\nFirst game: ${game.label}` : ''}\n\nEnter the club: ${club}`
	};
}

/** One email: { subject, text, html }. */
export function betaMessage(
	step,
	{
		nickname,
		formUrl,
		nights,
		game,
		host = 'The Chaal table',
		appUrl = 'https://chaal.tech',
		memberSince = new Date(),
		email = ''
	}
) {
	if (!BETA_STEPS.includes(step) && step !== 'added')
		throw new Error(`Unknown beta email step ${step}`);
	if (step === 1 && !formUrl) throw new Error('The availability email needs the Google Form link');
	if (step === 1)
		return availabilityMessage({
			nickname,
			formUrl,
			nights: nights || candidateNights(),
			host,
			appUrl
		});
	if (step === 2 && !game) throw new Error('The “it’s set” email needs the chosen game time');
	const origin = new URL(appUrl).origin;
	const name = escapeHtml(displayName(nickname));
	const from = displayName(host, 'The Chaal table');
	const since = format(new Date(memberSince), { month: 'long', year: 'numeric' });
	const parts = content(step, {
		name,
		game: game && { ...game, label: escapeHtml(game.label) },
		appUrl,
		memberSince: since,
		from,
		email
	});
	const plainName = displayName(nickname);
	const subject = parts.subject.replaceAll(name, plainName);
	const text = `${parts.text.replaceAll(name, plainName)}\n\nFrom ${from} at Chaal. Reply to this email if you'd rather not get these.`;
	const sans = 'Arial,Helvetica,sans-serif';
	const serif = "Georgia,'Times New Roman',Times,serif";
	const href = escapeHtml(parts.cta.href);
	const who = escapeHtml(from);
	const initial = escapeHtml((Array.from(from)[0] ?? 'C').toUpperCase());
	const backdrop = escapeHtml(`${origin}/email/invite-table.jpg`);
	const phoneBackdrop = escapeHtml(`${origin}/email/invite-table-phone.jpg`);
	const logo = escapeHtml(`${origin}/brand/chaal-email.png`);
	const stat = (
		[value, label],
		divider
	) => `<td class="stat" width="33%" align="center" valign="top" style="padding:14px 6px 12px;${divider ? 'border-left:1px solid #2a3527;' : ''}">
<div class="stat-value" style="font-family:${sans};font-size:24px;line-height:30px;font-weight:700;color:#E8B955;white-space:nowrap">${escapeHtml(value)}</div>
<div class="stat-label" style="font-family:${sans};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#A9AEA7;padding-top:4px">${escapeHtml(label)}</div>
</td>`;
	const panel = parts.panel.stats
		? `<table class="stats-panel" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#13251C" style="border-collapse:separate;background:#13251C;border:1px solid #2a3527;border-radius:12px">
<tr>${parts.panel.stats.map((entry, index) => stat(entry, index > 0)).join('')}</tr>
</table>`
		: `<table class="member-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#13251C" style="border-collapse:separate;background:#13251C;border:1px solid #6d5a2c;border-radius:16px">
<tr><td style="padding:20px 22px 0" align="left">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="left" style="font-family:${sans};font-size:10px;line-height:14px;letter-spacing:3px;color:#E8B955">PRIVATE MEMBER</td>
<td align="right" style="font-family:${serif};font-size:20px;line-height:14px;color:#E8B955">&#9824;&#65038;</td>
</tr></table>
</td></tr>
<tr><td class="member-name" align="left" style="padding:18px 22px 0;font-family:${serif};font-size:30px;line-height:34px;font-weight:700;color:#F4F0E6">${parts.panel.member.name}</td></tr>
<tr><td style="padding:16px 22px 0"><div style="height:1px;line-height:1px;font-size:1px;background:#2a3527">&nbsp;</div></td></tr>
<tr><td style="padding:12px 22px 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="left" valign="top" style="font-family:${sans}"><div style="font-size:10px;line-height:14px;letter-spacing:2px;color:#A9AEA7">MEMBER SINCE</div><div style="padding-top:3px;font-size:14px;line-height:20px;color:#F4F0E6">${escapeHtml(parts.panel.member.since)}</div></td>
${parts.panel.member.first ? `<td align="right" valign="top" style="font-family:${sans}"><div style="font-size:10px;line-height:14px;letter-spacing:2px;color:#A9AEA7">FIRST GAME</div><div style="padding-top:3px;font-size:14px;line-height:20px;color:#F4F0E6">${parts.panel.member.first.split(' · ')[0]}</div></td>` : ''}
</tr></table>
</td></tr>
</table>`;
	const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
a{text-decoration:none}
@media (prefers-color-scheme:dark){
body,.email-canvas,.shell{background-color:#07110D!important;color:#F4F0E6!important}
.headline{color:#F4F0E6!important}
.sub,.r-trust,.r-foot{color:#C5CCC3!important}
.stats-panel,.member-card{background-color:#13251C!important}
.stat-value,.gold-text{color:#E8B955!important}
.stat-label{color:#C5CCC3!important}
.icon,.cta-cell{background-color:#E8B955!important}
.cta-a{color:#07110D!important}
}
@media only screen and (max-width:620px){
.shell{padding:0!important;background-image:url('${phoneBackdrop}')!important;background-size:100% auto!important}
.pad{padding-left:20px!important;padding-right:20px!important}
.r-top{padding-top:22px!important}
.logo{width:180px!important;height:auto!important}
.rule{width:20px!important}
.eyebrow{letter-spacing:2px!important;font-size:10px!important}
.icon{width:46px!important;height:46px!important;line-height:46px!important;font-size:28px!important;border-radius:12px!important}
.headline{font-size:30px!important;line-height:35px!important}
.sub{font-size:16px!important;line-height:23px!important}
.stat{padding:11px 2px 10px!important}
.stat-value{font-size:18px!important;line-height:22px!important}
.member-name{font-size:26px!important;line-height:30px!important}
.cta{width:100%!important}
.cta-a{padding:15px 20px!important}
.r-trust{font-size:12px!important}
}
</style>
</head>
<body class="email-body" style="margin:0;padding:0;background:#07110D;color:#F4F0E6" bgcolor="#07110D">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#07110D;opacity:0">${escapeHtml(parts.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table class="email-canvas" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#07110D" style="background:#07110D">
<tr><td class="shell" align="center" valign="top" background="${backdrop}" style="padding:12px 12px;background-color:#07110D;background-image:url('${backdrop}');background-repeat:no-repeat;background-position:center top;background-size:1400px auto">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td class="pad r-top" align="center" style="padding:24px 48px 0">
<a href="${escapeHtml(origin)}" aria-label="Chaal.tech" style="display:inline-block;text-decoration:none"><img class="logo" src="${logo}" width="220" height="54" alt="Chaal.tech" style="display:block;width:220px;max-width:100%;height:auto;border:0"></a>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px"><tr>
<td class="rule" width="48" style="width:48px"><div style="height:1px;line-height:1px;font-size:1px;background:#3a4436">&nbsp;</div></td>
<td class="eyebrow" style="padding:0 14px;font-family:${sans};font-size:11px;line-height:16px;letter-spacing:3px;color:#C9C6BC;white-space:nowrap">${parts.eyebrow}</td>
<td class="rule" width="48" style="width:48px"><div style="height:1px;line-height:1px;font-size:1px;background:#3a4436">&nbsp;</div></td>
</tr></table>
</td></tr>
<tr><td class="pad" align="center" style="padding:20px 48px 0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="icon" width="54" height="54" align="center" valign="middle" bgcolor="#E8B955" style="width:54px;height:54px;background:#E8B955;border-radius:13px;font-family:${sans};font-size:32px;line-height:54px;color:#07110D">&#9824;&#65038;</td>
</tr></table>
</td></tr>
<tr><td class="pad" align="center" style="padding:16px 48px 0">
<h1 class="headline" style="margin:0;font-family:${serif};font-size:38px;line-height:43px;font-weight:700;color:#F4F0E6">${parts.headline}</h1>
<p class="sub" style="margin:12px 0 0;font-family:${serif};font-size:18px;line-height:26px;color:#A9AEA7">${escapeHtml(parts.sub)}</p>
</td></tr>
<tr><td class="pad" style="padding:22px 48px 0">
${panel}
</td></tr>
<tr><td class="pad" align="center" style="padding:22px 48px 0">
<table role="presentation" class="cta" width="76%" cellpadding="0" cellspacing="0" border="0" style="width:76%"><tr>
<td class="cta-cell" align="center" bgcolor="#E8B955" style="background:#E8B955;border-radius:999px">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:54px;v-text-anchor:middle;width:400px" arcsize="50%" stroke="f" fillcolor="#E8B955"><w:anchorlock/><center style="color:#07110D;font-family:Arial,sans-serif;font-size:17px;font-weight:bold">${parts.cta.label} &#8594;</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a class="cta-a" href="${href}" style="display:block;padding:16px 24px;font-family:${sans};font-size:17px;line-height:20px;font-weight:700;color:#07110D;text-decoration:none;border-radius:999px">${parts.cta.label}&nbsp;&#8594;</a><!--<![endif]-->
</td>
</tr></table>
</td></tr>
<tr><td class="pad r-trust" align="center" style="padding:12px 48px 0;font-family:${sans};font-size:13px;line-height:20px;color:#A9AEA7">
Private table&nbsp;&nbsp;<span style="color:#4a5548">·</span>&nbsp;&nbsp;Members only&nbsp;&nbsp;<span style="color:#4a5548">·</span>&nbsp;&nbsp;Camera optional
</td></tr>
<tr><td class="pad" style="padding:20px 48px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="height:1px;line-height:1px;font-size:1px;background:#2a3527" bgcolor="#2a3527">&nbsp;</td></tr></table></td></tr>
<tr><td class="pad r-foot" align="center" style="padding:16px 48px 20px;font-family:${sans}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="36" height="36" align="center" valign="middle" bgcolor="#1C2A1F" style="width:36px;height:36px;border-radius:18px;background:#1C2A1F;font-family:${sans};font-size:15px;line-height:36px;font-weight:700;color:#E8B955">${initial}</td>
<td style="padding-left:12px;font-family:${sans};font-size:13px;line-height:20px;color:#A9AEA7">From <span style="color:#F4F0E6">${who}</span> at Chaal</td>
</tr></table>
<div style="padding-top:8px;font-size:12px;line-height:18px"><a href="${href}" style="color:#E8B955;text-decoration:underline">Having trouble? ${parts.cta.help}&nbsp;&#8594;</a></div>
<div style="padding-top:10px;font-size:11px;line-height:16px;color:#6b7368">You got this because ${who} made you a member of chaal.tech. Reply if you’d rather not get these.</div>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
	return { subject, text, html };
}

/**
 * Send some steps to one member: each `{ step, at }` goes out at `at` (now when absent;
 * later ones are scheduled with Resend). Idempotency keys stop a rerun sending twice.
 */
export async function sendBetaEmails({
	apiKey,
	from,
	member,
	steps,
	details,
	now = new Date(),
	fetcher = fetch
}) {
	const sent = [];
	for (const { step, at } of steps) {
		const message = betaMessage(step, {
			...details,
			nickname: member.nickname,
			memberSince: member.createdAt ?? now
		});
		const scheduled = at && at > now ? at : null;
		const response = await fetcher('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'Idempotency-Key': `chaal-beta-${member._id}-${step}-${details.game?.start?.getTime() ?? 'open'}`
			},
			body: JSON.stringify({
				from,
				to: [member.email],
				subject: message.subject,
				html: message.html,
				text: message.text,
				...(scheduled ? { scheduled_at: scheduled.toISOString() } : {})
			}),
			signal: AbortSignal.timeout(10000)
		});
		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			const error = new Error(
				`Resend rejected beta email ${step} (${response.status}): ${body.message ?? 'unknown error'}`
			);
			error.sent = sent;
			throw error;
		}
		sent.push({ step, id: body.id, at: scheduled ?? now, subject: message.subject });
	}
	return sent;
}

/** Which emails a member should get now: availability first, then "it's set" + welcome. */
export function plannedSteps(member, decision, now = new Date()) {
	const done = new Set((member.betaInvite?.emails ?? []).map((email) => email.step));
	const steps = [];
	// Once the time is decided, a new member skips the availability question.
	if (!decision && !done.has(1)) steps.push({ step: 1 });
	if (decision && !done.has(2)) steps.push({ step: 2 });
	if (decision && !done.has(3)) steps.push({ step: 3, at: new Date(now.getTime() + DAY_MS) });
	return steps;
}

/** Stop emails still waiting to go out (for a suspended or removed friend). */
export async function cancelBetaEmails({ apiKey, emails, now = new Date(), fetcher = fetch }) {
	const pending = (emails ?? []).filter((email) => email.id && new Date(email.at) > now);
	const cancelled = [];
	for (const email of pending) {
		const response = await fetcher(
			`https://api.resend.com/emails/${encodeURIComponent(email.id)}/cancel`,
			{
				method: 'POST',
				headers: { Authorization: `Bearer ${apiKey}` },
				signal: AbortSignal.timeout(10000)
			}
		);
		if (response.ok) cancelled.push(email.step);
	}
	return cancelled;
}

/** The "you're on the guest list" email, sent when an owner adds someone to the club. */
export async function sendAddedEmail({ apiKey, from, member, host, appUrl, fetcher = fetch }) {
	const message = betaMessage('added', {
		nickname: member.nickname,
		email: member.email,
		host,
		appUrl,
		memberSince: member.createdAt ?? new Date()
	});
	const response = await fetcher('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'Idempotency-Key': `chaal-added-${member._id}`
		},
		body: JSON.stringify({
			from,
			to: [member.email],
			subject: message.subject,
			html: message.html,
			text: message.text
		}),
		signal: AbortSignal.timeout(10000)
	});
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(
			`Resend rejected the welcome email (${response.status}): ${body.message ?? 'unknown error'}`
		);
	}
	return message.subject;
}
