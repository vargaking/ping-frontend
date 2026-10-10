import { expect, test, type Page } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createServer,
	registerUser,
	sendMessageViaUi,
	uniqueName
} from './helpers';

async function storedMessageCount(page: Page, word: string): Promise<number> {
	return page.evaluate(
		(needle) =>
			new Promise<number>((resolve, reject) => {
				const open = indexedDB.open('PingDatabase');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const request = open.result.transaction('messages').objectStore('messages').getAll();
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						open.result.close();
						resolve(request.result.filter((m) => m.words?.includes(needle)).length);
					};
				};
			}),
		word
	);
}

test('a stored message is found with Ctrl+K and opened in its channel', async ({ browser }) => {
	const context = await browser.newContext();
	await registerUser(context, 'searcher');
	const page = await context.newPage();

	const server = await createServer(context, uniqueName('Guild'));
	const general = await createChannel(context, server.id, 'general');
	const other = await createChannel(context, server.id, 'elsewhere');
	const word = `zebrafish${Date.now().toString(36)}`;

	await page.goto(channelPath(server.id, general.id));
	await sendMessageViaUi(page, `the ${word} swims`);
	await expect.poll(() => storedMessageCount(page, word)).toBe(1);

	await page.goto(channelPath(server.id, other.id));
	await expect(page.getByRole('heading', { name: 'elsewhere' })).toBeVisible();

	await page.keyboard.press('Control+k');
	const search = page.getByRole('combobox', { name: 'Search messages' });
	await expect(search).toBeFocused();
	await search.fill(word.slice(0, 8));

	const result = page.getByRole('option').filter({ hasText: `the ${word} swims` });
	await expect(result).toBeVisible();
	await expect(result).toContainText('#general');
	await search.press('Enter');

	await expect(page).toHaveURL(new RegExp(`/channel/${general.id}/`));
	const row = page.locator('[data-message-id]').filter({ hasText: `the ${word} swims` });
	await expect(row).toBeVisible();
	await expect(row).toHaveClass(/bg-accent/);
	await expect(page).not.toHaveURL(/[?&]m=/);

	await page.keyboard.press('Control+k');
	await expect(search).toHaveValue(word.slice(0, 8));
	await page.keyboard.press('Control+k');
	await expect(search).toBeHidden();
});

test('the top bar search bar opens the search dialog', async ({ browser }) => {
	const context = await browser.newContext();
	await registerUser(context, 'barsearcher');
	const page = await context.newPage();

	const server = await createServer(context, uniqueName('Guild'));
	const general = await createChannel(context, server.id, 'general');

	await page.goto(channelPath(server.id, general.id));
	await page.getByRole('button', { name: 'Search' }).click();
	await expect(page.getByRole('combobox', { name: 'Search messages' })).toBeFocused();
});
