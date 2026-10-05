import { expect, test, type Page } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createInvite,
	createRole,
	createServer,
	joinInvite,
	newUser,
	uniqueName
} from './helpers';

const members = (page: Page) => page.getByRole('complementary', { name: 'Members' });

test('the owner changes a member’s roles from the members sidebar', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const member = await newUser(browser, 'member');

	const server = await createServer(owner.context, uniqueName('Guild'));
	const channel = await createChannel(owner.context, server.id, 'general');
	await createRole(owner.context, server.id, 'Helper');
	await createRole(owner.context, server.id, 'Scout');
	await joinInvite(member.context, (await createInvite(owner.context, server.id)).id);

	await owner.page.goto(channelPath(server.id, channel.id));
	await member.page.goto(channelPath(server.id, channel.id));

	const row = members(owner.page).getByRole('button', { name: member.user.username });
	const helper = owner.page.getByRole('menuitemcheckbox', { name: 'Helper' });
	const scout = owner.page.getByRole('menuitemcheckbox', { name: 'Scout' });

	await row.click();
	await owner.page.getByRole('menuitem', { name: 'Roles' }).click();
	await helper.click();
	await expect(helper).toBeChecked();
	await expect(scout, 'the submenu should stay open after a tick').toBeVisible();
	await expect(
		members(member.page).getByText('Helper', { exact: true }),
		'the member should see their new role without reloading'
	).toBeVisible();

	await scout.click();
	await helper.click();
	await expect(helper).not.toBeChecked();
	await expect(members(member.page).getByText('Scout', { exact: true })).toBeVisible();
	await expect(members(member.page).getByText('Helper', { exact: true })).toBeHidden();

	await members(member.page).getByRole('button', { name: owner.user.username }).click();
	await expect(member.page.getByRole('menuitem', { name: 'Message' })).toBeVisible();
	await expect(
		member.page.getByRole('menuitem', { name: 'Roles' }),
		'a member without Manage Roles should not get the submenu'
	).toHaveCount(0);
});
