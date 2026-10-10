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

test('on a phone swiping a message left past the threshold replies to it', async ({
	context,
	page
}) => {
	await registerUser(context);
	const server = await createServer(context, uniqueName('Reply Guild'));
	const channel = await createChannel(context, server.id, 'general');
	await page.goto(channelPath(server.id, channel.id));
	await expect(page.getByRole('heading', { name: 'general' })).toBeInViewport();

	const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
	await composer.fill('swipe me');
	await page.getByRole('button', { name: 'Send message' }).tap();
	const message = page.locator('[data-message-id]', { hasText: 'swipe me' });
	await expect(message).toBeVisible();
	await composer.blur();

	const box = (await message.boundingBox())!;
	const y = box.y + box.height / 2;
	const startX = box.x + box.width - 40;
	const cancelReply = page.getByRole('button', { name: 'Cancel reply' });
	const replying = cancelReply.locator('xpath=..');

	await drag(page, [startX, y], [startX - 30, y]);
	await expect(cancelReply).toHaveCount(0);
	await expect(composer).not.toBeFocused();

	await drag(page, [startX, y], [startX - 100, y]);
	await expect(cancelReply).toBeVisible();
	await expect(replying).toContainText('Replying to');
	await expect(replying).toContainText('swipe me');
	await expect(composer).toBeFocused();
	await expect(message).toHaveCSS('translate', 'none');
	await expect(page.getByRole('navigation', { name: 'Servers' })).not.toBeInViewport();
});

test('on a phone a swipe on a sideways scrolling code block does not reply', async ({
	context,
	page
}) => {
	await registerUser(context);
	const server = await createServer(context, uniqueName('Code Guild'));
	const channel = await createChannel(context, server.id, 'general');
	await page.goto(channelPath(server.id, channel.id));
	await expect(page.getByRole('heading', { name: 'general' })).toBeInViewport();

	const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
	await composer.tap();
	await composer.pressSequentially('```');
	await composer.press('Enter');
	await composer.pressSequentially('x'.repeat(200));
	await page.getByRole('button', { name: 'Send message' }).tap();
	const code = page.locator('[data-message-id] pre');
	await expect(code).toBeVisible();
	expect(await code.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
	await composer.blur();

	const box = (await code.boundingBox())!;
	const y = box.y + box.height / 2;
	const startX = box.x + box.width - 40;
	await drag(page, [startX, y], [startX - 100, y]);
	await expect(page.getByRole('button', { name: 'Cancel reply' })).toHaveCount(0);
});

test('on a phone Members in the server menu opens the member sheet', async ({ context, page }) => {
	await registerUser(context);
	const serverName = uniqueName('Sheet Guild');
	const server = await createServer(context, serverName);
	const channel = await createChannel(context, server.id, 'general');
	await page.goto(channelPath(server.id, channel.id));
	await expect(page.getByRole('heading', { name: 'general' })).toBeInViewport({ timeout: 15_000 });

	await page.getByRole('button', { name: 'Open navigation' }).tap();
	await page
		.getByRole('complementary', { name: 'Channels' })
		.getByRole('button', { name: serverName })
		.tap();
	await page.getByRole('menuitem', { name: 'Members' }).tap();

	const sheet = page.getByRole('complementary', { name: 'Members' });
	await expect(sheet).toBeInViewport();
	await sheet.getByRole('button', { name: 'Close members' }).tap();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('heading', { name: 'general' })).toBeInViewport();
});

