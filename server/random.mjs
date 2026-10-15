const UINT32_RANGE = 0x1_0000_0000;

/** Cryptographically secure, max-exclusive integer random source for Node and Workers. */
export function secureRandomInt(minOrMax, maybeMax) {
	const min = maybeMax === undefined ? 0 : minOrMax;
	const max = maybeMax === undefined ? minOrMax : maybeMax;
	if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min)
		throw new RangeError('Invalid random integer range');
	const range = max - min;
	if (range > UINT32_RANGE) throw new RangeError('Random integer range is too large');
	const limit = Math.floor(UINT32_RANGE / range) * range;
	const value = new Uint32Array(1);
	do crypto.getRandomValues(value);
	while (value[0] >= limit);
	return min + (value[0] % range);
}

export function secureRandomBytes(size) {
	if (!Number.isSafeInteger(size) || size < 0 || size > 65536)
		throw new RangeError('Invalid random byte count');
	const bytes = new Uint8Array(size);
	crypto.getRandomValues(bytes);
	return bytes;
}

export function toHex(bytes) {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256(secret, message) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return new Uint8Array(
		await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
	);
}
