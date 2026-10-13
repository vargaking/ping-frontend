import { expect, test, type Page } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createServer,
	registerUser,
	uniqueName,
	newContext
} from './helpers';
import { activeFilters, replaceQuery } from './search-suggestions.helpers';

const PIXEL = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAAH0lEQVR4nGM4YWNDFcQwatCoQaMGjRo0atCoQQNvEACSR9AfWEHUdAAAAABJRU5ErkJggg==',
	'base64'
);

async function storedImageCount(page: Page): Promise<number> {
	return page.evaluate(
		() =>
			new Promise<number>((resolve, reject) => {
				const open = indexedDB.open('PingDatabase');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const request = open.result.transaction('messages').objectStore('messages').getAll();
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						open.result.close();
						resolve(request.result.filter((m) => m.hasImage === 1).length);
					};
				};
			})
	);
}

test('an image is found with from: and has:image and opened in its channel', async ({
	browser
}) => {
	const context = await newContext(browser);
	const me = await registerUser(context, 'filterer');
	const page = await context.newPage();

	const server = await createServer(context, uniqueName('Guild'));
	const general = await createChannel(context, server.id, 'general');
	const other = await createChannel(context, server.id, 'elsewhere');

	await page.goto(channelPath(server.id, general.id));
	const composer = page.getByRole('group', { name: 'Message composer' });
	await composer
		.locator('input[type="file"]')
		.setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL });
	await expect(composer.getByRole('button', { name: 'Remove pixel.png' })).toBeVisible();
	await expect(composer.getByRole('progressbar')).toBeHidden();
	await composer.getByRole('textbox').press('Enter');
	await expect(page.getByRole('img', { name: 'pixel.png' })).toBeVisible();
	await expect.poll(() => storedImageCount(page)).toBe(1);

	await page.goto(channelPath(server.id, other.id));
	await expect(page.getByRole('heading', { name: 'elsewhere' })).toBeVisible();

	await page.keyboard.press('Control+k');
	const search = page.getByRole('combobox', { name: 'Search messages' });
	await expect(search).toBeFocused();

	await page.getByRole('button', { name: /has:image/ }).click();
	await expect(search).toHaveValue('has:image');
	await expect(search).toBeFocused();

	await search.fill(`from:${me.username} has:image`);
	await expect(activeFilters(page)).toHaveText([`from:${me.username}`]);
	await expect(search).toHaveValue('has:image');
	const result = page.getByRole('option').filter({ hasText: '#general' });
	await expect(result).toBeVisible();
	await expect(result.locator('img')).toBeVisible();

	await replaceQuery(page, search, 'from:nobody-here has:image');
	await expect(page.getByText('Nothing found.')).toBeVisible();

	await replaceQuery(page, search, `from:${me.username} has:image`);
	await expect(result).toBeVisible();
	await search.press('Enter');

	await expect(page).toHaveURL(new RegExp(`/channel/${general.id}/`));
	const row = page.locator('[data-message-id]').filter({
		has: page.getByRole('img', { name: 'pixel.png' })
	});
	await expect(row).toBeVisible();
	await expect(row).toHaveClass(/bg-accent/);
});
