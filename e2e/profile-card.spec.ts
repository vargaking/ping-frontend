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

test('a changed banner shows on an open profile card, and Message opens the DM', async ({
	browser
}) => {
	const owner = await newUser(browser, 'owner');
	const member = await newUser(browser, 'member');

	const server = await createServer(owner.context, uniqueName('Guild'));
	const channel = await createChannel(owner.context, server.id, 'general');
	await joinInvite(member.context, (await createInvite(owner.context, server.id)).id);

	await owner.page.goto(channelPath(server.id, channel.id));
	await member.page.goto(channelPath(server.id, channel.id));

	await member.page
		.getByRole('complementary', { name: 'Members' })
		.getByRole('button', { name: owner.user.username })
		.click();
	const card = member.page.getByRole('dialog');
	await expect(card.getByRole('heading', { name: owner.user.username })).toBeVisible();
	await expect(card.locator('[data-banner="default"]')).toBeVisible();

	await owner.page.getByRole('button', { name: 'Account settings' }).click();
	await owner.page.getByRole('radio', { name: '#0090ff' }).click();
	await owner.page.getByRole('button', { name: 'Save' }).click();
	await expect(owner.page.getByText('Profile updated')).toBeVisible();

	await expect(
		card.locator('[data-banner="color"]'),
		'the open card should pick up the new banner without a reload'
	).toHaveCSS('background-color', 'rgb(0, 144, 255)');

	await card.getByRole('button', { name: 'Message' }).click();
	await expect(member.page).toHaveURL(/\/app\/direct\/\d+/);
});
