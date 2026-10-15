const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹1,240 — Indian digit grouping, no decimals. */
export function money(value: number | null | undefined) {
	return `₹${rupees.format(value ?? 0)}`;
}

/** +₹120 / −₹40 / ₹0 for session results. */
export function signedMoney(value: number) {
	if (value === 0) return '₹0';
	return `${value > 0 ? '+' : '−'}₹${rupees.format(Math.abs(value))}`;
}

export function rankLabel(rank: number) {
	return (
		({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 1: 'A' } as Record<number, string>)[rank] ?? String(rank)
	);
}
