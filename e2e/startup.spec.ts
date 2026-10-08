import { expect, test } from '@playwright/test';
import { channelPath, createChannel, createServer, newUser, uniqueName } from './helpers';

test('a reload fetches each channel list once and no global message sync', async ({ browser }) => {
	const { context, page } = await newUser(browser, 'starter');
	const first = await createServer(context, uniqueName('First'));
	const channel = await createChannel(context, first.id, 'general');
	const second = await createServer(context, uniqueName('Second'));
	await createChannel(context, second.id, 'general');

	const requests: string[] = [];
	page.on('request', (request) => requests.push(new URL(request.url()).pathname));

	await page.goto(channelPath(first.id, channel.id));
	await expect(page.getByRole('heading', { name: 'general' })).toBeVisible({ timeout: 15_000 });
	await page.waitForLoadState('networkidle');

	expect(requests.filter((path) => path.endsWith('/channels/messages'))).toEqual([]);
	expect(requests.filter((path) => path.endsWith(`/servers/${first.id}/channels`))).toHaveLength(1);
	expect(requests.filter((path) => path.endsWith(`/servers/${second.id}/channels`))).toHaveLength(
		1
	);
	expect(await page.evaluate(() => localStorage.getItem('last_updated'))).toBeNull();
});
