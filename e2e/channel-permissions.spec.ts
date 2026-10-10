import { expect, test, type Page } from '@playwright/test';
import {
	channelPath,
	createCategory,
	createChannel,
	createInvite,
	createRole,
	createServer,
	everyoneRoleId,
	joinInvite,
	newUser,
	putOverwrite,
	setMemberRoles,
	uniqueName
} from './helpers';

const VIEW = '1';
const SEND = '2';
const MANAGER_PERMISSIONS = '2171';

async function openPermissions(page: Page) {
	await page.getByRole('button', { name: 'Channel settings' }).click();
	await page.getByRole('button', { name: 'Permissions' }).click();
	await expect(page.getByTestId('channel-permissions')).toBeVisible();
	await expect(page.getByLabel('Add a role')).toBeVisible();
}

function permissionRow(page: Page, name: string) {
	return page.locator('details', { has: page.locator('summary', { hasText: name }) });
}

async function openRow(page: Page, name: string) {
	const row = permissionRow(page, name);
	await row.locator('summary').click();
	await expect(row).toHaveJSProperty('open', true);
	return row;
}

// A row added here stays open while it changes; one opened by hand closes again after a change.
async function addRow(page: Page, name: string) {
	await page.getByLabel('Add a role').selectOption({ label: name });
	const row = permissionRow(page, name);
	await expect(row).toHaveJSProperty('open', true);
	return row;
}

const toggle = (row: ReturnType<typeof permissionRow>, label: string) =>
	row.getByRole('radiogroup', { name: label });

const option = (row: ReturnType<typeof permissionRow>, label: string, value: string) =>
	toggle(row, label).getByRole('radio', { name: value });

function recordRequests(page: Page) {
	const requests: { method: string; path: string; body: string | null }[] = [];
	page.on('request', (request) => {
		if (!['xhr', 'fetch'].includes(request.resourceType())) return;
		requests.push({
			method: request.method(),
			path: new URL(request.url()).pathname,
			body: request.postData()
		});
	});
	return requests;
}

// Reads of what the tab shows; the app's own background refreshes are not the tab's doing.
const tabReads = (requests: { method: string; path: string }[]) =>
	requests.filter((r) => r.method === 'GET' && /\/(permissions|roles|members)\b/.test(r.path));

async function delayWrites(page: Page, ms: number) {
	await page.route('**/permissions/**', async (route) => {
		if (route.request().method() === 'PUT') await new Promise((resolve) => setTimeout(resolve, ms));
		await route.continue();
	});
}

async function setupChannel(browser: Parameters<typeof newUser>[0]) {
	const owner = await newUser(browser, 'owner');
	const server = await createServer(owner.context, uniqueName('Guild'));
	const staff = await createCategory(owner.context, server.id, 'Staff');
	const channel = await createChannel(owner.context, server.id, 'plans', staff.id);
	const mods = await createRole(owner.context, server.id, 'Mods');
	return { owner, server, channel, mods };
}

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

