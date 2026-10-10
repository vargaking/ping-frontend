import { expect, test, type Browser, type Page } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createForumPost,
	createInvite,
	createServer,
	joinInvite,
	newUser,
	openConversation,
	seedMessages,
	uniqueName
} from './helpers';

const HISTORY = 60;

const label = (n: number) => `msg ${String(n).padStart(3, '0')}`;
const seeded = (text: string) => `${text} ${'lorem ipsum dolor sit amet '.repeat(12)}`;
const history = () => Array.from({ length: HISTORY }, (_, i) => seeded(label(i + 1)));

const row = (page: Page, text: string) =>
	page.locator('[data-message-id]').filter({ hasText: text });

const scroller = (page: Page) =>
	page
		.locator('[data-message-id]')
		.first()
		.locator('xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]');

const scrollTop = (page: Page) => scroller(page).evaluate((el) => el.scrollTop);

const distanceFromBottom = (page: Page) =>
	scroller(page).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);

const scrollUp = (page: Page, screens: number) =>
	scroller(page).evaluate((el, screens) => {
		el.scrollTop = el.scrollHeight - el.clientHeight * (1 + screens);
	}, screens);

const jumpButton = (page: Page) => page.getByRole('button', { name: /^Jump to latest/ });

const rail = (page: Page) => page.getByRole('navigation', { name: 'Servers' });
const serverLink = (page: Page, name: string) =>
	rail(page).getByRole('link', { name: new RegExp(`^${name}`) });
const directLink = (page: Page) => rail(page).getByRole('link', { name: /^Direct messages/ });

const composerOf = (page: Page) =>
	page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');

async function channelWithHistory(browser: Browser) {
	const a = await newUser(browser, 'alice');
	const b = await newUser(browser, 'bob');
	const server = await createServer(a.context, uniqueName('Guild'));
	const channel = await createChannel(a.context, server.id, 'general');
	await joinInvite(b.context, (await createInvite(a.context, server.id)).id);
	const thread = { serverId: server.id, channelId: channel.id };
	await seedMessages(b.context, thread, history());
	await a.page.goto(channelPath(server.id, channel.id));
	await expect(row(a.page, label(HISTORY))).toBeInViewport({ timeout: 20_000 });
	return { a, b, server, channel, thread };
}

test('a scrolled-up channel stays put while messages arrive and counts them', async ({
	browser
}) => {
	const { a, b, server, thread } = await channelWithHistory(browser);
	await expect(jumpButton(a.page), 'no button at the bottom').toHaveCount(0);

	await scrollUp(a.page, 0.5);
	await expect(jumpButton(a.page), 'no button within a screen of the bottom').toHaveCount(0);

	await scrollUp(a.page, 2);
	await expect(jumpButton(a.page)).toHaveAccessibleName('Jump to latest');
	const before = await scrollTop(a.page);

	await seedMessages(b.context, thread, ['live 1', 'live 2', 'live 3']);
	await expect(jumpButton(a.page)).toHaveAccessibleName('Jump to latest, 3 new messages');
	await expect(jumpButton(a.page)).toContainText('3 new');
	expect(await scrollTop(a.page), 'the view should not move').toBe(before);
	await expect(row(a.page, 'live 3')).not.toBeInViewport();
	await expect(
		serverLink(a.page, server.name),
		'what arrived below the view is still unread'
	).toHaveAccessibleName(`${server.name}, unread messages`);

	await jumpButton(a.page).click();
	await expect(row(a.page, 'live 3')).toBeInViewport();
	await expect.poll(() => distanceFromBottom(a.page)).toBeLessThan(80);
	await expect(jumpButton(a.page)).toHaveCount(0);
	await expect(
		serverLink(a.page, server.name),
		'jumping marks the channel read'
	).toHaveAccessibleName(server.name);

	await scrollUp(a.page, 2);
	await expect(jumpButton(a.page)).toHaveAccessibleName('Jump to latest');
	await scroller(a.page).evaluate((el) => (el.scrollTop = el.scrollHeight));
	await expect(jumpButton(a.page), 'scrolling down by hand hides it').toHaveCount(0);
});

test('a scrolled-up DM keeps its unread count until you jump', async ({ browser }) => {
	const a = await newUser(browser, 'alice');
	const b = await newUser(browser, 'bob');
	const conversation = await openConversation(a.context, b.user.id);
	const thread = { conversationId: conversation.id };
	await seedMessages(b.context, thread, history());
	await a.page.goto(`/app/direct/${conversation.id}/`);
	await expect(row(a.page, label(HISTORY))).toBeInViewport({ timeout: 20_000 });

	await scrollUp(a.page, 2);
	await expect(jumpButton(a.page)).toHaveAccessibleName('Jump to latest');
	const before = await scrollTop(a.page);

	await seedMessages(b.context, thread, ['live 1', 'live 2', 'live 3']);
	await expect(jumpButton(a.page)).toHaveAccessibleName('Jump to latest, 3 new messages');
	expect(await scrollTop(a.page)).toBe(before);
	await expect(directLink(a.page)).toHaveAccessibleName('Direct messages, 3 unread');

	await jumpButton(a.page).click();
	await expect(row(a.page, 'live 3')).toBeInViewport();
	await expect(jumpButton(a.page)).toHaveCount(0);
	await expect(directLink(a.page)).toHaveAccessibleName('Direct messages');
});

