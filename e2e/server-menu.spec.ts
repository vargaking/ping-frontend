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

const settings = (page: Page) => page.getByRole('dialog');
const membersHeading = (page: Page) =>
	settings(page).getByRole('heading', { name: 'Members', level: 1 });

async function closeSettings(page: Page) {
	await settings(page).getByRole('button', { name: 'Close settings' }).click();
	await expect(settings(page)).toBeHidden();
}

test('Members in the server menu and the rail menu opens the member list', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const member = await newUser(browser, 'member');
	const serverName = uniqueName('Menu Guild');
	const server = await createServer(owner.context, serverName);
	const channel = await createChannel(owner.context, server.id, 'general');
	await joinInvite(member.context, (await createInvite(owner.context, server.id)).id);

	const { page } = owner;
	await page.goto(channelPath(server.id, channel.id));
	await expect(page.getByRole('button', { name: 'Toggle member list' })).toHaveAttribute(
		'aria-pressed',
		'true',
		{ timeout: 15_000 }
	);

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
	await expect(membersHeading(page)).toBeVisible();
	await expect(
		settings(page).getByRole('row').filter({ hasText: member.user.username })
	).toBeVisible();
	await closeSettings(page);

	await page
		.getByRole('navigation', { name: 'Servers' })
		.getByRole('link', { name: serverName })
		.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Members' }).click();
	await expect(membersHeading(page)).toBeVisible();

	await member.page.goto(channelPath(server.id, channel.id));
	await member.page
		.getByRole('complementary', { name: 'Channels' })
		.getByRole('button', { name: serverName })
		.click();
	await member.page.getByRole('menuitem', { name: 'Members' }).click();
	await expect(
		settings(member.page).getByRole('row').filter({ hasText: owner.user.username })
	).toBeVisible();
	await expect(settings(member.page).getByRole('button', { name: /^Actions for/ })).toHaveCount(0);
});

test('Members in the rail menu of another server switches to it and opens its list', async ({
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
	await expect(page.getByRole('heading', { name: 'general' })).toBeVisible({ timeout: 15_000 });
	await page
		.getByRole('navigation', { name: 'Servers' })
		.getByRole('link', { name: secondName })
		.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Members' }).click();

	await expect(page).toHaveURL(new RegExp(`/app/server/${second.id}/`));
	await expect(membersHeading(page)).toBeVisible();
	await expect(settings(page).getByRole('heading', { name: secondName })).toBeVisible();
});

test('on a direct message page the rail menu opens Members for the server last visited', async ({
	browser
}) => {
	const owner = await newUser(browser, 'owner');
	const serverName = uniqueName('Lingering');
	const server = await createServer(owner.context, serverName);
	const channel = await createChannel(owner.context, server.id, 'general');

	const { page } = owner;
	await page.goto(channelPath(server.id, channel.id));
	await expect(page.getByRole('heading', { name: 'general' })).toBeVisible({ timeout: 15_000 });
	const rail = page.getByRole('navigation', { name: 'Servers' });
	await rail.getByRole('link', { name: /^Direct messages/ }).click();
	await expect(page).toHaveURL(/\/app\/direct\//);

	await rail.getByRole('link', { name: serverName }).click({ button: 'right' });
	const items = page.getByRole('menuitem');
	await expect(items.filter({ hasText: 'Members' })).toBeVisible();
	await expect(items.filter({ hasText: 'Server settings' })).toHaveCount(0);
	await items.filter({ hasText: 'Members' }).click();

	await expect(page).toHaveURL(new RegExp(`/app/server/${server.id}/`));
	await expect(membersHeading(page)).toBeVisible();
});
