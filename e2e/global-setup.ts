import { chromium, expect, type FullConfig } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createServer,
	registerUser,
	sendMessageViaUi
} from './helpers';

/** Vite compiles routes on first request, which can outlast a test's first assertion. */
export default async function globalSetup(config: FullConfig) {
	const { baseURL, ignoreHTTPSErrors } = config.projects[0].use;
	const browser = await chromium.launch();
	try {
		const context = await browser.newContext({ baseURL, ignoreHTTPSErrors });
		await registerUser(context, 'warmup');
		const server = await createServer(context, 'Warmup');
		const channel = await createChannel(context, server.id, 'general');
		const page = await context.newPage();
		await page.goto(channelPath(server.id, channel.id));
		const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
		await expect(composer).toBeVisible({ timeout: 60_000 });
		await sendMessageViaUi(page, 'warm up');
	} finally {
		await browser.close();
	}
}
