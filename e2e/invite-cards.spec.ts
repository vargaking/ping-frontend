import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createServer,
	joinInvite,
	newUser,
	openConversation,
	sendMessageViaUi,
	uniqueName
} from './helpers';
import {
	createInviteWith,
	deleteInvite,
	inviteUrl,
	landingPageEmbed,
	postDirectMessages,
	revokeInvite
} from './invite-cards.helpers';

const inviteCards = (within: Page | Locator) =>
	within.getByRole('group', { name: 'Server invite' });

const messageWith = (page: Page, code: string) =>
	page.locator('[data-message-id]').filter({ hasText: code });

test('a non-member joins from the invite card, which then offers Open', async ({ browser }) => {
	const a = await newUser(browser, 'owner');
	const b = await newUser(browser, 'guest');
	const serverName = uniqueName('Guild');
	const server = await createServer(a.context, serverName);
	await createChannel(a.context, server.id, 'general');
	const invite = await createInviteWith(a.context, server.id);
	const conversation = await openConversation(a.context, b.user.id);
	const link = inviteUrl(invite.id);
	await postDirectMessages(a.context, conversation.id, [
		{ text: link, embeds: [landingPageEmbed(link)] }
	]);

	const direct = `/app/direct/${conversation.id}/`;
	await b.page.goto(direct);
	const card = inviteCards(b.page);
	await expect(card.getByText(serverName)).toBeVisible();
	await expect(card.getByText('1 member', { exact: true })).toBeVisible();
	await expect(
		b.page.getByText('Landing page preview'),
		'the card should replace the preview that came with the message'
	).toHaveCount(0);
	await expect(card).toHaveCount(1);

	await card.getByRole('button', { name: 'Join' }).click();
	await expect(b.page).toHaveURL(new RegExp(`/app/server/${server.id}`));
	await expect(
		b.page.getByRole('navigation', { name: 'Servers' }).getByRole('link', { name: serverName })
	).toBeVisible();

	await b.page.goto(direct);
	await expect(card.getByRole('button', { name: 'Open' })).toBeVisible();
	await expect(card.getByRole('button', { name: 'Join' })).toHaveCount(0);
	await expect(
		card.getByText('2 members', { exact: true }),
		'the count should include the new member'
	).toBeVisible();

	await card.getByRole('button', { name: 'Open' }).click();
	await expect(b.page).toHaveURL(new RegExp(`/app/server/${server.id}`));
});

test('cards for a revoked and a deleted invite say so and have no button', async ({ browser }) => {
	const a = await newUser(browser, 'owner');
	const b = await newUser(browser, 'guest');
	const server = await createServer(a.context, uniqueName('Guild'));
	await createChannel(a.context, server.id, 'general');
	const revoked = await createInviteWith(a.context, server.id);
	const deleted = await createInviteWith(a.context, server.id);
	await revokeInvite(a.context, revoked.id);
	await deleteInvite(a.context, deleted.id);
	const conversation = await openConversation(a.context, b.user.id);
	await postDirectMessages(a.context, conversation.id, [
		{ text: inviteUrl(revoked.id) },
		{ text: inviteUrl(deleted.id) }
	]);

	await b.page.goto(`/app/direct/${conversation.id}/`);

	const expired = inviteCards(messageWith(b.page, revoked.id));
	await expect(expired.getByText('This invite has expired')).toBeVisible();
	await expect(expired.getByRole('button')).toHaveCount(0);

	const gone = inviteCards(messageWith(b.page, deleted.id));
	await expect(gone.getByText('This invite is no longer valid')).toBeVisible();
	await expect(gone.getByRole('button')).toHaveCount(0);
});

test('a member sees Open instead of Join, also on a message sent from the composer', async ({
	browser
}) => {
	const a = await newUser(browser, 'owner');
	const b = await newUser(browser, 'member');
	const server = await createServer(a.context, uniqueName('Guild'));
	const channel = await createChannel(a.context, server.id, 'general');
	const invite = await createInviteWith(a.context, server.id);
	await joinInvite(b.context, invite.id);
	const link = inviteUrl(invite.id);

	await a.page.goto(channelPath(server.id, channel.id));
	await sendMessageViaUi(a.page, link);
	await expect(inviteCards(a.page).getByRole('button', { name: 'Open' })).toBeVisible();
	await expect(inviteCards(a.page)).toHaveCount(1);

	await b.page.goto(channelPath(server.id, channel.id));
	await expect(inviteCards(b.page).getByRole('button', { name: 'Open' })).toBeVisible();
	await expect(inviteCards(b.page).getByRole('button', { name: 'Join' })).toHaveCount(0);
});

test('a password invite sends the reader to the invite page, which asks for it', async ({
	browser
}) => {
	const a = await newUser(browser, 'owner');
	const b = await newUser(browser, 'guest');
	const serverName = uniqueName('Guild');
	const server = await createServer(a.context, serverName);
	await createChannel(a.context, server.id, 'general');
	const invite = await createInviteWith(a.context, server.id, { password: 'open-sesame' });
	const conversation = await openConversation(a.context, b.user.id);
	await postDirectMessages(a.context, conversation.id, [{ text: inviteUrl(invite.id) }]);

	await b.page.goto(`/app/direct/${conversation.id}/`);
	const card = inviteCards(b.page);
	await expect(card.getByText(serverName)).toBeVisible();
	await expect(card.getByLabel(/password/i)).toHaveCount(0);

	await card.getByRole('button', { name: 'Join' }).click();

	await expect(b.page).toHaveURL(new RegExp(`/invite/${invite.id}`));
	await expect(b.page.getByText('Invite Password Required')).toBeVisible();
});

test('several cards for one invite ask the server once', async ({ browser }) => {
	const a = await newUser(browser, 'owner');
	const b = await newUser(browser, 'guest');
	const serverName = uniqueName('Guild');
	const server = await createServer(a.context, serverName);
	await createChannel(a.context, server.id, 'general');
	const invite = await createInviteWith(a.context, server.id);
	const conversation = await openConversation(a.context, b.user.id);
	const link = inviteUrl(invite.id);
	await postDirectMessages(a.context, conversation.id, [
		{ text: link },
		{ text: `${link}?second` },
		{ text: `${link}?third` }
	]);

	let lookups = 0;
	b.page.on('request', (request) => {
		const { pathname } = new URL(request.url());
		if (request.method() === 'GET' && pathname === `/invites/${invite.id}`) lookups += 1;
	});
	await b.page.goto(`/app/direct/${conversation.id}/`);

	const cards = inviteCards(b.page);
	await expect(cards).toHaveCount(3);
	await expect(cards.getByText(serverName)).toHaveCount(3);
	expect(lookups, 'GET /invites/<code> requests').toBe(1);
});
