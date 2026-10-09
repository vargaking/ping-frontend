import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createServer,
	registerUser,
	sendMessageViaUi,
	uniqueName
} from './helpers';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function openChannel(page: Page, serverName = uniqueName('Guild')) {
	const context = page.context();
	await registerUser(context);
	const server = await createServer(context, serverName);
	const channel = await createChannel(context, server.id, 'general');
	await page.goto(channelPath(server.id, channel.id));
	const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
	await expect(composer).toBeVisible();
	return composer;
}

/** What a double-click on the first word of `target` leaves selected. */
async function doubleClickSelection(target: Locator) {
	const page = target.page();
	const word = await target.evaluate((element) => {
		window.getSelection()?.removeAllRanges();
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		let node = walker.nextNode();
		while (node && !node.textContent?.trim()) node = walker.nextNode();
		if (!node) throw new Error('no text to click');
		const text = node.textContent ?? '';
		const start = text.search(/\S/);
		const range = document.createRange();
		range.setStart(node, start);
		range.setEnd(node, start + text.trim().split(/\s/)[0].length);
		const box = range.getBoundingClientRect();
		return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	});
	await page.mouse.dblclick(word.x, word.y);
	return page.evaluate(() => window.getSelection()?.toString().trim() ?? '');
}

test('navigation and headers cannot be selected', async ({ page }) => {
	await openChannel(page);

	const channelLink = page
		.getByRole('complementary', { name: 'Channels' })
		.getByRole('link', { name: 'general' });
	expect(await doubleClickSelection(channelLink)).toBe('');
	expect(await doubleClickSelection(page.getByRole('heading', { name: 'general' }))).toBe('');
});

test('messages can be selected without the markers around them', async ({ page }) => {
	const serverName = uniqueName('Guild');
	const composer = await openChannel(page, serverName);

	await sendMessageViaUi(page, 'selectable');
	const first = page.getByText('selectable', { exact: true });
	expect(await doubleClickSelection(first)).toBe('selectable');

	// The second click of the pair lands on the page behind the menu the first one opened.
	expect(await doubleClickSelection(page.getByRole('button', { name: serverName }))).toBe('');
	await page.keyboard.press('Escape');

	await sendMessageViaUi(page, 'draft');
	await composer.press('ArrowUp');
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type('reworded');
	await page.keyboard.press('Enter');
	await expect(page.getByText('(edited)')).toBeVisible();

	await first.hover();
	await page.getByRole('button', { name: 'Add reaction' }).click();
	await page.getByRole('button', { name: 'thumbs up' }).click();
	await expect(page.getByRole('button', { name: /👍/ })).toContainText('1');

	const divider = page.getByRole('separator', { name: 'Today' });
	const from = await divider.locator('..').boundingBox();
	const to = await page.locator('[data-message-id]').last().boundingBox();
	if (!from || !to) throw new Error('the message list is not on screen');
	await page.evaluate(() => window.getSelection()?.removeAllRanges());
	await page.mouse.move(from.x + 4, from.y + 4);
	await page.mouse.down();
	await page.mouse.move(to.x + to.width - 4, to.y + to.height - 2, { steps: 10 });
	await page.mouse.up();

	await page.keyboard.press('ControlOrMeta+c');
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	expect(copied).toContain('selectable');
	expect(copied).toContain('reworded');
	expect(copied).not.toContain('Today');
	expect(copied).not.toContain('(edited)');
	expect(copied).not.toContain('👍');
});

test('fields still take text while dialog chrome stays unselectable', async ({ page }) => {
	const serverName = uniqueName('Guild');
	const composer = await openChannel(page, serverName);

	await composer.click();
	await page.keyboard.type('unsent');
	expect(await doubleClickSelection(composer)).toBe('unsent');

	await page.getByRole('button', { name: serverName }).click();
	await page.getByRole('menuitem', { name: 'Create channel', exact: true }).click();
	const dialog = page.getByRole('dialog');
	expect(await doubleClickSelection(dialog.getByRole('heading'))).toBe('');

	const channelName = dialog.getByPlaceholder('Channel name');
	await channelName.click();
	await page.keyboard.type('random');
	await expect(channelName).toHaveValue('random');
});

test('pages outside the app keep normal text selection', async ({ page }) => {
	await page.goto('/login');
	expect(await doubleClickSelection(page.getByRole('heading', { name: 'Sign in' }))).toBe('Sign');
});

test.describe('on a touch screen', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('messages stay unselectable and the composer still takes text', async ({ page }) => {
		const composer = await openChannel(page);

		await composer.tap();
		await composer.pressSequentially('thumbed');
		await page.getByRole('button', { name: 'Send message' }).tap();
		const message = page.locator('[data-message-id]').getByText('thumbed', { exact: true });
		await expect(message).toBeVisible();

		expect(await doubleClickSelection(message)).toBe('');
	});
});
