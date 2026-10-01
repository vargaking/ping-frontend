import { defineConfig, devices } from '@playwright/test';

const baseURL = 'https://localhost:5173';

export default defineConfig({
	testDir: 'e2e',
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL,
		ignoreHTTPSErrors: true,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'npm run dev -- --port 5173 --strictPort',
		url: baseURL,
		ignoreHTTPSErrors: true,
		reuseExistingServer: !process.env.CI,
		env: { LOCAL_IP: process.env.LOCAL_IP ?? '127.0.0.1' }
	}
});
