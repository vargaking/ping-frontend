import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import basicSsl from '@vitejs/plugin-basic-ssl';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), basicSsl()],
	// Rune effects only run with Svelte's browser build; see src/test/webEnvironment.ts.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		include: ['src/**/*.test.ts'],
		environmentMatchGlobs: [['src/**/*.svelte.test.ts', './src/test/webEnvironment.ts']]
	},
	server: {
		proxy: {
			'/api': `http://${process.env.LOCAL_IP}:8000`,
			'/auth': `http://${process.env.LOCAL_IP}:8000`,
			'/users': `http://${process.env.LOCAL_IP}:8000`,
			'/servers': `http://${process.env.LOCAL_IP}:8000`,
			'/channels': `http://${process.env.LOCAL_IP}:8000`,
			'/conversations': `http://${process.env.LOCAL_IP}:8000`,
			'/messages': `http://${process.env.LOCAL_IP}:8000`,
			'/posts': `http://${process.env.LOCAL_IP}:8000`,
			'/unfurl': `http://${process.env.LOCAL_IP}:8000`,
			'/invites': `http://${process.env.LOCAL_IP}:8000`,
			'/server-requests': `http://${process.env.LOCAL_IP}:8000`,
			'/media': `http://${process.env.LOCAL_IP}:8000`,
			'/attachments': `http://${process.env.LOCAL_IP}:8000`,
			'/ws': { target: `ws://${process.env.LOCAL_IP}:8000`, ws: true }
		}
	}
});
