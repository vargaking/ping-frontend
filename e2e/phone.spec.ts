import { expect, test } from '@playwright/test';
import { channelPath, createChannel, createServer, registerUser, uniqueName } from './helpers';

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
});

test('on a phone the navigation and the channel take turns on screen', async ({
	context,
	page
}) => {
	await registerUser(context);
	const serverName = uniqueName('Phone Guild');
	const server = await createServer(context, serverName);
	const channel = await createChannel(context, server.id, 'general');

	const rail = page.getByRole('navigation', { name: 'Servers' });
	const channelList = page.getByRole('complementary', { name: 'Channels' });
	const channelLink = channelList.getByRole('link', { name: 'general' });
	const heading = page.getByRole('heading', { name: 'general' });
	const navButton = page.getByRole('button', { name: 'Open navigation' });
	const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
	const messages = page.locator('[data-message-id]');

	await page.goto('/app/');
	await expect(rail).toBeInViewport();
	await expect(navButton).toBeHidden();

	await rail.getByRole('link', { name: serverName }).tap();
	await channelLink.tap();
	await expect(page).toHaveURL(channelPath(server.id, channel.id));
	await expect(heading).toBeInViewport();
	await expect(rail).not.toBeInViewport();

	await composer.tap();
	await composer.pressSequentially('first line');
	await composer.press('Enter');
	await composer.pressSequentially('second line');
	await expect(composer.locator('p')).toHaveCount(2);
	await expect(messages).toHaveCount(0);

	await page.getByRole('button', { name: 'Send message' }).tap();
	await expect(messages).toHaveCount(1);
	await expect(messages).toContainText(/first line\s*second line/);

	await navButton.tap();
	await expect(rail).toBeInViewport();

	await channelLink.tap();
	await expect(rail).not.toBeInViewport();

	await page.reload();
	await expect(heading).toBeInViewport();
	await expect(rail).not.toBeInViewport();
	await expect(messages).toHaveCount(1);
});
