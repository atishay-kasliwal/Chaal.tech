import type { Track } from 'livekit-client';

// Each DOM element owns exactly one attachment, detached on replacement/unmount.
export function attachTrack(element: HTMLMediaElement, initial?: Track) {
	let track = initial;
	track?.attach(element);
	return {
		update(next?: Track) {
			if (next === track) return;
			track?.detach(element);
			track = next;
			track?.attach(element);
		},
		destroy() {
			track?.detach(element);
			element.srcObject = null;
		}
	};
}