test('on a phone the notification settings never say desktop', async ({ context, page }) => {
	await registerUser(context);
	await page.goto('/app/');
	await page.getByRole('button', { name: 'Account settings' }).tap();
	const settings = page.getByRole('dialog');
	await settings.getByRole('button', { name: 'Back to settings' }).tap();
	await settings.getByRole('button', { name: 'Notifications' }).tap();

	await expect(settings.getByText('Notifications while Zeta is open')).toBeVisible();
	await expect(settings.getByText(/desktop/i)).toHaveCount(0);
	await expect(settings.getByRole('button', { name: /test notification/i })).toHaveCount(0);
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

test('on a phone the top bar is the sticky box iOS looks for along the top edge', async ({
	context,
	page
}) => {
	await context.addInitScript(() => {
		try {
			localStorage.setItem('layoutInfo', 'on');
		} catch {
			// storage is unavailable on opaque origins
		}
	});
	await registerUser(context);
	await page.goto('/app/');

	const topEdge = page.locator('[data-layout-info] div').filter({ hasText: /^top edge/ });
	await expect(topEdge).toHaveText(/^top edgesticky .+/);
	await expect(topEdge).not.toContainText('+backdrop');
});

test('on a phone holding a message highlights it and opens its menu quickly, swiping it cancels the hold', async ({
	context,
	page
}) => {
	await registerUser(context);
	const server = await createServer(context, uniqueName('Hold Guild'));
	const channel = await createChannel(context, server.id, 'general');
	await page.goto(channelPath(server.id, channel.id));

	const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
	await composer.fill('hold me');
	await page.getByRole('button', { name: 'Send message' }).tap();
	const row = page.locator('[data-message-id]').filter({ hasText: 'hold me' });
	await expect(row).toBeVisible();
	await composer.blur();

	const box = (await row.boundingBox())!;
	const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	const menu = page.getByRole('menu');
	const cdp = await context.newCDPSession(page);
	const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', at = point) =>
		cdp.send('Input.dispatchTouchEvent', {
			type,
			touchPoints: type === 'touchEnd' ? [] : [at]
		});

	await touch('touchStart');
	await expect(row, 'highlighted as soon as the hold starts').toHaveAttribute('data-held', '');
	await page.waitForTimeout(450);
	await expect(menu, 'open well before the 700 ms default').toBeVisible({ timeout: 50 });
	await touch('touchEnd');
	await expect(menu).toBeVisible();
	await expect(row, 'stays highlighted while the menu is open').toHaveAttribute('data-held', '');

	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await expect(row).not.toHaveAttribute('data-held');

	await touch('touchStart');
	await touch('touchMove', { x: point.x, y: point.y + 20 });
	await expect(row, 'moving cancels the hold').not.toHaveAttribute('data-held');
	await page.waitForTimeout(800);
	await touch('touchEnd');
	await expect(menu).toBeHidden();

	await touch('touchStart');
	await expect(row).toHaveAttribute('data-held', '');
	for (let dx = 6; dx <= 72; dx += 6) await touch('touchMove', { x: point.x - dx, y: point.y });
	await expect(row, 'a swipe cancels the hold').not.toHaveAttribute('data-held');
	await page.waitForTimeout(600);
	await expect(menu, 'and the menu never opens').toBeHidden();
	await touch('touchEnd');
	await expect(page.getByRole('button', { name: 'Cancel reply' })).toBeVisible();
	await expect(menu).toBeHidden();
	await expect(row).not.toHaveAttribute('data-held');
	await cdp.detach();
});

test('on a phone the jump button stays above the composer while the keyboard is up', async ({
	context,
	page
}) => {
	await registerUser(context);
	const server = await createServer(context, uniqueName('Jump Guild'));
	const channel = await createChannel(context, server.id, 'general');
	await page.goto(channelPath(server.id, channel.id));

	const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
	const messages = page.locator('[data-message-id]');
	for (let i = 1; i <= 8; i++) {
		await composer.fill(`message ${i} ` + 'filler '.repeat(60));
		await page.getByRole('button', { name: 'Send message' }).tap();
		await expect(messages).toHaveCount(i);
	}
	await composer.blur();
	const appHeight = () =>
		page.evaluate(() => document.documentElement.style.getPropertyValue('--app-height'));
	const fullHeight = await appHeight();

	const scroller = messages
		.first()
		.locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]');
	await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
	const jump = page.getByRole('button', { name: /^Jump to latest/ });
	await expect(jump).toBeInViewport();

	await composer.tap();
	await expect.poll(appHeight).not.toBe(fullHeight);
	await expect(jump, 'the button follows the shell above the keyboard').toBeInViewport();
	const box = (await jump.boundingBox())!;
	const composerTop = (await page.getByRole('group', { name: 'Message composer' }).boundingBox())!
		.y;
	expect(box.y + box.height, 'the button sits above the composer').toBeLessThanOrEqual(composerTop);
});
