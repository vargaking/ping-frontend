import { expect, test } from '@playwright/test';
import { createChannel, createServer, newUser, uniqueName } from './helpers';

test('the channel list always matches the selected server', async ({ browser }) => {
	const a = await newUser(browser);
	const withChannels = uniqueName('Alpha Guild');
	const empty = uniqueName('Empty Guild');

	const server1 = await createServer(a.context, withChannels);
	await createChannel(a.context, server1.id, 'alpha');
	await createChannel(a.context, server1.id, 'beta');
	await createServer(a.context, empty);

	const { page } = a;
	const rail = page.getByRole('navigation', { name: 'Servers' });
	const channels = page.getByRole('complementary', { name: 'Channels' });
	const selectServer = (name: string) => rail.getByRole('link', { name }).click();

	await page.goto('/app/direct/');

	for (const [name, hasChannels] of [
		[withChannels, true],
		[empty, false],
		[withChannels, true],
		[empty, false]
	] as const) {
		await selectServer(name);
		await expect(rail.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
		await expect(channels.getByRole('button', { name })).toBeVisible();

		if (hasChannels) {
			await expect(channels.getByRole('link', { name: 'alpha' })).toBeVisible();
			await expect(channels.getByRole('link', { name: 'beta' })).toBeVisible();
			await expect(channels.getByText('No channels yet.')).toBeHidden();
		} else {
			await expect(channels.getByText('No channels in this category.')).toHaveCount(2);
			await expect(channels.getByText('No channels yet.')).toBeHidden();
			await expect(
				channels.getByRole('link'),
				`${name} should not list another server's channels`
			).toHaveCount(0);
		}
	}
});
