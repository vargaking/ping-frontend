import { expect, test, type Page } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createInvite,
	createServer,
	joinInvite,
	newUser,
	uniqueName
} from './helpers';

const FRIENDS_PATH = '/app/direct/friends/';

function directLink(page: Page) {
	return page.getByRole('navigation', { name: 'Servers' }).getByRole('link', {
		name: /^Direct messages/
	});
}

function friendRow(page: Page, username: string, presence: 'online' | 'offline') {
	return page.getByRole('button', { name: `${username}, ${presence}`, exact: true });
}

test('a request from a profile card reaches the other user live, and accepting makes both lists show each other', async ({
	browser
}) => {
	const a = await newUser(browser, 'alice');
	const b = await newUser(browser, 'bob');

	const server = await createServer(a.context, uniqueName('Guild'));
	const channel = await createChannel(a.context, server.id, 'general');
	await joinInvite(b.context, (await createInvite(a.context, server.id)).id);

	await a.page.goto(channelPath(server.id, channel.id));
	await b.page.goto(channelPath(server.id, channel.id));
	await expect(b.page.getByRole('heading', { name: 'general' })).toBeVisible();
	await expect(directLink(b.page)).toHaveAccessibleName('Direct messages');

	await a.page
		.getByRole('complementary', { name: 'Members' })
		.getByRole('button', { name: b.user.username })
		.click();
	const card = a.page.getByRole('dialog');
	await card.getByRole('button', { name: 'Add friend' }).click();
	await expect(card.getByText('Request sent')).toBeVisible();

	await expect(
		directLink(b.page),
		'B should see the request on the DMs entry without reloading'
	).toHaveAccessibleName('Direct messages, 1 friend request');
	await expect(b.page.getByText(`${a.user.username} sent you a friend request`)).toBeVisible();

	await directLink(b.page).click();
	await b.page.getByRole('link', { name: 'Friends, 1 request' }).click();
	await expect(b.page.getByRole('heading', { name: 'Incoming requests' })).toBeVisible();
	await b.page.getByRole('button', { name: `Accept ${a.user.username}` }).click();

	await expect(b.page.getByRole('heading', { name: 'Incoming requests' })).toHaveCount(0);
	await expect(friendRow(b.page, a.user.username, 'online')).toBeVisible();
	await expect(directLink(b.page)).toHaveAccessibleName('Direct messages');

	await expect(a.page.getByText(`${b.user.username} accepted your friend request`)).toBeVisible();
	await directLink(a.page).click();
	await a.page.getByRole('link', { name: 'Friends', exact: true }).click();
	await expect(friendRow(a.page, b.user.username, 'online')).toBeVisible();
});

test('friends with no server in common see each other online and offline, and removing one empties both lists', async ({
	browser
}) => {
	const a = await newUser(browser, 'alice');
	const b = await newUser(browser, 'bob');

	await a.page.goto(FRIENDS_PATH);
	await b.page.goto(FRIENDS_PATH);
	await expect(b.page.getByRole('heading', { name: 'Friends', level: 1 })).toBeVisible();

	await a.page.getByLabel('Add by username').fill(b.user.username);
	await a.page.getByRole('button', { name: 'Send request' }).click();
	await expect(a.page.getByText(`Friend request sent to ${b.user.username}.`)).toBeVisible();
	await expect(
		a.page.getByRole('button', { name: `Cancel request to ${b.user.username}` })
	).toBeVisible();

	await b.page.getByRole('button', { name: `Accept ${a.user.username}` }).click();
	await expect(friendRow(b.page, a.user.username, 'online')).toBeVisible();
	await expect(
		friendRow(a.page, b.user.username, 'online'),
		'A should see B online although they share no server'
	).toBeVisible();

	await b.page.close();
	await expect(friendRow(a.page, b.user.username, 'offline')).toBeVisible();

	const bAgain = await b.context.newPage();
	await bAgain.goto(FRIENDS_PATH);
	await expect(friendRow(a.page, b.user.username, 'online')).toBeVisible();
	await expect(friendRow(bAgain, a.user.username, 'online')).toBeVisible();

	await friendRow(a.page, b.user.username, 'online').click();
	await expect(a.page).toHaveURL(/\/app\/direct\/\d+/);
	await a.page.getByRole('button', { name: b.user.username }).click();
	const card = a.page.getByRole('dialog');
	await expect(card.getByText('Friends', { exact: true })).toBeVisible();
	await card.getByRole('button', { name: 'More actions' }).click();
	await a.page.getByRole('menuitem', { name: 'Remove friend' }).click();
	await a.page.getByRole('button', { name: 'Remove', exact: true }).click();

	await expect(friendRow(bAgain, a.user.username, 'online')).toHaveCount(0);
	await expect(bAgain.getByText('No friends yet.')).toBeVisible();
	await expect(
		a.page.getByRole('link', { name: b.user.username }),
		'the conversation stays after the friendship ends'
	).toBeVisible();
});
