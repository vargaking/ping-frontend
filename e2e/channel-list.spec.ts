import { expect, test } from '@playwright/test';
import { createInvite, createServer, joinInvite, newUser, uniqueName } from './helpers';

const CATEGORY_HINT = 'No channels in this category.';
const SERVER_HINT = 'No channels yet.';

test('an owner sees a hint in each empty category until it gets a channel', async ({ browser }) => {
	const { page, context } = await newUser(browser, 'owner');
	const server = await createServer(context, uniqueName('Guild'));
	const channels = page.getByRole('complementary', { name: 'Channels' });
	const text = channels.getByRole('region', { name: 'Text channels' });
	const voice = channels.getByRole('region', { name: 'Voice channels' });

	await page.goto(`/app/server/${server.id}/`);
	await expect(text.getByText(CATEGORY_HINT)).toBeVisible({ timeout: 15_000 });
	await expect(voice.getByText(CATEGORY_HINT)).toBeVisible();
	await expect(
		channels.getByText(SERVER_HINT),
		'empty categories get their own hint, not the server-wide one'
	).toHaveCount(0);

	await channels.getByRole('button', { name: 'Create channel in Text channels' }).click();
	await page.getByPlaceholder('Channel name').fill('lobby');
	await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();

	await expect(text.getByRole('link', { name: 'lobby' })).toBeVisible();
	await expect(text.getByText(CATEGORY_HINT)).toHaveCount(0);
	await expect(voice.getByText(CATEGORY_HINT)).toBeVisible();
	await expect(channels.getByText(SERVER_HINT)).toHaveCount(0);
});

test('collapsing an empty category hides its hint', async ({ browser }) => {
	const { page, context } = await newUser(browser, 'owner');
	const server = await createServer(context, uniqueName('Guild'));
	const channels = page.getByRole('complementary', { name: 'Channels' });
	const voice = channels.getByRole('region', { name: 'Voice channels' });
	const toggle = voice.getByRole('button', { name: 'Voice channels', exact: true });

	await page.goto(`/app/server/${server.id}/`);
	await expect(voice.getByText(CATEGORY_HINT)).toBeVisible({ timeout: 15_000 });

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(voice.getByText(CATEGORY_HINT)).toHaveCount(0);
	await expect(
		channels.getByRole('region', { name: 'Text channels' }).getByText(CATEGORY_HINT)
	).toBeVisible();

	await toggle.click();
	await expect(voice.getByText(CATEGORY_HINT)).toBeVisible();
});

test('a member without Manage Channels sees the server-wide hint and no empty categories', async ({
	browser
}) => {
	const owner = await newUser(browser, 'owner');
	const member = await newUser(browser, 'member');
	const server = await createServer(owner.context, uniqueName('Guild'));
	await joinInvite(member.context, (await createInvite(owner.context, server.id)).id);

	await member.page.goto(`/app/server/${server.id}/`);
	await member.page.waitForLoadState('networkidle');
	const channels = member.page.getByRole('complementary', { name: 'Channels' });
	await expect(channels.getByText(SERVER_HINT)).toBeVisible({ timeout: 15_000 });
	await expect(channels.getByText(CATEGORY_HINT)).toHaveCount(0);
	await expect(channels.getByRole('region', { name: 'Text channels' })).toHaveCount(0);
	await expect(channels.getByRole('region', { name: 'Voice channels' })).toHaveCount(0);
});
