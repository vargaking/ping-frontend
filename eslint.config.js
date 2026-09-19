import prettier from 'eslint-config-prettier';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',

			// Routes are static string paths and the app has no base path, so the
			// resolve() ceremony adds noise without value here.
			'svelte/no-navigation-without-resolve': 'off',

			// Profiles / server_profile / channel_settings are free-form JSON from
			// the backend; `any` is intentional at those boundaries. Keep it visible
			// as a warning rather than a hard failure.
			'@typescript-eslint/no-explicit-any': 'warn',

			// MessageNode renders recursive TipTap JSON that has no stable per-node
			// id; keying by index there is fine. Real data lists are keyed already.
			'svelte/require-each-key': 'warn',

			// new Date() is used for one-off formatting, not as reactive state, so
			// SvelteDate is unnecessary. Downgraded to a warning.
			'svelte/prefer-svelte-reactivity': 'warn'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	}
);
