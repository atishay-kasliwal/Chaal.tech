import { readdirSync } from 'node:fs';

/** Keep asset groups off the Pages Worker without hiding the prototype app routes. */
export function pagesAssetExclusions() {
	const root = new URL('../static/', import.meta.url);
	/** @param {URL} directory */
	const entries = (directory) =>
		readdirSync(directory, { withFileTypes: true }).filter((entry) => !entry.name.startsWith('_'));
	/** @param {import('node:fs').Dirent} entry */
	const rule = (entry, prefix = '') => `/${prefix}${entry.name}${entry.isDirectory() ? '/*' : ''}`;
	return entries(root).flatMap((entry) =>
		entry.name === 'prototypes' && entry.isDirectory()
			? entries(new URL('prototypes/', root)).map((asset) => rule(asset, 'prototypes/'))
			: rule(entry)
	);
}
