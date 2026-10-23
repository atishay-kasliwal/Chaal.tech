/**
 * "Bot chat": whether this viewer sees the characters' table talk. Per device, like table sounds;
 * when storage is blocked the choice lasts for the tab.
 */
const storageKey = 'chaal-bot-chat-v1';

function stored() {
	try {
		return localStorage.getItem(storageKey) !== 'off';
	} catch {
		return true;
	}
}

class BotChat {
	on = $state(typeof window === 'undefined' ? true : stored());

	set(value: boolean) {
		this.on = value;
		try {
			localStorage.setItem(storageKey, value ? 'on' : 'off');
		} catch {
			/* Kept for this tab only. */
		}
	}
}

export const botChat = new BotChat();
