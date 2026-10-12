import { expect, test, type Page, type Route } from '@playwright/test';
import {
	createInvite,
	createRole,
	createServer,
	joinInvite,
	newUser,
	setMemberRoles,
	uniqueName
} from './helpers';
import { storedZip } from './zip';

const CHANNEL = 'imported-general';
const PRIVATE_CHANNEL = 'staff-room';
const OTHER_PRIVATE_CHANNEL = 'mod-log';

// Message ids are tied to the source server, so each run needs its own to avoid being skipped as already imported.
function exportZip(sourceId: string, withPrivate = false): Buffer {
	const messages = [
		{
			id: `${sourceId}-1`,
			author_id: '1001',
			timestamp: '2024-05-01T10:00:00+00:00',
			content: 'first message'
		},
		{
			id: `${sourceId}-2`,
			author_id: '1002',
			timestamp: '2024-05-01T10:01:00+00:00',
			content: 'second message'
		}
	];
	return storedZip({
		'server.json': JSON.stringify({
			format: 1,
			source: { platform: 'discord', server_id: sourceId, server_name: 'Deducks' },
			channels: [
				{ id: '501', name: CHANNEL, type: 'text' },
				...(withPrivate
					? [
							{ id: '502', name: PRIVATE_CHANNEL, type: 'text', private: true },
							{ id: '503', name: OTHER_PRIVATE_CHANNEL, type: 'text', private: true }
						]
					: [])
			],
			authors: [
				{ id: '1001', name: 'Maple', messages: 1 },
				{ id: '1002', name: 'Rowan', messages: 1 }
			]
		}),
		'channels/501/messages/0.json': JSON.stringify(messages),
		...(withPrivate && {
			'channels/502/messages/0.json': JSON.stringify([
				{
					id: `${sourceId}-3`,
					author_id: '1001',
					timestamp: '2024-05-01T10:02:00+00:00',
					content: 'staff only'
				}
			]),
			'channels/503/messages/0.json': JSON.stringify([
				{
					id: `${sourceId}-4`,
					author_id: '1002',
					timestamp: '2024-05-01T10:03:00+00:00',
					content: 'moderation note'
				}
			])
		})
	});
}

async function openServerSettings(page: Page, serverName: string) {
	await page
		.getByRole('complementary', { name: 'Channels' })
		.getByRole('button', { name: serverName })
		.click();
	await page.getByRole('menuitem', { name: 'Server settings' }).click();
	return page.getByRole('navigation', { name: 'Settings' });
}

