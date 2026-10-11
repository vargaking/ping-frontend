import { devices, expect, test, type BrowserContext } from '@playwright/test';
import { createServer, registerUser, uniqueName } from './helpers';

// CI has no voice server, so a join ends in this toast rather than a call.
const NOT_SET_UP = "Voice isn't set up on this server.";

const IPHONE_USER_AGENT =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

test.use({
	viewport: { width: 390, height: 844 },
	hasTouch: true,
	isMobile: true,
	userAgent: IPHONE_USER_AGENT
});

test.beforeEach(async ({ context }) => {
	// An iPhone in Safari is nagged to install the app; keep that out of the way.
	await context.addInitScript(() => {
		try {
			for (const key of ['notifications:installPrompt', 'notifications:pushPrompt']) {
				localStorage.setItem(key, JSON.stringify({ dismissedAt: Date.now(), count: 1 }));
			}
		} catch {
			// storage is unavailable on opaque origins
		}
	});
	// With the microphone already allowed, joining goes straight to the token request.
	await context.grantPermissions(['microphone']);
});

async function createVoiceChannel(context: BrowserContext, serverId: number, name: string) {
	const response = await context.request.post(`/channels/${serverId}/create`, {
		data: { name, type: 'voice' }
	});
	expect(response.ok(), `creating ${name} responded ${response.status()}`).toBe(true);
	return (await response.json()) as { id: number; name: string };
}

function voicePath(serverId: number, channelId: number) {
	return `/app/server/${serverId}/voice/${channelId}/`;
}

test('on a phone a tap on a voice channel asks first, and Cancel leaves the list as it was', async ({
	context,
	page
}) => {
	await registerUser(context);
	const serverName = uniqueName('Voice Guild');
	const server = await createServer(context, serverName);
	await createVoiceChannel(context, server.id, 'lobby');

	const rail = page.getByRole('navigation', { name: 'Servers' });
	const channelList = page.getByRole('complementary', { name: 'Channels' });
	const sheet = page.getByRole('dialog', { name: 'Join lobby' });

	await page.goto('/app/');
	await rail.getByRole('link', { name: serverName }).tap();
	await expect(channelList.getByRole('link', { name: 'lobby' })).toBeVisible();
	const beforeTap = new URL(page.url()).pathname;
	await channelList.getByRole('link', { name: 'lobby' }).tap();

	await expect(sheet).toBeVisible();
	await expect(sheet.getByText("No one's here yet")).toBeVisible();
	await expect(page.getByText(NOT_SET_UP)).toHaveCount(0);
	expect(new URL(page.url()).pathname).toBe(beforeTap);
	await expect(rail).toBeInViewport();

	await sheet.getByRole('button', { name: 'Cancel' }).tap();

	await expect(sheet).toBeHidden();
	await expect(page.getByText(NOT_SET_UP)).toHaveCount(0);
	expect(new URL(page.url()).pathname).toBe(beforeTap);
	await expect(rail).toBeInViewport();
	await expect(channelList.getByRole('link', { name: 'lobby' })).toBeInViewport();
});

for (const label of ['Join', 'Join muted']) {
	test(`on a phone "${label}" closes the sheet and opens the voice view`, async ({
		context,
		page
	}) => {
		await registerUser(context);
		const serverName = uniqueName('Voice Guild');
		const server = await createServer(context, serverName);
		const channel = await createVoiceChannel(context, server.id, 'lobby');

		const rail = page.getByRole('navigation', { name: 'Servers' });
		const channelList = page.getByRole('complementary', { name: 'Channels' });
		const sheet = page.getByRole('dialog', { name: 'Join lobby' });

		await page.goto('/app/');
		await rail.getByRole('link', { name: serverName }).tap();
		await channelList.getByRole('link', { name: 'lobby' }).tap();
		await sheet.getByRole('button', { name: label, exact: true }).tap();

		await expect(sheet).toBeHidden();
		await expect(page.getByText(NOT_SET_UP)).toBeVisible();
		await expect(page).toHaveURL(voicePath(server.id, channel.id));
		await expect(page.getByRole('heading', { name: 'lobby', exact: true })).toBeInViewport();
		await expect(rail).not.toBeInViewport();
	});
}

test.describe('on a desktop', () => {
	test.use({
		viewport: { width: 1280, height: 800 },
		hasTouch: false,
		isMobile: false,
		userAgent: devices['Desktop Chrome'].userAgent
	});

	test('one click on a voice channel joins without asking', async ({ context, page }) => {
		await registerUser(context);
		const serverName = uniqueName('Voice Guild');
		const server = await createServer(context, serverName);
		const channel = await createVoiceChannel(context, server.id, 'lobby');

		await page.goto(`/app/server/${server.id}/`);
		await page
			.getByRole('complementary', { name: 'Channels' })
			.getByRole('link', { name: 'lobby' })
			.click();

		await expect(page.getByText(NOT_SET_UP)).toBeVisible();
		await expect(page).toHaveURL(voicePath(server.id, channel.id));
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});
});
