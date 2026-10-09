import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { newUser, openConversation, seedDirectMessages } from './helpers';

const MESSAGE_COUNT = 120;
const OLDER_PAGE_DELAY_MS = 1000;

const label = (n: number) => `msg ${String(n).padStart(3, '0')}`;

const message = (page: Page, n: number) =>
	page.locator('[data-message-id]').getByText(label(n), { exact: true });

async function seededConversation(browser: Browser) {
	const a = await newUser(browser, 'alice');
	const b = await newUser(browser, 'bob');
	const conversation = await openConversation(a.context, b.user.id);
	await seedDirectMessages(
		a.context,
		conversation.id,
		Array.from({ length: MESSAGE_COUNT }, (_, i) => label(i + 1))
	);
	return { a, b, conversation };
}

/** Delays and records the requests for older history, leaving the newest page alone. */
async function delayOlderPages(page: Page, conversationId: number) {
	const requests: string[] = [];
	await page.route(
		(url) =>
			url.pathname === `/conversations/${conversationId}/messages` &&
			url.searchParams.has('before'),
		async (route) => {
			requests.push(route.request().url());
			await new Promise((resolve) => setTimeout(resolve, OLDER_PAGE_DELAY_MS));
			await route.continue();
		}
	);
	return requests;
}

async function openThread(page: Page, conversationId: number) {
	await page.goto(`/app/direct/${conversationId}/`);
	const newest = message(page, MESSAGE_COUNT);
	await expect(newest).toBeVisible({ timeout: 20_000 });
	return newest;
}

function scrollerOf(row: Locator) {
	return row.evaluateHandle((el) => {
		let node = el.parentElement;
		while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
		return node!;
	});
}

async function distanceFromBottom(row: Locator) {
	const scroller = await scrollerOf(row);
	return scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
}

test('a conversation opens at the newest message even when older history loads late', async ({
	browser
}) => {
	const { b, conversation } = await seededConversation(browser);
	const olderRequests = await delayOlderPages(b.page, conversation.id);

	const newest = await openThread(b.page, conversation.id);

	await b.page.waitForTimeout(OLDER_PAGE_DELAY_MS + 1000);

	await expect.soft(newest, 'the newest message should be on screen').toBeInViewport();
	expect
		.soft(await distanceFromBottom(newest), 'the list should rest at the bottom')
		.toBeLessThan(80);
	expect.soft(olderRequests, 'opening a thread should not request older history').toEqual([]);
});

test('scrolling to the top loads older history without moving the view', async ({ browser }) => {
	const { b, conversation } = await seededConversation(browser);
	const olderRequests = await delayOlderPages(b.page, conversation.id);

	const newest = await openThread(b.page, conversation.id);
	await b.page.waitForTimeout(500);

	const oldestLoaded = message(b.page, MESSAGE_COUNT - 49);
	const olderMessage = message(b.page, MESSAGE_COUNT - 50);
	await expect(olderMessage).toHaveCount(0);

	const scroller = await scrollerOf(newest);
	await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
	await expect(oldestLoaded).toBeInViewport();

	await expect(olderMessage, 'scrolling to the top should load the next page').toHaveCount(1, {
		timeout: OLDER_PAGE_DELAY_MS + 5000
	});
	expect(olderRequests).toHaveLength(1);
	await expect(oldestLoaded, 'the message at the top should stay where it was').toBeInViewport();
});