test('the owner imports an export, matches an author and everyone sees the channel', async ({
	browser
}) => {
	const owner = await newUser(browser, 'owner');
	const member = await newUser(browser, 'member');
	const serverName = uniqueName('Guild');
	const server = await createServer(owner.context, serverName);
	await joinInvite(member.context, (await createInvite(owner.context, server.id)).id);

	let importReads = 0;
	owner.page.on('request', (request) => {
		const { pathname } = new URL(request.url());
		if (request.method() === 'GET' && pathname === `/servers/${server.id}/import`) importReads++;
	});

	await owner.page.goto(`/app/server/${server.id}/`);
	await member.page.goto(`/app/server/${server.id}/`);

	const settingsTabs = await openServerSettings(owner.page, serverName);
	await settingsTabs.getByRole('button', { name: 'Import' }).click();
	await expect(owner.page.getByRole('button', { name: 'Choose zip' })).toBeVisible();

	const readsOnOpen = importReads;
	await owner.page.waitForTimeout(2000);
	const idleReads = importReads - readsOnOpen;
	expect(idleReads, 'an idle Import tab should not keep refetching the import').toBeLessThanOrEqual(
		2
	);
	expect(readsOnOpen, 'opening the tab should fetch the import once or twice').toBeLessThanOrEqual(
		2
	);

	await owner.page.locator('input[type="file"][accept*=".zip"]').setInputFiles({
		name: 'export.zip',
		mimeType: 'application/zip',
		buffer: exportZip(uniqueName('src'))
	});

	const start = owner.page.getByRole('button', { name: 'Start import' });
	await expect(start, 'the plan should show once the export is unpacked').toBeVisible({
		timeout: 60_000
	});
	await expect(owner.page.getByText('Deducks, from Discord')).toBeVisible();
	await expect(owner.page.getByText('2 messages, 0 forum posts, 0 attachments')).toBeVisible();
	await expect(owner.page.getByText('New channel')).toBeVisible();
	await expect(owner.page.getByText('0 of 2 matched')).toBeVisible();

	await owner.page.getByRole('button', { name: 'Member for Maple' }).click();
	await owner.page.getByRole('combobox', { name: 'Search members' }).fill(owner.user.username);
	await owner.page.getByRole('option', { name: owner.user.username, exact: true }).click();
	await start.click();

	await expect(
		owner.page.getByText('Imported 2 messages, 0 forum posts and 0 attachments from Deducks.'),
		'the import should finish'
	).toBeVisible({ timeout: 60_000 });
	await expect(owner.page.getByText('1 of 2 matched')).toBeVisible();

	await owner.page.getByRole('button', { name: 'Close settings' }).click();
	const ownerChannel = owner.page
		.getByRole('complementary', { name: 'Channels' })
		.getByRole('link', { name: CHANNEL });
	await expect(ownerChannel, 'the new channel should appear without reloading').toBeVisible();
	await ownerChannel.click();

	// The innermost message group (avatar, author line, rows) around a message.
	const groupOf = (page: Page, text: string) =>
		page
			.locator('div.flex.gap-3')
			.filter({ has: page.getByText(text, { exact: true }) })
			.last();
	await expect(owner.page.getByText('first message', { exact: true })).toBeVisible();
	await expect(owner.page.getByText('second message', { exact: true })).toBeVisible();

	const mapped = groupOf(owner.page, 'first message');
	await expect(mapped, 'the matched author should show as the owner').toContainText(
		owner.user.username
	);
	await expect(mapped).not.toContainText('Imported');

	const unmatched = groupOf(owner.page, 'second message');
	await expect(unmatched).toContainText('Rowan');
	await expect(unmatched, 'the unmatched author should be labelled').toContainText('Imported');

	await expect(
		member.page
			.getByRole('complementary', { name: 'Channels' })
			.getByRole('link', { name: CHANNEL }),
		'a member should get the channel without reloading'
	).toBeVisible();

	const memberTabs = await openServerSettings(member.page, serverName);
	await expect(memberTabs.getByRole('button', { name: 'Members' })).toBeVisible();
	await expect(
		memberTabs.getByRole('button', { name: 'Import' }),
		'only the owner should get the Import tab'
	).toHaveCount(0);

	expect(importReads, 'the whole flow should need only a few reads').toBeLessThan(40);
});

