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
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return page.locator('details', {
		has: page.locator('summary', { hasText: new RegExp(`^\\s*${escaped}\\s*·`) })
	});
}

async function openRow(page: Page, name: string) {
	const row = permissionRow(page, name);
	await row.locator('summary').click();
	await expect(row).toHaveJSProperty('open', true);
	return row;
}

// A row added from the list opens at once.
async function addRow(page: Page, name: string) {
	await page.getByLabel('Add a role').selectOption({ label: name });
	const row = permissionRow(page, name);
	await expect(row).toHaveJSProperty('open', true);
	return row;
}

const toggle = (row: ReturnType<typeof permissionRow>, label: string) =>
	row.getByRole('radiogroup', { name: label });

// The text next to a toggle: its description and the line saying what it inherits.
const toggleLabel = (row: ReturnType<typeof permissionRow>, label: string) =>
	toggle(row, label).locator('..');

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

function savedWrite(page: Page) {
	return page.waitForResponse(
		(r) => r.request().method() === 'PUT' && r.url().includes('/permissions/')
	);
}

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
	await openPermissions(owner.page);
	const admin = await addRow(owner.page, 'Admin');
	const allowed = savedWrite(owner.page);
	await option(admin, 'View channel', 'Allow').click();
	await allowed;

	const privateSwitch = owner.page.getByRole('switch', { name: 'Private' });
	await expect(privateSwitch).not.toBeChecked();
	await privateSwitch.click();
	await expect(privateSwitch).toBeChecked();
	await expect(owner.page.getByText('Visible to Admin and the owner.')).toBeVisible();
	await expect(
		option(permissionRow(owner.page, '@everyone'), 'View channel', 'Deny'),
		'the @everyone row should show the same setting as the switch'
	).toHaveAttribute('aria-checked', 'true');

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

	await openPermissions(owner.page);
	await privateSwitch.click();
	await expect(privateSwitch).not.toBeChecked();
	await expect(owner.page.getByText('Everyone in the server can see this channel.')).toBeVisible();
	await expect(permissionRow(owner.page, 'Admin')).toBeVisible();
	await expect(
		member.page.getByRole('link', { name: 'secret' }),
		'the channel should come back for the member'
	).toBeVisible();
});

test('private with nobody allowed says only the owner can see it', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const server = await createServer(owner.context, uniqueName('Guild'));
	const channel = await createChannel(owner.context, server.id, 'fresh');
	await owner.page.goto(channelPath(server.id, channel.id));
	await openPermissions(owner.page);

	await owner.page.getByRole('switch', { name: 'Private' }).click();

	await expect(owner.page.getByRole('switch', { name: 'Private' })).toBeChecked();
	await expect(
		owner.page.getByText(
			'Only the owner can see this. Allow View for a role or member below to let others in.'
		)
	).toBeVisible();
});

test('the switch and the @everyone row are the same setting', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const server = await createServer(owner.context, uniqueName('Guild'));
	const channel = await createChannel(owner.context, server.id, 'fresh');
	await owner.page.goto(channelPath(server.id, channel.id));
	await openPermissions(owner.page);
	const row = permissionRow(owner.page, '@everyone');
	const privateSwitch = owner.page.getByRole('switch', { name: 'Private' });
	const requests = recordRequests(owner.page);
	const writes = () => requests.filter((r) => r.method === 'PUT');

	let saved = savedWrite(owner.page);
	await option(row, 'View channel', 'Deny').click();
	await expect(privateSwitch).toBeChecked();
	await saved;
	expect(writes().map((r) => r.body)).toEqual([JSON.stringify({ allow: '0', deny: VIEW })]);

	saved = savedWrite(owner.page);
	await option(row, 'View channel', 'Inherit').click();
	await expect(privateSwitch).not.toBeChecked();
	await saved;
	expect(writes()).toHaveLength(2);
	expect(writes()[1].body).toBe(JSON.stringify({ allow: '0', deny: '0' }));
});

