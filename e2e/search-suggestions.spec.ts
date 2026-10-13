import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createServer,
	registerUser,
	sendMessageViaUi,
	uniqueName,
	newContext
} from './helpers';
import { activeFilters } from './search-suggestions.helpers';

async function storedMessageCount(page: Page): Promise<number> {
	return page.evaluate(
		() =>
			new Promise<number>((resolve, reject) => {
				const open = indexedDB.open('PingDatabase');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const request = open.result.transaction('messages').objectStore('messages').count();
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						open.result.close();
						resolve(request.result);
					};
				};
			})
	);
}

/** A signed-in user with one stored message, and the search dialog open. */
async function openSearch(browser: Browser) {
	const context = await newContext(browser);
	const me = await registerUser(context, 'suggester');
	const page = await context.newPage();
	const server = await createServer(context, uniqueName('Guild'));
	const general = await createChannel(context, server.id, 'general');

	await page.goto(channelPath(server.id, general.id));
	await sendMessageViaUi(page, 'hello there');
	await expect.poll(() => storedMessageCount(page)).toBe(1);

	await page.keyboard.press('Control+k');
	const search = page.getByRole('combobox', { name: 'Search messages' });
	await expect(search).toBeFocused();
	const suggestions = page.getByRole('listbox', { name: 'Suggestions' });
	return { me, page, search, suggestions, chips: activeFilters(page) };
}

const caretOf = (search: Locator) =>
	search.evaluate((el) => (el as HTMLInputElement).selectionStart);

test('a person is picked with the keyboard after from:', async ({ browser }) => {
	const { me, page, search, suggestions, chips } = await openSearch(browser);
	const url = page.url();

	await search.fill('from:');
	await expect(suggestions.getByRole('option', { name: me.username })).toBeVisible();
	await search.press('ArrowDown');
	await search.press('Enter');

	await expect(chips).toHaveText([`from:${me.username}`]);
	await expect(search).toHaveValue('');
	await expect(suggestions).toBeHidden();
	expect(page.url()).toBe(url);
});

test('has: offers four kinds and Tab inserts the highlighted one', async ({ browser }) => {
	const { search, suggestions, chips } = await openSearch(browser);

	await search.fill('has:');
	await expect(suggestions.getByRole('option')).toHaveCount(4);
	await search.press('ArrowDown');
	await search.press('ArrowDown');
	await search.press('Tab');

	await expect(chips).toHaveText(['has:video']);
	await expect(search).toHaveValue('');
});

test('suggestions follow a word that is still being composed', async ({ browser }) => {
	const { page, search, suggestions } = await openSearch(browser);
	const cdp = await page.context().newCDPSession(page);

	await cdp.send('Input.imeSetComposition', { text: 'has:', selectionStart: 4, selectionEnd: 4 });
	await expect(suggestions.getByRole('option')).toHaveCount(4);
	await cdp.send('Input.insertText', { text: 'has:' });
	await expect(search).toHaveValue('has:');
});

test('a quick date replaces the typed filter', async ({ browser }) => {
	const { page, search, suggestions, chips } = await openSearch(browser);
	const month = await page.evaluate(() => {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
	});

	await search.fill('after:');
	await expect(suggestions.getByRole('option')).toHaveCount(4);
	for (let i = 0; i < 3; i++) await search.press('ArrowDown');
	await search.press('Enter');

	await expect(chips).toHaveText([`during:${month}`]);
});

test('Backspace at the start turns the last chip back into text', async ({ browser }) => {
	const { search, chips } = await openSearch(browser);

	await search.fill('has:image mirage');
	await expect(chips).toHaveText(['has:image']);
	await expect(search).toHaveValue('mirage');

	await search.press('Home');
	await search.press('Backspace');
	await expect(chips).toHaveCount(0);
	await expect(search).toHaveValue('mirage has:image');
	expect(await caretOf(search)).toBe('mirage has:image'.length);
});

test('a suggestion inserted mid-text leaves the caret where the chip was', async ({ browser }) => {
	const { search, chips } = await openSearch(browser);

	await search.fill('has:im mirage');
	await expect(chips).toHaveCount(0);
	await search.press('Home');
	for (let i = 0; i < 6; i++) await search.press('ArrowRight');
	await search.press('Tab');

	await expect(chips).toHaveText(['has:image']);
	await expect(search).toHaveValue('mirage');
	expect(await caretOf(search)).toBe(0);
});

test('a pasted query becomes chips and a word', async ({ browser }) => {
	const { search, chips } = await openSearch(browser);

	await search.fill('from:x has:image after:2026-03-01 mirage');

	await expect(chips).toHaveText(['from:x', 'has:image', 'after:2026-03-01']);
	await expect(search).toHaveValue('mirage');
});

test('Escape closes the list first and the dialog second', async ({ browser }) => {
	const { search, suggestions } = await openSearch(browser);

	await search.fill('has:');
	await expect(suggestions).toBeVisible();

	await search.press('Escape');
	await expect(suggestions).toBeHidden();
	await expect(search).toBeVisible();

	await search.press('Escape');
	await expect(search).toBeHidden();
});
