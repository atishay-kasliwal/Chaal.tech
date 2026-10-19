import assert from 'node:assert/strict';
import path from 'node:path';

/** Review actual painted mouth pixels with head follow off, then restore normal movement. */
export async function verifyMouth(page, root, output) {
	await page.getByRole('button', { name: 'Compare face only', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="mouth-parts"]')?.dataset.artReady === 'true'
	);
	await page.getByRole('button', { name: 'Neutral', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'still'
	);
	const mouth = root.getByTestId('mouth-parts');
	const neutral = await mouth.screenshot({ path: path.join(output, 'mouth-neutral.png') });
	await page.getByRole('button', { name: 'Win', exact: true }).click();
	await page.waitForFunction(
		() =>
			Number(
				document
					.querySelector('[data-testid="presence-character"]')
					?.style.getPropertyValue('--mouth')
			) > 0.55
	);
	const smile = await mouth.screenshot({ path: path.join(output, 'mouth-smile.png') });
	await root.screenshot({ path: path.join(output, 'face-smile.png') });
	const before = Number(await root.evaluate((el) => el.style.getPropertyValue('--mouth')));
	await page.getByRole('button', { name: 'Lose', exact: true }).click();
	const after = Number(await root.evaluate((el) => el.style.getPropertyValue('--mouth')));
	assert.ok(
		Math.abs(before - after) < 0.12,
		'new public result starts from current expression, without snapping'
	);
	await page.waitForFunction(
		() =>
			Number(
				document
					.querySelector('[data-testid="presence-character"]')
					?.style.getPropertyValue('--mouth')
			) < -0.55
	);
	const composed = await mouth.screenshot({ path: path.join(output, 'mouth-composed.png') });
	await root.screenshot({ path: path.join(output, 'face-composed.png') });
	const pixels = await page.evaluate(
		async (data) => {
			const images = await Promise.all(
				data.map(async (src) => {
					const i = new Image();
					i.src = `data:image/png;base64,${src}`;
					await i.decode();
					return i;
				})
			);
			const c = document.createElement('canvas');
			c.width = images[0].width;
			c.height = images[0].height;
			const ctx = c.getContext('2d');
			const values = images.map((image) => {
				ctx.clearRect(0, 0, c.width, c.height);
				ctx.drawImage(image, 0, 0);
				return ctx.getImageData(0, 0, c.width, c.height).data;
			});
			return values.slice(1).map((pixels) => {
				let changed = 0;
				for (let i = 0; i < pixels.length; i += 4)
					if (pixels.slice(i, i + 3).some((v, j) => Math.abs(v - values[0][i + j]) > 3)) changed++;
				return changed;
			});
		},
		[neutral, smile, composed].map((buffer) => buffer.toString('base64'))
	);
	assert.ok(
		pixels.every((count) => count > 80),
		'both generated mouth poses must visibly change mouth pixels'
	);
	await page.getByRole('button', { name: 'Neutral', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'still'
	);
	for (const patch of await mouth
		.locator('.mouth-pose')
		.evaluateAll((nodes) => nodes.map((n) => Number(getComputedStyle(n).opacity))))
		assert.equal(patch, 0);
	await page.getByRole('button', { name: 'Enable head follow', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="head-character"]')?.dataset.artReady === 'true'
	);
	return {
		smilePixels: pixels[0],
		composedPixels: pixels[1],
		interruption: 'continuous blend from current expression',
		neutral: 'approved original mouth restored',
		missingArt: 'tested separately'
	};
}