test('a manager who would lose access is told before anything is sent', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const manager = await newUser(browser, 'manager');
	const server = await createServer(owner.context, uniqueName('Guild'));
	const channel = await createChannel(owner.context, server.id, 'plans');
	await joinInvite(manager.context, (await createInvite(owner.context, server.id)).id);
	const managers = await createRole(owner.context, server.id, 'Managers', {
		allow: MANAGER_PERMISSIONS
	});
	await setMemberRoles(owner.context, server.id, manager.user.id, [managers.id]);

	await manager.page.goto(channelPath(server.id, channel.id));
	await openPermissions(manager.page);
	const requests = recordRequests(manager.page);

	const privateSwitch = manager.page.getByRole('switch', { name: 'Private' });
	await expect(privateSwitch).toBeDisabled();
	await expect(
		manager.page.getByText(/^Turning this on would take this channel away from you\./)
	).toBeVisible();
	const row = permissionRow(manager.page, '@everyone');
	await expect(row.getByText('Deny would take this channel away from you.')).toBeVisible();
	await expect(option(row, 'View channel', 'Deny')).toBeDisabled();
	await expect(option(row, 'View channel', 'Allow')).toBeEnabled();
	await expect(option(row, 'Send messages', 'Deny')).toBeEnabled();
	await manager.page.waitForTimeout(500);

	expect(requests.filter((r) => r.method !== 'GET')).toEqual([]);
});

