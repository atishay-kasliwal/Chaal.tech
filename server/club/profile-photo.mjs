/** Bounded, metadata-free baseline JPEGs produced by the profile cropper. No remote URLs/SVG. */
export const MAX_PHOTO_BYTES = 24 * 1024;
export function isProfilePhoto(value) {
	if (
		typeof value !== 'string' ||
		value.length > 23 + Math.ceil(MAX_PHOTO_BYTES / 3) * 4 ||
		!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
	)
		return false;
	let bytes;
	try {
		bytes = Uint8Array.from(atob(value.slice(23)), (c) => c.charCodeAt(0));
	} catch {
		return false;
	}
	if (
		bytes.length > MAX_PHOTO_BYTES ||
		bytes[0] !== 255 ||
		bytes[1] !== 216 ||
		bytes.at(-2) !== 255 ||
		bytes.at(-1) !== 217
	)
		return false;
	let position = 2,
		frame = false;
	while (position + 3 < bytes.length) {
		if (bytes[position++] !== 255) return false;
		const marker = bytes[position++];
		const length = bytes[position] * 256 + bytes[position + 1];
		if (length < 2 || position + length > bytes.length) return false;
		// Reject EXIF, XMP, comments and other application metadata, allowing JFIF and the browser’s standard color profile.
		if (marker === 254 || (marker >= 225 && marker <= 239 && marker !== 226)) return false;
		if (
			marker === 224 &&
			String.fromCharCode(...bytes.slice(position + 2, position + 7)) !== 'JFIF\0'
		)
			return false;
		if (
			marker === 226 &&
			(length > 2048 ||
				String.fromCharCode(...bytes.slice(position + 2, position + 14)) !== 'ICC_PROFILE\0')
		)
			return false;
		if (marker === 192) {
			if (
				length < 11 ||
				bytes[position + 2] !== 8 ||
				bytes[position + 3] * 256 + bytes[position + 4] !== 192 ||
				bytes[position + 5] * 256 + bytes[position + 6] !== 192
			)
				return false;
			frame = true;
		} else if ([193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker))
			return false;
		if (marker === 218) return frame;
		position += length;
	}
	return false;
}
