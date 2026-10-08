import { expect, test } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createInvite,
	createServer,
	joinInvite,
	newUser,
	sendMessageViaUi,
	uniqueName
} from './helpers';

test('messages sent while offline show up after reconnecting, without a reload', async ({
	browser
}) => {
	test.setTimeout(90_000);
	const a = await newUser(browser, 'alice');
	const b = await newUser(browser, 'bob');

	const server = await createServer(a.context, uniqueName('Guild'));
	const general = await createChannel(a.context, server.id, 'general');
	const other = await createChannel(a.context, server.id, 'other');
	await joinInvite(b.context, (await createInvite(a.context, server.id)).id);

	await a.page.goto(channelPath(server.id, general.id));
	await b.page.goto(channelPath(server.id, general.id));
	await sendMessageViaUi(b.page, 'before the gap');
	await expect(a.page.getByText('before the gap', { exact: true })).toBeVisible();

	// Offline emulation holds socket frames rather than dropping them, so wait until the
	// missed heartbeats have made the app give the socket up.
	await a.context.setOffline(true);
	await expect(a.page.getByLabel('Connection status: Reconnecting')).toBeVisible({
		timeout: 40_000
	});
	await sendMessageViaUi(b.page, 'during the gap');
	await b.page.getByText('before the gap', { exact: true }).hover();
	await b.page.getByRole('button', { name: 'Delete message' }).click();
	await b.page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(b.page.getByText('before the gap', { exact: true })).toHaveCount(0);
	await b.page.goto(channelPath(server.id, other.id));
	await sendMessageViaUi(b.page, 'elsewhere during the gap');
	await expect(
		a.page.getByText('during the gap', { exact: true }),
		'A is offline, so the frame should not arrive live'
	).toHaveCount(0);

	await a.context.setOffline(false);
	await expect(
		a.page.getByText('during the gap', { exact: true }),
		'A should get the missed message without a reload'
	).toBeVisible({ timeout: 20_000 });
	await expect(
		a.page.getByText('before the gap', { exact: true }),
		'a message deleted during the gap should be gone'
	).toHaveCount(0);
	await expect(
		a.page.getByRole('link', { name: /^other\s*,\s*unread$/ }),
		'the other channel should show unread'
	).toBeVisible();
});
