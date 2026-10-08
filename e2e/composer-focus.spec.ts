import { expect, test, type Page } from '@playwright/test';
import { channelPath, createChannel, createServer, registerUser, uniqueName } from './helpers';

async function openChannel(page: Page, serverName: string) {
	const context = page.context();
	await registerUser(context);
	const server = await createServer(context, serverName);
	const channel = await createChannel(context, server.id, 'general');
	await page.goto(channelPath(server.id, channel.id));
	const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
	await expect(composer).toBeVisible();
	return composer;
}

const blurEverything = (page: Page) =>
	page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test('typing with nothing focused puts the whole text in the composer', async ({ page }) => {
	const composer = await openChannel(page, uniqueName('Guild'));

	await blurEverything(page);
	await expect(composer).not.toBeFocused();
	await page.keyboard.type('hello');

	await expect(composer).toBeFocused();
	await expect(composer).toHaveText('hello');
});

test('typing appends where the caret was', async ({ page }) => {
	const composer = await openChannel(page, uniqueName('Guild'));

	await composer.pressSequentially('hello');
	await blurEverything(page);
	await page.keyboard.type('?!');

	await expect(composer).toBeFocused();
	await expect(composer).toHaveText('hello?!');
});

test('keys that are not text leave the composer alone', async ({ page }) => {
	const composer = await openChannel(page, uniqueName('Guild'));

	await blurEverything(page);
	await page.keyboard.press('Space');
	await expect(composer).not.toBeFocused();
	await expect(composer).toHaveText('');

	await page.keyboard.press('ControlOrMeta+k');
	await expect(composer).not.toBeFocused();
});

test('an open dialog keeps the keystrokes', async ({ page }) => {
	const serverName = uniqueName('Guild');
	const composer = await openChannel(page, serverName);

	await page.getByRole('button', { name: serverName }).click();
	await page.getByRole('menuitem', { name: 'Create channel', exact: true }).click();
	const dialog = page.getByRole('dialog');
	const channelName = dialog.getByPlaceholder('Channel name');
	await expect(channelName).toBeVisible();

	await blurEverything(page);
	await page.keyboard.type('stray');
	await expect(composer).not.toBeFocused();
	await expect(composer).toHaveText('');

	await channelName.click();
	await page.keyboard.type('random');
	await expect(channelName).toHaveValue('random');
	await expect(composer).toHaveText('');
});

test('an open emoji picker keeps the keystrokes', async ({ page }) => {
	const composer = await openChannel(page, uniqueName('Guild'));

	await blurEverything(page);
	await page.getByRole('button', { name: 'Add emoji' }).click();
	const search = page.locator('emoji-picker input');
	await expect(search).toBeFocused();

	await page.keyboard.type('smile');
	await expect(search).toHaveValue('smile');
	await expect(composer).toHaveText('');
});
