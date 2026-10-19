import assert from 'node:assert/strict';
import path from 'node:path';

/** Exercise the real cosmetic clock and body texture, without changing its pose in the test. */
export async function verifyBreathing(page, root, output) {
	await page.getByRole('button', { name: 'Enable breathing', exact: true }).click();
	// Wait for a true rest rather than comparing two arbitrary points in the cycle.
	await page.waitForFunction(() => {
		const root = document.querySelector('[data-testid="presence-character"]');
		const el = root?.querySelector('[data-testid="breathing-body"]');
		if (!el || root.dataset.phase !== 'still' || root.dataset.blinkStage !== 'open') return false;
		return new DOMMatrixReadOnly(getComputedStyle(el).transform).m22 === 1;
	});
	const rest = await root.screenshot({ path: path.join(output, 'breath-rest.png') });
	await page.waitForFunction(() => {
		const root = document.querySelector('[data-testid="presence-character"]');
		const el = root?.querySelector('[data-testid="breathing-body"]');
		if (!el || root.dataset.phase !== 'still' || root.dataset.blinkStage !== 'open') return false;
		return new DOMMatrixReadOnly(getComputedStyle(el).transform).m22 > 1.006;
	});
	const inhale = await root.screenshot({ path: path.join(output, 'breath-inhale.png') });
	const pose = await root.evaluate((el) => {
		const body = new DOMMatrixReadOnly(
			getComputedStyle(el.querySelector('[data-testid="breathing-body"]')).transform
		);
		return {
			scaleX: body.m11,
			scaleY: body.m22,
			head: getComputedStyle(el.querySelector('[data-testid="moving-head"]')).transform,
			neck: getComputedStyle(el.querySelector('[data-testid="fixed-neck"]')).transform,
			portrait: getComputedStyle(el).transform
		};
	});
	assert.ok(pose.scaleY > 1.006 && pose.scaleY <= 1.009);
	assert.ok(pose.scaleX > 1 && pose.scaleX <= 1.0018);
	assert.equal(pose.head, 'matrix(1, 0, 0, 1, 0, 0)');
	assert.equal(pose.neck, 'none');
	assert.equal(pose.portrait, 'none');
	const pixels = await page.evaluate(
		async ({ rest, inhale }) => {
			const load = async (data) => {
				const image = new Image();
				image.src = `data:image/png;base64,${data}`;
				await image.decode();
				return image;
			};
			const [a, b] = await Promise.all([load(rest), load(inhale)]);
			const canvas = document.createElement('canvas');
			canvas.width = a.width;
			canvas.height = a.height;
			const ctx = canvas.getContext('2d');
			ctx.drawImage(a, 0, 0);
			const before = ctx.getImageData(0, 0, a.width, a.height).data;
			ctx.clearRect(0, 0, a.width, a.height);
			ctx.drawImage(b, 0, 0);
			const after = ctx.getImageData(0, 0, a.width, a.height).data;
			let shoulders = 0,
				head = 0,
				neckGaps = 0;
			for (let y = 0; y < a.height; y++)
				for (let x = 0; x < a.width; x++) {
					const i = (y * a.width + x) * 4,
						px = (x / a.width) * 360,
						py = (y / a.height) * 360;
					const changed = before.slice(i, i + 3).some((v, j) => Math.abs(v - after[i + j]) > 3);
					if (changed && py >= 225 && py <= 250) shoulders++;
					if (changed && py >= 29 && py < 110) head++;
					if (
						px >= 157 &&
						px <= 206 &&
						py >= 211 &&
						py <= 229 &&
						after[i + 1] > after[i] + 4 &&
						after[i + 1] > after[i + 2]
					)
						neckGaps++;
				}
			return { shoulders, head, neckGaps };
		},
		{ rest: rest.toString('base64'), inhale: inhale.toString('base64') }
	);
	assert.ok(pixels.shoulders > 30, 'the painted shoulders themselves must breathe');
	assert.equal(pixels.head, 0, 'breathing must not move the head or hair');
	assert.equal(pixels.neckGaps, 0, 'the neck overlap must stay closed');
	// Turning the body channel off must not reset a concurrent public reaction.
	await page.getByRole('button', { name: 'Raise', exact: true }).click();
	await page.waitForFunction(
		() => document.querySelector('[data-testid="presence-character"]')?.dataset.phase === 'hold'
	);
	const commandEvent = await root.getAttribute('data-event');
	await page.getByRole('button', { name: 'Compare still body', exact: true }).click();
	await page.waitForFunction(
		() =>
			new DOMMatrixReadOnly(
				getComputedStyle(document.querySelector('[data-testid="breathing-body"]')).transform
			).m22 === 1
	);
	assert.equal(await root.getAttribute('data-event'), commandEvent);
	assert.notEqual(await root.getAttribute('data-phase'), 'notice');
	await page.getByRole('button', { name: 'Enable breathing', exact: true }).click();
	await page.getByRole('button', { name: 'Pause movement', exact: true }).click();
	assert.equal(
		await root.getByTestId('breathing-body').evaluate((el) => getComputedStyle(el).transform),
		'matrix(1, 0, 0, 1, 0, 0)'
	);
	await page.getByRole('button', { name: 'Resume', exact: true }).click();
	return {
		...pose,
		pixels,
		stillBodyComparison: 'does not interrupt public attention',
		pause: 'body returns to rest'
	};
}
