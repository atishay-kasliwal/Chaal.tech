/**
 * Settle up a night with as few payments as possible: whoever lost most pays whoever won most,
 * until everyone is square. With n people that is at most n - 1 payments, and nobody pays one
 * person only to be paid back by another.
 *
 * @param {{ id: string, name: string, net: number }[]} people  real-money results (sum to zero)
 * @returns {{ from: string, fromName: string, to: string, toName: string, amount: number }[]}
 */
export function settleUp(people) {
	const owe = people.filter((p) => p.net < 0).map((p) => ({ ...p, left: -p.net }));
	const get = people.filter((p) => p.net > 0).map((p) => ({ ...p, left: p.net }));
	const payments = [];
	const biggest = (list) => list.reduce((top, p) => (p.left > top.left ? p : top), list[0]);
	while (owe.some((p) => p.left > 0) && get.some((p) => p.left > 0)) {
		const from = biggest(owe.filter((p) => p.left > 0));
		const to = biggest(get.filter((p) => p.left > 0));
		const amount = Math.min(from.left, to.left);
		payments.push({ from: from.id, fromName: from.name, to: to.id, toName: to.name, amount });
		from.left -= amount;
		to.left -= amount;
	}
	return payments;
}
