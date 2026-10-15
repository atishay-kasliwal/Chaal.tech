/** One shared switch for the "Start a table" pop-up, opened from the nav or the landing page. */
export const startModal = $state({ open: false });

export function openStart() {
	startModal.open = true;
}

export function closeStart() {
	startModal.open = false;
}
