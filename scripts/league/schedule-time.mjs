export function newYorkClock(now = new Date()) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone: 'America/New_York',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			hourCycle: 'h23'
		})
			.formatToParts(now)
			.map((p) => [p.type, p.value])
	);
	return { day: `${parts.year}${parts.month}${parts.day}`, due: Number(parts.hour) >= 7 };
}
