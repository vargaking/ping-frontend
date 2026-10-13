import { expect, test, type Page } from '@playwright/test';
import { channelPath, createChannel, createServer, newUser, uniqueName } from './helpers';

const OUTSIDE_DANGER = [
	'View channels',
	'Create invites',
	'Send messages',
	'Manage messages',
	'Connect',
	'Speak',
	'Stream',
	'Mute members',
	'Move members',
	'Manage channels',
	'Manage invites',
	'Kick members',
	'Manage roles'
];
const DANGER = ['Delete channels', 'Manage server', 'Match imported authors'];
const MODERATION = ['Manage messages', 'Kick members', 'Mute members', 'Move members'];

const allowed = (page: Page, label: string) =>
	page.getByRole('radiogroup', { name: label }).getByRole('radio', { name: 'Allow' });

async function openRoles(page: Page, serverName: string) {
	await page
		.getByRole('complementary', { name: 'Channels' })
		.getByRole('button', { name: serverName })
		.click();
	await page.getByRole('menuitem', { name: 'Server settings' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Roles' }).click();
}

async function createFromPreset(page: Page, name: string, preset: string) {
	await page.getByLabel('New role name').fill(name);
	await page.getByLabel('Start from').selectOption({ label: preset });
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(name);
}

test('creating a role from a preset ticks its toggles and leaves the danger zone alone', async ({
	browser
}) => {
	const owner = await newUser(browser, 'owner');
	const serverName = uniqueName('Preset Guild');
	const server = await createServer(owner.context, serverName);
	const channel = await createChannel(owner.context, server.id, 'general');
	await owner.page.goto(channelPath(server.id, channel.id));

	await openRoles(owner.page, serverName);
	await expect(
		owner.page.getByText('No custom roles yet.'),
		'a new server should come with @everyone only'
	).toBeVisible();

	await createFromPreset(owner.page, 'Admins', 'Admin');
	for (const label of OUTSIDE_DANGER) await expect(allowed(owner.page, label)).toBeChecked();
	for (const label of DANGER) await expect(allowed(owner.page, label)).not.toBeChecked();
	await expect(
		owner.page.locator('fieldset section[aria-label]').last(),
		'the danger zone should be the last group'
	).toHaveAttribute('aria-label', 'Danger zone');

	await owner.page.getByRole('button', { name: 'All roles' }).click();
	await createFromPreset(owner.page, 'Mods', 'Moderator');
	for (const label of OUTSIDE_DANGER) {
		const on = expect(allowed(owner.page, label));
		await (MODERATION.includes(label) ? on.toBeChecked() : on.not.toBeChecked());
	}

	const roles = await (await owner.context.request.get(`/servers/${server.id}/roles`)).json();
	const allow = (name: string) => roles.find((r: { name: string }) => r.name === name).allow;
	expect(allow('Admins')).toBe('15359');
	expect(allow('Mods')).toBe('12804');
});
