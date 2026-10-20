/** Keep keyboard focus inside an open sheet and restore its trigger on close. */
export function dialogFocus(node: HTMLElement) {
	const previous = document.activeElement as HTMLElement | null;
	const focusable = () =>
		[
			...node.querySelectorAll<HTMLElement>(
				'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
			)
		].filter((element) => element.getClientRects().length > 0);
	const frame = requestAnimationFrame(() => (focusable()[0] ?? node).focus());
	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const items = focusable();
		const first = items[0],
			last = items.at(-1);
		if (!first) {
			event.preventDefault();
			node.focus();
			return;
		}
		if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}
	node.addEventListener('keydown', keydown);
	return {
		destroy() {
			cancelAnimationFrame(frame);
			node.removeEventListener('keydown', keydown);
			if (previous?.isConnected) previous.focus({ preventScroll: true });
		}
	};
}
