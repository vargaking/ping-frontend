import { expect, test } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createInvite,
	createServer,
	joinInvite,
	newUser,
	openConversation,
	sendMessageViaUi,
	uniqueName
} from './helpers';

test('a direct message arrives as unread for a user elsewhere in the app', async ({ browser }) => {
	const a = await newUser(browser, 'alice');
	const b = await newUser(browser, 'bob');

	const server = await createServer(a.context, uniqueName('Guild'));
	const channel = await createChannel(a.context, server.id, 'general');
	await joinInvite(b.context, (await createInvite(a.context, server.id)).id);

	await b.page.goto(channelPath(server.id, channel.id));
	await expect(b.page.getByRole('heading', { name: 'general' })).toBeVisible();

	const conversation = await openConversation(a.context, b.user.id);
	await a.page.goto(`/app/direct/${conversation.id}/`);
	await sendMessageViaUi(a.page, 'psst, over here');

	const directLink = b.page.getByRole('navigation', { name: 'Servers' }).getByRole('link', {
		name: /^Direct messages/
	});
	await expect(directLink, 'B should see an unread marker on the DM icon').toHaveAccessibleName(
		'Direct messages, 1 unread'
	);

	await directLink.click();
	await expect(b.page.getByRole('link', { name: a.user.username })).toBeVisible();
	await expect(b.page.getByRole('paragraph').filter({ hasText: 'psst, over here' })).toBeVisible();
	await expect(directLink).toHaveAccessibleName('Direct messages');
});