test('category settings: private on and off through one write each', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const member = await newUser(browser, 'member');
	const server = await createServer(owner.context, uniqueName('Guild'));
	const staff = await createCategory(owner.context, server.id, 'Staff');
	const channel = await createChannel(owner.context, server.id, 'plans', staff.id);
	const everyone = await everyoneRoleId(owner.context, server.id);
	await joinInvite(member.context, (await createInvite(owner.context, server.id)).id);

	await member.page.goto(channelPath(server.id, channel.id));
	const memberLink = member.page
		.getByRole('complementary', { name: 'Channels' })
		.getByRole('link', { name: 'plans' });
	await expect(memberLink).toBeVisible({ timeout: 15_000 });

	await owner.page.goto(channelPath(server.id, channel.id));
	await owner.page.getByRole('button', { name: 'Staff', exact: true }).click({ button: 'right' });
	await owner.page.getByRole('menuitem', { name: 'Category settings' }).click();
	await owner.page.getByRole('button', { name: 'Permissions' }).click();
	await expect(owner.page.getByLabel('Add a role')).toBeVisible();
	const privateSwitch = owner.page.getByRole('switch', { name: 'Private' });
	const requests = recordRequests(owner.page);
	const writes = () => requests.filter((r) => r.method === 'PUT');
	const path = `/channel-groups/${staff.id}/permissions/roles/${everyone}`;

	await privateSwitch.click();
	await expect(privateSwitch).toBeChecked();
	await expect(
		owner.page.getByText(
			'Only the owner can see this. Allow View for a role or member below to let others in.'
		)
	).toBeVisible();
	await expect(memberLink, 'the channel inside should leave the sidebar').toHaveCount(0);
	expect(writes().map((r) => `${r.method} ${r.path}`)).toEqual([`PUT ${path}`]);

	await privateSwitch.click();
	await expect(privateSwitch).not.toBeChecked();
	await expect(owner.page.getByText('Everyone in the server can see this category.')).toBeVisible();
	await expect(memberLink, 'the channel should come back').toBeVisible();
	expect(writes().map((r) => `${r.method} ${r.path}`)).toEqual([`PUT ${path}`, `PUT ${path}`]);
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
	const everyone = await everyoneRoleId(owner.context, server.id);
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

	const privateSaved = savedWrite(owner.page);
	await owner.page.getByRole('switch', { name: 'Private' }).click();
	await privateSaved;
	await owner.page.waitForTimeout(1500);

	await expect(owner.page.getByRole('switch', { name: 'Private' })).toBeChecked();
	expect(requests.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.path}`)).toEqual([
		`PUT /channels/${channel.id}/permissions/roles/${mods.id}`,
		`PUT /channels/${channel.id}/permissions/roles/${everyone}`
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
	const row = permissionRow(owner.page, '@everyone');
	await expect(row).toHaveJSProperty('open', true);
	await expect(option(row, 'Send messages', 'Inherit')).toHaveAttribute('aria-checked', 'true');
	const requests = recordRequests(owner.page);

	await putOverwrite(manager.context, 'channels', channel.id, 'roles', everyone, '0', SEND);

	await expect(option(row, 'Send messages', 'Deny')).toHaveAttribute('aria-checked', 'true');
	await expect(option(row, 'View channel', 'Inherit')).toHaveAttribute('aria-checked', 'true');
	expect(tabReads(requests)).toEqual([]);
});

test('rows stay open or closed as the user left them', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const manager = await newUser(browser, 'manager');
	const server = await createServer(owner.context, uniqueName('Guild'));
	const channel = await createChannel(owner.context, server.id, 'plans');
	await joinInvite(manager.context, (await createInvite(owner.context, server.id)).id);
	const managers = await createRole(owner.context, server.id, 'Managers', {
		allow: MANAGER_PERMISSIONS
	});
	await setMemberRoles(owner.context, server.id, manager.user.id, [managers.id]);
	const mods = await createRole(owner.context, server.id, 'Mods');
	const helpers = await createRole(owner.context, server.id, 'Helpers');
	await putOverwrite(owner.context, 'channels', channel.id, 'roles', mods.id, '0', SEND);
	await putOverwrite(owner.context, 'channels', channel.id, 'roles', helpers.id, '0', SEND);

	await owner.page.goto(channelPath(server.id, channel.id));
	await openPermissions(owner.page);
	const modsRow = permissionRow(owner.page, 'Mods');
	const helpersRow = permissionRow(owner.page, 'Helpers');
	await expect(modsRow).toHaveJSProperty('open', false);
	await expect(helpersRow).toHaveJSProperty('open', false);

	await openRow(owner.page, 'Mods');
	const saved = savedWrite(owner.page);
	await option(modsRow, 'Send messages', 'Allow').click();
	await saved;
	await owner.page.waitForTimeout(300);
	await expect(modsRow, 'a row opened by hand should stay open after a change').toHaveJSProperty(
		'open',
		true
	);
	await expect(option(modsRow, 'Send messages', 'Allow')).toHaveAttribute('aria-checked', 'true');

	const admin = await addRow(owner.page, 'Admin');
	await expect(modsRow, 'adding a row should not close another').toHaveJSProperty('open', true);
	await expect(helpersRow).toHaveJSProperty('open', false);

	await admin.locator('summary').click();
	await expect(admin).toHaveJSProperty('open', false);

	await putOverwrite(manager.context, 'channels', channel.id, 'roles', mods.id, VIEW, SEND);
	await expect(option(modsRow, 'View channel', 'Allow')).toHaveAttribute('aria-checked', 'true');
	await putOverwrite(manager.context, 'channels', channel.id, 'roles', helpers.id, '0', VIEW);
	await expect(helpersRow.locator('summary')).toContainText('View: Deny');
	await expect(modsRow, 'a live change should not close an open row').toHaveJSProperty(
		'open',
		true
	);
	await expect(helpersRow, 'a live change should not open a closed row').toHaveJSProperty(
		'open',
		false
	);
	await expect(admin, 'a row closed by hand should stay closed').toHaveJSProperty('open', false);
});

test('rows open and close from the keyboard', async ({ browser }) => {
	const { owner, server, channel } = await setupChannel(browser);
	await owner.page.goto(channelPath(server.id, channel.id));
	await openPermissions(owner.page);
	const row = await addRow(owner.page, 'Mods');
	const summary = row.locator('summary');

	await summary.focus();
	await owner.page.keyboard.press('Enter');
	await expect(row).toHaveJSProperty('open', false);
	await owner.page.keyboard.press('Space');
	await expect(row).toHaveJSProperty('open', true);
});

test('each toggle names where its value comes from', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const plain = await newUser(browser, 'plain');
	const server = await createServer(owner.context, uniqueName('Guild'));
	await joinInvite(plain.context, (await createInvite(owner.context, server.id)).id);
	const staff = await createCategory(owner.context, server.id, 'Staff');
	const channel = await createChannel(owner.context, server.id, 'plans', staff.id);
	const member = await createRole(owner.context, server.id, 'Member');
	await createRole(owner.context, server.id, 'Core member', { parent_id: member.id });
	await putOverwrite(owner.context, 'channels', channel.id, 'roles', member.id, '0', SEND);

	await owner.page.goto(channelPath(server.id, channel.id));
	await openPermissions(owner.page);
	const coreRow = await addRow(owner.page, 'Core member');
	await expect(coreRow.locator('summary')).toContainText('Core member · inherits from Member');
	await expect(toggleLabel(coreRow, 'Send messages')).toContainText(
		'Denied, from Member on this channel'
	);

	await option(coreRow, 'Send messages', 'Allow').click();
	await expect(toggleLabel(coreRow, 'Send messages')).toContainText(
		'Overrides: Denied, from Member on this channel'
	);
	await coreRow.locator('summary').click();
	await expect(coreRow).toHaveJSProperty('open', false);
	await expect(coreRow.locator('summary')).toContainText('Send: Allow');

	await putOverwrite(owner.context, 'channel-groups', staff.id, 'roles', member.id, '0', VIEW);
	await owner.page.reload();
	await openPermissions(owner.page);
	const coreAfter = await openRow(owner.page, 'Core member');
	await expect(toggleLabel(coreAfter, 'View channel')).toContainText(
		'Denied, from Member in the category Staff'
	);

	await owner.page.getByLabel('Add a member').selectOption({ label: plain.user.username });
	const memberRow = permissionRow(owner.page, plain.user.username);
	await expect(memberRow).toHaveJSProperty('open', true);
	await expect(toggleLabel(memberRow, 'View channel')).toContainText('Allowed, from @everyone');
	await expect(memberRow.locator('summary')).toContainText('Member');
});

test('nothing overflows on a phone', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const server = await createServer(owner.context, uniqueName('Guild'));
	const staff = await createCategory(
		owner.context,
		server.id,
		'A category with a rather long name'
	);
	const channel = await createChannel(owner.context, server.id, 'plans', staff.id);
	const parent = await createRole(owner.context, server.id, 'A parent role with a very long name');
	await createRole(owner.context, server.id, 'Another role whose name is just as long as that', {
		parent_id: parent.id
	});
	await putOverwrite(owner.context, 'channel-groups', staff.id, 'roles', parent.id, '0', VIEW);

	await owner.page.setViewportSize({ width: 375, height: 800 });
	await owner.page.goto(channelPath(server.id, channel.id));
	await owner.page.getByRole('button', { name: 'Channel settings' }).click();
	await owner.page.getByRole('button', { name: 'Back to settings' }).click();
	await owner.page.getByRole('button', { name: 'Permissions' }).click();
	await expect(owner.page.getByLabel('Add a role')).toBeVisible();
	await addRow(owner.page, 'Another role whose name is just as long as that');
	await expect(permissionRow(owner.page, '@everyone')).toHaveJSProperty('open', true);

	const tab = owner.page.getByTestId('channel-permissions');
	const overflow = await tab.evaluate((el) => ({
		tab: el.scrollWidth - el.clientWidth,
		page: document.documentElement.scrollWidth - document.documentElement.clientWidth
	}));
	expect(overflow.tab, 'the tab should not scroll sideways').toBeLessThanOrEqual(0);
	expect(overflow.page, 'the page should not scroll sideways').toBeLessThanOrEqual(0);
	const box = await permissionRow(
		owner.page,
		'Another role whose name is just as long as that'
	).boundingBox();
	expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});