test('Esc cancels a reply first, then jumps to the latest', async ({ browser }) => {
	const { a, b, thread } = await channelWithHistory(browser);
	await scrollUp(a.page, 2);
	await seedMessages(b.context, thread, ['fresh one']);
	await expect(jumpButton(a.page)).toHaveAccessibleName('Jump to latest, 1 new message');

	const middle = await scroller(a.page).evaluate((el) => {
		const box = el.getBoundingClientRect();
		const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
		return hit?.closest<HTMLElement>('[data-message-id]')?.dataset.messageId;
	});
	const target = a.page.locator(`[data-message-id="${middle}"]`);
	await target.hover();
	await target.getByRole('button', { name: 'Reply' }).click();
	const cancel = a.page.getByRole('button', { name: 'Cancel reply' });
	await expect(cancel).toBeVisible();
	const before = await scrollTop(a.page);

	await a.page.keyboard.press('Escape');
	await expect(cancel, 'the first Esc belongs to the reply').toHaveCount(0);
	expect(await scrollTop(a.page)).toBe(before);
	await expect(jumpButton(a.page)).toBeVisible();

	await a.page.keyboard.press('Escape');
	await expect(row(a.page, 'fresh one')).toBeInViewport();
	await expect(jumpButton(a.page)).toHaveCount(0);
});

test('sending while scrolled up goes to the bottom', async ({ browser }) => {
	const { a } = await channelWithHistory(browser);
	await scrollUp(a.page, 2);
	await expect(jumpButton(a.page)).toBeVisible();

	const composer = composerOf(a.page);
	await composer.click();
	await composer.fill('sent from up here');
	await composer.press('Enter');

	await expect(row(a.page, 'sent from up here')).toBeInViewport();
	await expect.poll(() => distanceFromBottom(a.page)).toBeLessThan(80);
	await expect(jumpButton(a.page)).toHaveCount(0);
});

test('a forum post counts new replies and jumps', async ({ browser }) => {
	const a = await newUser(browser, 'alice');
	const b = await newUser(browser, 'bob');
	const server = await createServer(a.context, uniqueName('Guild'));
	await joinInvite(b.context, (await createInvite(a.context, server.id)).id);
	const { channelId, postId } = await createForumPost(a.context, server.id, 'A long thread');
	const thread = { serverId: server.id, channelId, postId };
	await seedMessages(b.context, thread, history());

	await a.page.goto(`/app/server/${server.id}/forum/${channelId}/${postId}/`);
	await expect(row(a.page, label(HISTORY))).toBeInViewport({ timeout: 20_000 });
	await scrollUp(a.page, 2);
	await expect(jumpButton(a.page)).toHaveAccessibleName('Jump to latest');

	await seedMessages(b.context, thread, ['live 1', 'live 2', 'live 3']);
	await expect(jumpButton(a.page)).toHaveAccessibleName('Jump to latest, 3 new messages');

	await jumpButton(a.page).click();
	await expect(row(a.page, 'live 3')).toBeInViewport();
	await expect(jumpButton(a.page)).toHaveCount(0);
});

test("reading at the bottom clears the badge on the user's other tab", async ({ browser }) => {
	const a = await newUser(browser, 'alice');
	const b = await newUser(browser, 'bob');
	const server = await createServer(a.context, uniqueName('Guild'));
	const channel = await createChannel(a.context, server.id, 'general');
	const conversation = await openConversation(a.context, b.user.id);

	await a.page.goto(`/app/direct/${conversation.id}/`);
	await expect(composerOf(a.page)).toBeVisible();
	const otherTab = await a.context.newPage();
	await otherTab.goto(channelPath(server.id, channel.id));
	await expect(otherTab.getByRole('heading', { name: 'general' })).toBeVisible();
	await a.page.bringToFront();

	await seedMessages(b.context, { conversationId: conversation.id }, ['ping']);
	await expect(row(a.page, 'ping')).toBeInViewport();

	await expect
		.poll(
			async () => {
				const response = await a.context.request.get('/conversations/');
				const found = (await response.json()).find((c: { id: number }) => c.id === conversation.id);
				return found?.last_read_message_id === found?.last_message_id;
			},
			{ timeout: 5000, message: 'the server should learn that the message was read' }
		)
		.toBe(true);
	await expect(directLink(otherTab)).toHaveAccessibleName('Direct messages');
});

test('after missing more than a page offline, the button loads the newest messages', async ({
	browser
}) => {
	test.setTimeout(120_000);
	const { a, b, thread } = await channelWithHistory(browser);
	await scrollUp(a.page, 2);
	await expect(jumpButton(a.page)).toBeVisible();

	await a.context.setOffline(true);
	await expect(a.page.getByLabel('Connection status: Reconnecting')).toBeVisible({
		timeout: 40_000
	});
	await seedMessages(
		b.context,
		thread,
		Array.from({ length: HISTORY }, (_, i) => `gap ${String(i + 1).padStart(3, '0')}`)
	);
	await a.context.setOffline(false);

	await expect(jumpButton(a.page)).toHaveAccessibleName('Jump to latest', { timeout: 20_000 });
	await expect(row(a.page, 'gap 060'), 'the old window must not grow past the gap').toHaveCount(0);

	await seedMessages(b.context, thread, ['after gap']);
	await a.page.waitForTimeout(1500);
	await expect(row(a.page, 'after gap'), 'live messages wait for the newest page').toHaveCount(0);

	await jumpButton(a.page).click();
	await expect(row(a.page, 'after gap')).toBeInViewport();
	await expect(jumpButton(a.page)).toHaveCount(0);
});
