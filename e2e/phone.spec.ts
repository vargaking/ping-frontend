import { expect, test, type Page } from '@playwright/test';
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

/** A finger dragging in small, paced steps, slower than a flick. */
async function drag(page: Page, from: [number, number], to: [number, number]) {
	const cdp = await page.context().newCDPSession(page);
	const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) / 6;
	const at = (i: number) => ({
		x: from[0] + ((to[0] - from[0]) * i) / steps,
		y: from[1] + ((to[1] - from[1]) * i) / steps
	});
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(0)] });
	for (let i = 1; i <= steps; i++) {
		await page.waitForTimeout(20);
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(i)] });
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await cdp.detach();
}

test('on a phone a sideways swipe moves between the navigation and the channel', async ({
	context,
	page
}) => {
	await registerUser(context);
	const server = await createServer(context, uniqueName('Swipe Guild'));
	const channel = await createChannel(context, server.id, 'general');
	await page.goto(channelPath(server.id, channel.id));

	const rail = page.getByRole('navigation', { name: 'Servers' });
	const heading = page.getByRole('heading', { name: 'general' });
	await expect(heading).toBeInViewport();
	const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
	for (const word of ['alpha', 'bravo']) {
		await composer.fill(`${word} `.repeat(250));
		await page.getByRole('button', { name: 'Send message' }).tap();
	}
	await expect(page.locator('[data-message-id]')).toHaveCount(2);
	const scroller = page
		.locator('[data-message-id]')
		.first()
		.locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]');
	const scrollTop = () => scroller.evaluate((el) => el.scrollTop);

	await drag(page, [5, 400], [200, 400]);
	await expect(rail).not.toBeInViewport();

	await drag(page, [100, 400], [300, 400]);
	await expect(rail).toBeInViewport();

	await drag(page, [250, 400], [60, 400]);
	await expect(rail).not.toBeInViewport();
	await expect(heading).toBeInViewport();

	const before = await scrollTop();
	await drag(page, [200, 300], [200, 600]);
	expect(await scrollTop()).toBeLessThan(before);
	await expect(rail).not.toBeInViewport();
});

test('on a phone the list stays at the bottom when the shell shrinks for the keyboard', async ({
	context,
	page
}) => {
	await registerUser(context);
	const server = await createServer(context, uniqueName('Keyboard Guild'));
	const channel = await createChannel(context, server.id, 'general');
	await page.goto(channelPath(server.id, channel.id));

	const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
	const messages = page.locator('[data-message-id]');
	for (let i = 1; i <= 6; i++) {
		await composer.fill(`message ${i} ` + 'filler '.repeat(60));
		await page.getByRole('button', { name: 'Send message' }).tap();
		await expect(messages).toHaveCount(i);
	}
	await composer.blur();
	const newest = page.getByText(/^message 6 /);
	await expect(newest).toBeInViewport();
	const appHeight = () =>
		page.evaluate(() => document.documentElement.style.getPropertyValue('--app-height'));
	const fullHeight = await appHeight();

	// With an iPhone user agent, focusing the composer shrinks the shell ahead of the
	// keyboard. Without a real keyboard it grows back after a second.
	await composer.tap();
	await expect.poll(appHeight).not.toBe(fullHeight);
	await expect(page.getByText(/^message 6 /), 'the newest message stays in view').toBeInViewport();
	const composerBottom = (await composer.boundingBox())!.y + (await composer.boundingBox())!.height;
	expect(composerBottom, 'the composer sits above where the keyboard will be').toBeLessThan(
		844 * 0.59
	);
	await expect.poll(appHeight, { timeout: 3000 }).toBe(fullHeight);
	await expect(newest).toBeInViewport();
	await composer.blur();

	const scroller = messages
		.first()
		.locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]');
	await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
	await expect(page.getByText(/^message 1 /)).toBeInViewport();
	await composer.tap();
	await expect.poll(appHeight).not.toBe(fullHeight);
	await page.waitForTimeout(200);
	await expect(
		page.getByText(/^message 1 /),
		'scrolled up, the list must not jump to the bottom'
	).toBeInViewport();
	await expect(newest).not.toBeInViewport();
});
