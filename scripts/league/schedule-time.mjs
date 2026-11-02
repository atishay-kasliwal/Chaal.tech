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
	// A new run starts only between 3 and 9 AM, so the Mac is not busy during the day; one still going at 9 finishes.
	const hour = Number(parts.hour);
	return { day: `${parts.year}${parts.month}${parts.day}`, due: hour >= 3 && hour < 9 };
}