test('a member who may match authors maps one and the owner sees it in the recent changes', async ({
	browser
}) => {
	const owner = await newUser(browser, 'owner');
	const matcher = await newUser(browser, 'matcher');
	const serverName = uniqueName('Guild');
	const server = await createServer(owner.context, serverName);
	await joinInvite(matcher.context, (await createInvite(owner.context, server.id)).id);
	// Match imported authors is bit 15.
	const role = await createRole(owner.context, server.id, 'Matchers', {
		allow: String(1 << 15)
	});
	await setMemberRoles(owner.context, server.id, matcher.user.id, [role.id]);

	await owner.page.goto(`/app/server/${server.id}/`);
	const ownerTabs = await openServerSettings(owner.page, serverName);
	await ownerTabs.getByRole('button', { name: 'Import' }).click();
	await owner.page.locator('input[type="file"][accept*=".zip"]').setInputFiles({
		name: 'export.zip',
		mimeType: 'application/zip',
		buffer: exportZip(uniqueName('src'))
	});
	await owner.page.getByRole('button', { name: 'Start import' }).click({ timeout: 60_000 });
	await expect(
		owner.page.getByText('Imported 2 messages, 0 forum posts and 0 attachments from Deducks.'),
		'the import should finish'
	).toBeVisible({ timeout: 60_000 });

	await matcher.page.goto(`/app/server/${server.id}/`);
	const matcherTabs = await openServerSettings(matcher.page, serverName);
	await expect(
		matcherTabs.getByRole('button', { name: 'Import', exact: true }),
		'the Import tab is for the owner'
	).toHaveCount(0);
	await matcherTabs.getByRole('button', { name: 'Imported authors' }).click();
	await expect(matcher.page.getByText('0 of 2 matched')).toBeVisible();

	await matcher.page.getByRole('button', { name: 'Member for Maple' }).click();
	await matcher.page.getByRole('combobox', { name: 'Search members' }).fill(matcher.user.username);
	await matcher.page.getByRole('option', { name: matcher.user.username, exact: true }).click();
	await matcher.page.getByRole('button', { name: 'Apply' }).click();

	const entry = (page: Page) =>
		page
			.getByRole('list', { name: 'Recent changes' })
			.getByRole('listitem')
			.filter({ hasText: `Maple · Not mapped → ${matcher.user.username}` });
	await expect(entry(matcher.page), 'the change should be logged').toContainText(
		matcher.user.username
	);
	await expect(matcher.page.getByText('1 of 2 matched')).toBeVisible();

	await owner.page.getByRole('button', { name: 'Close settings' }).click();
	const reopened = await openServerSettings(owner.page, serverName);
	await reopened.getByRole('button', { name: 'Import' }).click();
	await expect(entry(owner.page), 'the owner should see the same change').toBeVisible();
});

test('the owner picks which private channels come along and who sees them', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const member = await newUser(browser, 'member');
	const serverName = uniqueName('Guild');
	const server = await createServer(owner.context, serverName);
	await joinInvite(member.context, (await createInvite(owner.context, server.id)).id);

	await owner.page.goto(`/app/server/${server.id}/`);
	await member.page.goto(`/app/server/${server.id}/`);

	const settingsTabs = await openServerSettings(owner.page, serverName);
	await settingsTabs.getByRole('button', { name: 'Import' }).click();
	await expect(owner.page.getByRole('button', { name: 'Choose zip' })).toBeVisible();
	await owner.page.locator('input[type="file"][accept*=".zip"]').setInputFiles({
		name: 'export.zip',
		mimeType: 'application/zip',
		buffer: exportZip(uniqueName('src'), true)
	});
	await expect(owner.page.getByRole('button', { name: 'Start import' })).toBeVisible({
		timeout: 60_000
	});

	const pick = owner.page.getByRole('checkbox', { name: `Import ${PRIVATE_CHANNEL}` });
	const otherPick = owner.page.getByRole('checkbox', { name: `Import ${OTHER_PRIVATE_CHANNEL}` });
	const selectAll = owner.page.getByRole('checkbox', { name: 'Select all private channels' });
	const row = owner.page.getByRole('listitem').filter({ has: pick });
	const isIndeterminate = () => selectAll.evaluate((el: HTMLInputElement) => el.indeterminate);

	await expect(pick, 'private channels start unticked').not.toBeChecked();
	await expect(otherPick).not.toBeChecked();
	await expect(row.getByText('Private, not selected')).toBeVisible();
	await expect(owner.page.getByRole('radiogroup', { name: 'Visible to' })).toHaveCount(0);
	await expect(owner.page.getByText('2 messages, 0 forum posts, 0 attachments')).toBeVisible();

	await pick.check();
	const visibleTo = row.getByRole('radiogroup', { name: 'Visible to' });
	await expect(visibleTo.getByRole('radio', { name: 'Only me' })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await expect(row.getByText('New channel, only you can see it')).toBeVisible();
	await expect(owner.page.getByText('3 messages, 0 forum posts, 0 attachments')).toBeVisible();
	expect(await isIndeterminate(), 'one of two ticked is a partial selection').toBe(true);

	await selectAll.check();
	await expect(pick).toBeChecked();
	await expect(otherPick).toBeChecked();
	expect(await isIndeterminate()).toBe(false);

	await otherPick.uncheck();
	await expect(otherPick).not.toBeChecked();
	expect(await isIndeterminate()).toBe(true);

	await visibleTo.getByRole('radio', { name: 'Everyone' }).click();
	await expect(row.getByText('New channel, everyone can see it')).toBeVisible();
	await visibleTo.getByRole('radio', { name: 'Only me' }).click();
	await expect(row.getByText('New channel, only you can see it')).toBeVisible();

	await owner.page.getByRole('button', { name: 'Start import' }).click();
	await expect(
		owner.page.getByText('Imported 3 messages, 0 forum posts and 0 attachments from Deducks.'),
		'the import should finish'
	).toBeVisible({ timeout: 60_000 });

	await owner.page.getByRole('button', { name: 'Close settings' }).click();
	const channels = (page: Page) => page.getByRole('complementary', { name: 'Channels' });
	await expect(
		channels(owner.page).getByRole('link', { name: PRIVATE_CHANNEL }),
		'the owner should see the private channel'
	).toBeVisible();
	await expect(channels(owner.page).getByRole('link', { name: OTHER_PRIVATE_CHANNEL })).toHaveCount(
		0
	);

	await expect(channels(member.page).getByRole('link', { name: CHANNEL })).toBeVisible();
	await expect(
		channels(member.page).getByRole('link', { name: PRIVATE_CHANNEL }),
		'a member should not see an only-me channel'
	).toHaveCount(0);
});

