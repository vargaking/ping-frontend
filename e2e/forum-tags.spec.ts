import { expect, test } from '@playwright/test';
import {
	createForumPost,
	createInvite,
	createServer,
	joinInvite,
	newUser,
	uniqueName
} from './helpers';

const forumPath = (serverId: number, channelId: number) =>
	`/app/server/${serverId}/forum/${channelId}/`;

test('the owner adds a tag from the forum without selecting it', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const server = await createServer(owner.context, uniqueName('Guild'));
	const { channelId } = await createForumPost(owner.context, server.id, 'First thread');

	await owner.page.goto(forumPath(server.id, channelId));
	await owner.page.getByRole('button', { name: 'New tag' }).click();

	const name = owner.page.getByRole('textbox', { name: 'New tag name' });
	await expect(name).toBeFocused();
	await name.fill('Bugs');
	await name.press('Enter');

	const filters = owner.page.getByRole('group', { name: 'Filter by tag' });
	const chip = filters.getByRole('button', { name: 'Bugs' });
	await expect(chip).toBeVisible();
	await expect(chip, 'a new tag should not become a filter').toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await expect(name, 'the popover should close after adding').toBeHidden();
});

test('a member without Manage Channels has no New tag button', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const member = await newUser(browser, 'member');
	const server = await createServer(owner.context, uniqueName('Guild'));
	await joinInvite(member.context, (await createInvite(owner.context, server.id)).id);
	const { channelId } = await createForumPost(owner.context, server.id, 'First thread');

	await member.page.goto(forumPath(server.id, channelId));
	await expect(member.page.getByRole('heading', { name: 'First thread' })).toBeVisible();
	await expect(member.page.getByRole('button', { name: 'New tag' })).toHaveCount(0);
});
