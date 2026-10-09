import { expect, test } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createInvite,
	createServer,
	joinInvite,
	newUser,
	uniqueName
} from './helpers';

test('making a channel private takes it away from a member without a reload', async ({
	browser
}) => {
	const owner = await newUser(browser, 'owner');
	const member = await newUser(browser, 'member');
	const server = await createServer(owner.context, uniqueName('Guild'));
	const general = await createChannel(owner.context, server.id, 'general');
	const secret = await createChannel(owner.context, server.id, 'secret');
	await joinInvite(member.context, (await createInvite(owner.context, server.id)).id);

	await member.page.goto(channelPath(server.id, secret.id));
	const memberSecretLink = member.page.getByRole('link', { name: 'secret' });
	await expect(memberSecretLink).toBeVisible({ timeout: 15_000 });

	await owner.page.goto(channelPath(server.id, secret.id));
	await owner.page.getByRole('button', { name: 'Channel settings' }).click();
	await owner.page.getByRole('button', { name: 'Permissions' }).click();
	await owner.page.getByLabel('Who keeps access').selectOption({ label: owner.user.username });
	await owner.page.getByRole('switch', { name: 'Private' }).click();
	await expect(owner.page.getByRole('switch', { name: 'Private' })).toBeChecked();

	await expect(
		member.page.getByText('You no longer have access to #secret'),
		'the member reading the channel should be told and moved off it'
	).toBeVisible();
	await expect(memberSecretLink, 'the channel should leave the sidebar').toHaveCount(0);
	await expect(member.page).not.toHaveURL(new RegExp(`/channel/${secret.id}/`));

	await owner.page.keyboard.press('Escape');
	await expect(
		owner.page.getByRole('link', { name: 'secret' }).getByRole('img', { name: 'Private' }),
		'the owner should see a lock on the private channel'
	).toBeVisible();

	// Opening the old URL by hand lands somewhere else, not in the private channel.
	await member.page.goto(channelPath(server.id, secret.id));
	await expect(member.page.getByRole('link', { name: 'general' })).toBeVisible();
	await expect(member.page.getByRole('link', { name: 'secret' })).toHaveCount(0);
	expect(general.id).not.toBe(secret.id);
});

test('a member who may not send sees a notice instead of the composer', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const member = await newUser(browser, 'member');
	const server = await createServer(owner.context, uniqueName('Guild'));
	const announcements = await createChannel(owner.context, server.id, 'announcements');
	await joinInvite(member.context, (await createInvite(owner.context, server.id)).id);

	await member.page.goto(channelPath(server.id, announcements.id));
	await expect(member.page.getByRole('group', { name: 'Message composer' })).toBeVisible({
		timeout: 15_000
	});

	const res = await owner.context.request.put(
		`/channels/${announcements.id}/permissions/members/${member.user.id}`,
		{ data: { allow: '0', deny: '2' } }
	);
	expect(res.status()).toBe(200);

	await expect(member.page.getByTestId('composer-no-send')).toBeVisible();
	await expect(member.page.getByRole('group', { name: 'Message composer' })).toHaveCount(0);
});
