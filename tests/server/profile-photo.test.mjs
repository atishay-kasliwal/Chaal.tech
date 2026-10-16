import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isProfilePhoto } from '../../server/club/profile-photo.mjs';
import { profilePatch, publicProfile } from '../../server/club/members.mjs';
const jpeg = await readFile(new URL('../fixtures/profile-photo.jpg', import.meta.url));
const asPhoto = (bytes) => `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;
const photo = asPhoto(jpeg);

test('accepts a small real cropped JPEG and supports removal', () => {
	assert.equal(isProfilePhoto(photo), true);
	assert.equal(profilePatch({ photoDataUrl: photo }).photoDataUrl, photo);
	assert.deepEqual(profilePatch({ photoDataUrl: null }), { photoDataUrl: null });
	assert.equal(publicProfile({ _id: 'me', photoDataUrl: photo }).photoDataUrl, photo);
	assert.equal(
		publicProfile({ _id: 'me', photoDataUrl: 'https://tracker.example/photo' }).photoDataUrl,
		null
	);
});

test('rejects remote URLs, SVGs, malformed images and oversized uploads', () => {
	for (const value of [
		'https://example.com/avatar.jpg',
		'data:image/svg+xml;base64,PHN2Zz4=',
		'data:image/jpeg;base64,AAAA',
		{},
		'data:image/jpeg;base64,' + 'A'.repeat(40000)
	]) {
		assert.equal(isProfilePhoto(value), false);
		assert.throws(() => profilePatch({ photoDataUrl: value }), { code: 'INVALID_PROFILE' });
	}
});

test('rejects location/comment metadata and unexpected dimensions', () => {
	for (const marker of [0xe1, 0xed, 0xfe]) {
		const metadata = Buffer.from([0xff, marker, 0, 8, 69, 120, 105, 102, 0, 0]);
		assert.equal(
			isProfilePhoto(asPhoto(Buffer.concat([jpeg.subarray(0, 2), metadata, jpeg.subarray(2)]))),
			false
		);
	}
	const altered = Buffer.from(jpeg);
	const sof = altered.indexOf(Buffer.from([255, 192]));
	assert.ok(sof > 0);
	altered[sof + 8] = 255;
	assert.equal(isProfilePhoto(asPhoto(altered)), false);
});
