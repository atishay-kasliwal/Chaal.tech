import adapter from '@sveltejs/adapter-netlify';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
});
