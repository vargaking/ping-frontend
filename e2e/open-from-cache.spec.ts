import { expect, test, type Page } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createServer,
	newUser,
	seedMessages,
	uniqueName
} from './helpers';

const MESSAGE_COUNT = 10;
const HISTORY_SYNC_PAGE_LIMIT = '100';
const DATABASE_NAME = 'PingDatabase';

const label = (n: number) => `msg ${String(n).padStart(3, '0')}`;

const message = (page: Page, n: number) =>
	page.locator('[data-message-id]').getByText(label(n), { exact: true });

const messageScroller = (page: Page) =>
	page
		.locator('[data-message-id]')
		.first()
		.locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]');

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

/** Holds the message list's request for the newest page until `release`, leaving the
 *  background history sync alone. */
async function holdNewestPage(page: Page, channelId: number) {
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	const state = { held: false, answered: false };
	await page.route(
		(url) =>
			url.pathname === `/channels/${channelId}/messages` &&
			!url.searchParams.has('before') &&
			!url.searchParams.has('around') &&
			!url.searchParams.has('after') &&
			url.searchParams.get('limit') !== HISTORY_SYNC_PAGE_LIMIT,
		async (route) => {
			state.held = true;
			await released;
			state.answered = true;
			await route.continue();
		}
	);
	return { state, release };
}

test('a channel opened a second time shows its cached messages before the newest page answers', async ({
	browser
}) => {
	const alice = await newUser(browser, 'alice');
	const server = await createServer(alice.context, uniqueName('Guild'));
	const channel = await createChannel(alice.context, server.id, 'general');
	await seedMessages(
		alice.context,
		{ serverId: server.id, channelId: channel.id },
		Array.from({ length: MESSAGE_COUNT }, (_, i) => label(i + 1))
	);

	await alice.page.goto(channelPath(server.id, channel.id));
	await expect(message(alice.page, MESSAGE_COUNT)).toBeVisible({ timeout: 20_000 });
	await expect
		.poll(() => storedMessages(alice.page), {
			message: 'the opened messages should be stored locally',
			timeout: 20_000
		})
		.toBeGreaterThanOrEqual(MESSAGE_COUNT);

	const { state, release } = await holdNewestPage(alice.page, channel.id);
	await alice.page.reload();
	await expect
		.poll(() => state.held, { message: 'the reloaded page should request the newest page' })
		.toBe(true);

	const newest = message(alice.page, MESSAGE_COUNT);
	await expect(newest, 'the cached messages should show while the request is held').toBeVisible();
	expect(state.answered, 'the request should still be waiting').toBe(false);
	await expect(
		messageScroller(alice.page).locator('[aria-busy="true"]'),
		'the skeleton should not show over cached messages'
	).toHaveCount(0);

	release();
	await expect.poll(() => state.answered).toBe(true);
	await expect(newest, 'the page should replace the cached messages, not double them').toHaveCount(
		1
	);
	await expect(message(alice.page, 1)).toHaveCount(1);
});
