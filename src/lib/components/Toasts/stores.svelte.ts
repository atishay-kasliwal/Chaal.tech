interface Toast {
	id: number;
	message: string;
	type: 'success' | 'error' | 'warning' | 'info';
}

export const toastQueue = $state<Toast[]>([]);
let nextToastId = 1;

/**
 * Function to display toast messages
 * @param message - The message to be displayed
 * @param type - The type of toast
 * @param resetTime - The time in milliseconds to reset the toast
 */
export function displayToast(message: Toast['message'], type: Toast['type'], resetTime = 3000) {
	toastQueue.push({ id: nextToastId++, message, type });

	setTimeout(() => {
		toastQueue.shift();
	}, resetTime);
}
