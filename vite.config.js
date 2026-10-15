import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { isPublicServerOrigin } from './scripts/public-server-origin.mjs';

export default defineConfig(({ command, mode }) => {
	if (command === 'build' && mode === 'production' && process.env.npm_lifecycle_event !== 'check') {
		const endpoint = loadEnv(mode, process.cwd(), 'VITE_').VITE_SERVER_URL?.trim();
		if (!isPublicServerOrigin(endpoint)) {
			throw new Error(
				'VITE_SERVER_URL must be a public HTTPS origin, such as your deployed Cloudflare Worker URL.'
			);
		}
	}

	return {
		// Preserve Vite's default secret exclusions and explicitly protect local game storage.
		server: {
			fs: {
				deny: [
					'.env',
					'.env.*',
					'*.{crt,pem,key,p12,pfx,cer,der}',
					'.npmrc',
					'.yarnrc.yml',
					'**/.git/**',
					'**/data/**',
					'**/*.sqlite*',
					'**/*.db',
					'**/*.db-*'
				]
			}
		},
		plugins: [tailwindcss(), sveltekit({ preprocess: vitePreprocess(), adapter: adapter() })]
	};
});
