import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import globals from 'globals';
import { fileURLToPath } from 'node:url';

export default [
	{ ignores: ['static/vendor/**', 'visual-baselines/**'] },
	includeIgnoreFile(fileURLToPath(new URL('./.gitignore', import.meta.url))),
	js.configs.recommended,
	...ts.configs.recommended.map((config) => ({ ...config, files: ['**/*.ts', '**/*.svelte'] })),
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{ languageOptions: { globals: { ...globals.browser, ...globals.node } } },
	{ files: ['**/*.ts'], languageOptions: { parser: ts.parser } },
	{
		files: ['**/*.svelte'],
		languageOptions: { parserOptions: { parser: ts.parser } },
		rules: { 'prefer-const': 'off', 'no-useless-assignment': 'off' }
	},
	// Existing unkeyed static/legacy lists are recorded without unrelated template rewrites.
	{
		files: [
			'src/routes/+page.svelte',
			'src/routes/test-cards/+page.svelte',
			'src/routes/[[]roomName]/UsersTable.svelte',
			'src/lib/components/Toasts/Toasts.svelte'
		],
		rules: { 'svelte/require-each-key': 'warn' }
	},
	// Record existing unused landing imports without rewriting the preserved landing page.
	{ files: ['src/routes/+page.svelte'], rules: { '@typescript-eslint/no-unused-vars': 'warn' } }
];
