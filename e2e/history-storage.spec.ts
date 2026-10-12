import { expect, test, type Page } from '@playwright/test';
import { createChannel, createServer, newUser, seedMessages, uniqueName } from './helpers';

const HISTORY_SYNC_PAGE_LIMIT = '100';
const DATABASE_NAME = 'PingDatabase';
const SYNC_START_DELAY_MS = 3000;
const MESSAGE_COUNT = 4;

/** How many messages the local history holds, read straight from IndexedDB. */
function storedMessages(page: Page) {
	return page.evaluate(
		(name) =>
			new Promise<number>((resolve, reject) => {
				const opening = indexedDB.open(name);
				opening.onerror = () => reject(opening.error);
				opening.onsuccess = () => {
					const database = opening.result;
					if (!database.objectStoreNames.contains('messages')) {
						database.close();
						resolve(0);
						return;
					}
					const counting = database.transaction('messages').objectStore('messages').count();
					counting.onerror = () => reject(counting.error);
					counting.onsuccess = () => {
						database.close();
						resolve(counting.result);
					};
				};
			}),
		DATABASE_NAME
	);
}

/** Records the background download's message page requests and can hold them back. */
async function historyPageGate(page: Page) {
	let open = true;
	let waiting: (() => void)[] = [];
	const requests: string[] = [];
	await page.route(
		(url) =>
			/^\/channels\/\d+\/messages$/.test(url.pathname) &&
			url.searchParams.get('limit') === HISTORY_SYNC_PAGE_LIMIT,
		async (route) => {
			requests.push(route.request().url());
			if (!open) await new Promise<void>((resolve) => waiting.push(resolve));
			// The page may have been left or the request abandoned while it was held.
			await route.continue().catch(() => {});
		}
	);
	return {
		requests,
		hold() {
			open = false;
		},
		release() {
			open = true;
			for (const resolve of waiting) resolve();
			waiting = [];
		}
	};
}

async function openStorageSettings(page: Page) {
	await page.getByRole('button', { name: 'Account settings' }).click();
	await page
		.getByRole('navigation', { name: 'Settings' })
		.getByRole('button', { name: 'Storage' })
		.click();
}

const downloadSwitch = (page: Page) => page.getByRole('switch', { name: 'Download full history' });

async function closeSettings(page: Page) {
	await page.getByRole('button', { name: 'Close settings' }).click();
}

async function setUp(browser: Parameters<typeof newUser>[0], word: string) {
	const alice = await newUser(browser, 'storage');
	const server = await createServer(alice.context, uniqueName('Guild'));
	const channel = await createChannel(alice.context, server.id, 'general');
	await seedMessages(alice.context, { serverId: server.id, channelId: channel.id }, [
		`the ${word} drifts`,
		...Array.from({ length: MESSAGE_COUNT - 1 }, (_, i) => `filler message ${i + 1}`)
	]);
	return alice;
}

test('the download switch survives a reload, stops the download and starts it again', async ({
	browser
}) => {
	const word = `narwhal${Date.now().toString(36)}`;
	const { page } = await setUp(browser, word);
	const gate = await historyPageGate(page);
	gate.hold();

	await page.goto('/app/');
	await openStorageSettings(page);
	await expect(downloadSwitch(page)).toBeChecked();
	await downloadSwitch(page).click();
	await expect(downloadSwitch(page)).not.toBeChecked();
	await closeSettings(page);

	await page.reload();
	gate.requests.length = 0;
	await openStorageSettings(page);
	await expect(downloadSwitch(page)).not.toBeChecked();
	await closeSettings(page);

	await page.keyboard.press('Control+k');
	await expect(page.getByText('History download is off on this device')).toBeVisible();
	// A download would start this long after the page loads.
	await page.waitForTimeout(SYNC_START_DELAY_MS + 1000);
	expect(gate.requests, 'no message pages are requested while the download is off').toEqual([]);
	expect(await storedMessages(page)).toBe(0);

	await page.keyboard.press('Control+k');
	await openStorageSettings(page);
	await downloadSwitch(page).click();
	await expect(downloadSwitch(page)).toBeChecked();
	await expect
		.poll(() => gate.requests.length, { message: 'turning it on starts the download' })
		.toBeGreaterThan(0);
	gate.release();
	await expect
		.poll(() => storedMessages(page), { timeout: 30_000 })
		.toBeGreaterThanOrEqual(MESSAGE_COUNT);
});

test('clearing removes what search found, and the download brings it back', async ({ browser }) => {
	const word = `kestrel${Date.now().toString(36)}`;
	const { page } = await setUp(browser, word);
	const gate = await historyPageGate(page);

	await page.goto('/app/');
	await expect
		.poll(() => storedMessages(page), { timeout: 30_000 })
		.toBeGreaterThanOrEqual(MESSAGE_COUNT);

	await page.keyboard.press('Control+k');
	const search = page.getByRole('combobox', { name: 'Search messages' });
	await search.fill(word);
	const result = page.getByRole('option').filter({ hasText: `the ${word} drifts` });
	await expect(result).toBeVisible();
	await page.keyboard.press('Control+k');

	gate.hold();
	await openStorageSettings(page);
	await page.getByRole('button', { name: 'Clear and download again' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Clear and download again' }).click();
	await expect.poll(() => storedMessages(page)).toBe(0);

	await page.keyboard.press('Control+k');
	await search.fill(word);
	await expect(page.getByText('Nothing found.')).toBeVisible();
	await page.keyboard.press('Control+k');

	gate.release();
	await expect
		.poll(() => storedMessages(page), { timeout: 30_000 })
		.toBeGreaterThanOrEqual(MESSAGE_COUNT);
	await page.keyboard.press('Control+k');
	await search.fill(word.slice(0, 8));
	await expect(result).toBeVisible();
});