test('a second tab sees an upload running elsewhere and can discard it', async ({ browser }) => {
	const owner = await newUser(browser, 'owner');
	const serverName = uniqueName('Guild');
	const server = await createServer(owner.context, serverName);

	// The first piece never reaches the server, so the upload stays in progress.
	let heldPiece: (route: Route) => void;
	const held = new Promise<Route>((resolve) => (heldPiece = resolve));
	await owner.page.route('**/import/*/data*', (route) => heldPiece(route));

	await owner.page.goto(`/app/server/${server.id}/`);
	const tabs = await openServerSettings(owner.page, serverName);
	await tabs.getByRole('button', { name: 'Import' }).click();
	await expect(owner.page.getByRole('button', { name: 'Choose zip' })).toBeVisible();
	await owner.page.locator('input[type="file"][accept*=".zip"]').setInputFiles({
		name: 'export.zip',
		mimeType: 'application/zip',
		buffer: exportZip(uniqueName('src'))
	});
	const piece = await held;

	const tabB = await owner.context.newPage();
	await tabB.goto(`/app/server/${server.id}/`);
	const tabsB = await openServerSettings(tabB, serverName);
	await tabsB.getByRole('button', { name: 'Import' }).click();

	await expect(
		tabB.getByText('This file is being uploaded from another tab or device.')
	).toBeVisible();
	await expect(
		tabB.getByRole('button', { name: 'Choose file' }),
		'a second writer must not be offered'
	).toHaveCount(0);

	await tabB.getByRole('button', { name: 'Discard' }).click();
	await expect(tabB.getByText('Discard this upload?')).toBeVisible();
	await tabB.getByRole('button', { name: 'Discard' }).click();
	await expect(tabB.getByRole('button', { name: 'Choose zip' })).toBeVisible();

	await piece.continue();
	await expect(
		owner.page.getByText('The upload was discarded from another tab or device.'),
		'the uploading tab should stop and say why'
	).toBeVisible();
});
