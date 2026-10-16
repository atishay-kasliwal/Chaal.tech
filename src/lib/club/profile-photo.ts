/** Decode locally. Only the re-encoded crop ever leaves the device. */
export async function openProfilePhoto(file: File): Promise<ImageBitmap> {
	if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
		throw new Error('Choose a JPEG, PNG or WebP photo.');
	if (file.size > 5 * 1024 * 1024) throw new Error('Choose a photo smaller than 5 MB.');
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	if (bitmap.width * bitmap.height > 24_000_000) {
		bitmap.close();
		throw new Error('Choose a photo smaller than 24 megapixels.');
	}
	return bitmap;
}

export function cropProfilePhoto(
	canvas: HTMLCanvasElement,
	image: ImageBitmap,
	zoom: number,
	x: number,
	y: number
): string {
	canvas.width = canvas.height = 192;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Photo editing is unavailable in this browser.');
	const cropSize = Math.min(image.width, image.height) / zoom;
	const left = ((image.width - cropSize) * (x + 1)) / 2;
	const top = ((image.height - cropSize) * (y + 1)) / 2;
	context.fillStyle = '#fff8e8';
	context.fillRect(0, 0, 192, 192);
	context.drawImage(image, left, top, cropSize, cropSize, 0, 0, 192, 192);
	// Re-encoding strips EXIF/location and bounds the saved size, including noisy photos.
	for (const quality of [0.86, 0.72, 0.58, 0.44, 0.3]) {
		const photo = canvas.toDataURL('image/jpeg', quality);
		if (photo.length <= 32791) return photo;
	}
	throw new Error('This photo could not be resized. Try another image.');
}