test('one click sends one request and nothing else', async ({ browser }) => {
	const { owner, server, channel, mods } = await setupChannel(browser);
	await owner.page.goto(channelPath(server.id, channel.id));
	await openPermissions(owner.page);
	const row = await addRow(owner.page, 'Mods');

	const requests = recordRequests(owner.page);
	const saved = owner.page.waitForResponse(
		(r) =>
			r.request().method() === 'PUT' &&
			r.url().endsWith(`/channels/${channel.id}/permissions/roles/${mods.id}`)
	);
	await option(row, 'Send messages', 'Allow').click();
	await saved;
	await owner.page.waitForTimeout(1500);

	await expect(option(row, 'Send messages', 'Allow')).toHaveAttribute('aria-checked', 'true');
	expect(requests.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.path}`)).toEqual([
		`PUT /channels/${channel.id}/permissions/roles/${mods.id}`
	]);
	expect(tabReads(requests)).toEqual([]);
});

test('the toggle changes before a slow server answers', async ({ browser }) => {
	const { owner, server, channel } = await setupChannel(browser);
	await createRole(owner.context, server.id, 'Helpers');
	await owner.page.goto(channelPath(server.id, channel.id));
	await openPermissions(owner.page);
	const modsRow = await addRow(owner.page, 'Mods');
	const helpersRow = await addRow(owner.page, 'Helpers');
	await delayWrites(owner.page, 2000);

	await option(modsRow, 'Send messages', 'Deny').click();
	await expect(option(modsRow, 'Send messages', 'Deny')).toHaveAttribute('aria-checked', 'true', {
		timeout: 300
	});
	await expect(toggle(modsRow, 'Send messages')).toHaveAttribute('aria-busy', 'true');
	await expect(toggle(modsRow, 'View channel')).toHaveAttribute('aria-busy', 'false');
	await expect(toggle(helpersRow, 'View channel')).toHaveAttribute('aria-busy', 'false');

	await option(helpersRow, 'View channel', 'Allow').click();
	await expect(option(helpersRow, 'View channel', 'Allow')).toHaveAttribute(
		'aria-checked',
		'true',
		{ timeout: 300 }
	);
	await expect(toggle(helpersRow, 'View channel')).toHaveAttribute('aria-busy', 'true');

	await expect(toggle(modsRow, 'Send messages')).toHaveAttribute('aria-busy', 'false', {
		timeout: 10_000
	});
	await expect(toggle(helpersRow, 'View channel')).toHaveAttribute('aria-busy', 'false', {
		timeout: 10_000
	});

	await owner.page.reload();
	await openPermissions(owner.page);
	const modsAfter = await openRow(owner.page, 'Mods');
	const helpersAfter = await openRow(owner.page, 'Helpers');
	await expect(option(modsAfter, 'Send messages', 'Deny')).toHaveAttribute('aria-checked', 'true');
	await expect(option(helpersAfter, 'View channel', 'Allow')).toHaveAttribute(
		'aria-checked',
		'true'
	);
});

test('quick clicks on one row: the last one wins', async ({ browser }) => {
	const { owner, server, channel } = await setupChannel(browser);
	await owner.page.goto(channelPath(server.id, channel.id));
	await openPermissions(owner.page);
	const row = await addRow(owner.page, 'Mods');
	await option(row, 'View channel', 'Allow').click();
	await expect(toggle(row, 'View channel')).toHaveAttribute('aria-busy', 'false');
	await delayWrites(owner.page, 1000);
	const requests = recordRequests(owner.page);

	await option(row, 'Send messages', 'Allow').click();
	await option(row, 'Send messages', 'Deny').click();
	await option(row, 'Send messages', 'Inherit').click();
	await expect(option(row, 'Send messages', 'Inherit')).toHaveAttribute('aria-checked', 'true', {
		timeout: 300
	});

	await expect(toggle(row, 'Send messages')).toHaveAttribute('aria-busy', 'false', {
		timeout: 10_000
	});
	const writes = requests.filter((r) => r.method === 'PUT');
	expect(writes.length).toBeLessThanOrEqual(2);
	expect(JSON.parse(writes.at(-1)!.body!)).toEqual({ allow: VIEW, deny: '0' });
	expect(tabReads(requests)).toEqual([]);

	await owner.page.reload();
	await openPermissions(owner.page);
	const after = await openRow(owner.page, 'Mods');
	await expect(option(after, 'Send messages', 'Inherit')).toHaveAttribute('aria-checked', 'true');
	await expect(option(after, 'View channel', 'Allow')).toHaveAttribute('aria-checked', 'true');
});

test('a failed save flips back with one toast', async ({ browser }) => {
	const { owner, server, channel } = await setupChannel(browser);
	await owner.page.goto(channelPath(server.id, channel.id));
	await openPermissions(owner.page);
	const row = await addRow(owner.page, 'Mods');
	await owner.page.route('**/permissions/**', (route) =>
		route.request().method() === 'PUT' ? route.abort() : route.continue()
	);

	await option(row, 'Send messages', 'Allow').click();
	await option(row, 'Connect', 'Allow').click();

	const toasts = owner.page.getByText("Couldn't save permissions");
	await expect(toasts.first()).toBeVisible();
	await expect(option(row, 'Send messages', 'Inherit')).toHaveAttribute('aria-checked', 'true');
	await expect(option(row, 'Connect', 'Inherit')).toHaveAttribute('aria-checked', 'true');
	await owner.page.waitForTimeout(500);
	await expect(toasts).toHaveCount(1);
});

test("another manager's change shows up live", async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const manager = await newUser(browser, 'manager');
	const server = await createServer(owner.context, uniqueName('Guild'));
	const channel = await createChannel(owner.context, server.id, 'plans');
	await joinInvite(manager.context, (await createInvite(owner.context, server.id)).id);
	const managers = await createRole(owner.context, server.id, 'Managers', {
		allow: MANAGER_PERMISSIONS
	});
	await setMemberRoles(owner.context, server.id, manager.user.id, [managers.id]);
	const everyone = await everyoneRoleId(owner.context, server.id);

	await owner.page.goto(channelPath(server.id, channel.id));
	await openPermissions(owner.page);
	const row = await addRow(owner.page, '@everyone');
	await expect(option(row, 'Send messages', 'Inherit')).toHaveAttribute('aria-checked', 'true');
	const requests = recordRequests(owner.page);

	await putOverwrite(manager.context, 'channels', channel.id, 'roles', everyone, '0', SEND);

	await expect(option(row, 'Send messages', 'Deny')).toHaveAttribute('aria-checked', 'true');
	await expect(option(row, 'View channel', 'Inherit')).toHaveAttribute('aria-checked', 'true');
	expect(tabReads(requests)).toEqual([]);
});
