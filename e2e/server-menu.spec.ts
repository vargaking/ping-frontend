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

test('Members in the server menu and the rail menu opens the member list', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const member = await newUser(browser, 'member');
	const serverName = uniqueName('Menu Guild');
	const server = await createServer(owner.context, serverName);
	const channel = await createChannel(owner.context, server.id, 'general');
	await joinInvite(member.context, (await createInvite(owner.context, server.id)).id);

	const { page } = owner;
	await page.goto(channelPath(server.id, channel.id));
	const panel = page.getByRole('complementary', { name: 'Members' });
	const toggle = page.getByRole('button', { name: 'Toggle member list' });
	await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
	await toggle.click();
	await expect(panel).toBeHidden();

	await page
		.getByRole('complementary', { name: 'Channels' })
		.getByRole('button', { name: serverName })
		.click();
	const items = page.getByRole('menuitem');
	await expect(items.filter({ hasText: 'Server settings' })).toBeVisible();
	const labels = await items.allInnerTexts();
	expect(labels.findIndex((l) => l.includes('Members'))).toBeLessThan(
		labels.findIndex((l) => l.includes('Server settings'))
	);
	await items.filter({ hasText: 'Members' }).click();
	await expect(panel).toBeVisible();
	await expect(panel.getByText(member.user.username)).toBeVisible();

	await toggle.click();
	await expect(panel).toBeHidden();
	await page
		.getByRole('navigation', { name: 'Servers' })
		.getByRole('link', { name: serverName })
		.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Members' }).click();
	await expect(panel).toBeVisible();

	await member.page.goto(channelPath(server.id, channel.id));
	await member.page
		.getByRole('complementary', { name: 'Channels' })
		.getByRole('button', { name: serverName })
		.click();
	await member.page.getByRole('menuitem', { name: 'Members' }).click();
	const memberPanel = member.page.getByRole('complementary', { name: 'Members' });
	await expect(memberPanel.getByText(owner.user.username)).toBeVisible();
});

test('Members in the rail menu of another server switches to it and opens the list', async ({
	browser
}) => {
	const owner = await newUser(browser, 'owner');
	const first = await createServer(owner.context, uniqueName('First'));
	const firstChannel = await createChannel(owner.context, first.id, 'general');
	const secondName = uniqueName('Second');
	const second = await createServer(owner.context, secondName);
	await createChannel(owner.context, second.id, 'general');

	const { page } = owner;
	await page.goto(channelPath(first.id, firstChannel.id));
	const toggle = page.getByRole('button', { name: 'Toggle member list' });
	await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
	await toggle.click();
	await page
		.getByRole('navigation', { name: 'Servers' })
		.getByRole('link', { name: secondName })
		.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Members' }).click();

	await expect(page).toHaveURL(new RegExp(`/app/server/${second.id}/`));
	await expect(page.getByRole('complementary', { name: 'Members' })).toBeVisible();
});
