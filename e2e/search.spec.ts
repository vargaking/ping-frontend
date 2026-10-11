import { expect, test, type Page } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createServer,
	registerUser,
	seedMessages,
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

test('a result far back opens in a window around it', async ({ browser }) => {
	const context = await browser.newContext();
	await registerUser(context, 'deepsearcher');
	const page = await context.newPage();

	const server = await createServer(context, uniqueName('Guild'));
	const general = await createChannel(context, server.id, 'general');
	const word = `quokka${Date.now().toString(36)}`;
	const label = (n: number) => `msg ${String(n).padStart(3, '0')}`;
	const filler = 'lorem ipsum dolor sit amet '.repeat(12);
	await seedMessages(
		context,
		{ serverId: server.id, channelId: general.id },
		Array.from({ length: 60 }, (_, i) =>
			i === 0 ? `${label(1)} ${word}` : `${label(i + 1)} ${filler}`
		)
	);

	const row = (text: string) => page.locator('[data-message-id]').filter({ hasText: text });
	const jumpButton = page.getByRole('button', { name: /^Jump to latest/ });

	await page.goto(channelPath(server.id, general.id));
	await expect(row(label(60))).toBeVisible({ timeout: 20_000 });
	await expect.poll(() => storedMessageCount(page, word)).toBe(1);

	const pageRequests: URL[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (
			url.pathname === `/channels/${general.id}/messages` &&
			url.searchParams.get('limit') === '50'
		) {
			pageRequests.push(url);
		}
	});

	await page.keyboard.press('Control+k');
	const search = page.getByRole('combobox', { name: 'Search messages' });
	await search.fill(word.slice(0, 8));
	await expect(page.getByRole('option').filter({ hasText: word })).toBeVisible();
	await search.press('Enter');

	await expect(row(label(1))).toBeVisible();
	await expect(row(label(1))).toHaveClass(/bg-accent/);
	await expect(page).not.toHaveURL(/[?&]m=/);
	await expect(row(label(60)), 'only a window around the result is loaded').toHaveCount(0);
	await expect(jumpButton).toHaveAccessibleName('Jump to latest');
	expect(pageRequests, 'one request opens the window').toHaveLength(1);
	expect(pageRequests[0].searchParams.has('around')).toBe(true);

	await sendMessageViaUi(page, 'sent from the window');
	await expect(row('sent from the window')).toBeInViewport();
	await expect(row(label(60))).toBeAttached();
	await expect(jumpButton).toHaveCount(0);
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
