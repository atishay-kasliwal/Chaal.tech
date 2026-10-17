/**
 * A fast, synchronous, stable 64-bit fingerprint (two independent 32-bit FNV-1a style lanes).
 * For integrity checks inside synchronous storage transactions, not for security.
 */
export function fingerprint64(text) {
	let a = 0x811c9dc5;
	let b = 0x9e3779b9;
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		a = Math.imul(a ^ code, 0x01000193);
		b = Math.imul(b ^ code, 0x5bd1e995);
		b ^= b >>> 15;
	}
	a ^= text.length;
	b ^= Math.imul(text.length, 0x27d4eb2d);
	return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** JSON with object keys sorted, so equal data always hashes equally regardless of key order. */
export function canonicalJson(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value && typeof value === 'object')
		return `{${Object.keys(value)
			.filter((key) => value[key] !== undefined)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
			.join(',')}}`;
	return JSON.stringify(value);
}
