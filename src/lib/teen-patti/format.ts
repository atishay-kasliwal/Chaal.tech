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

/** Balances can be hidden by their owner; the server then sends null and two flags. */
type ChipView = { balance: number | null; coversBoot?: boolean; hasChips?: boolean };

export function balanceLabel(user: ChipView) {
	return user.balance === null ? 'Hidden' : money(user.balance);
}

export function coversBoot(user: ChipView, boot: number) {
	return user.balance === null ? user.coversBoot === true : user.balance >= boot;
}

export function hasChips(user: ChipView) {
	return user.balance === null ? user.hasChips === true : user.balance > 0;
}

const hideBalanceKey = 'chaal-hide-balance-v1';

/** Whether this device prefers to keep its balance hidden from the table. */
export function prefersHiddenBalance() {
	try {
		return localStorage.getItem(hideBalanceKey) === 'on';
	} catch {
		return false;
	}
}

export function rememberHiddenBalance(hidden: boolean) {
	try {
		localStorage.setItem(hideBalanceKey, hidden ? 'on' : 'off');
	} catch {
		/* The choice lasts for this table when storage is blocked. */
	}
}
