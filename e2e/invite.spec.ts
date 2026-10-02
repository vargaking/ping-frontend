import { expect, test } from '@playwright/test';
import {
	channelPath,
	createChannel,
	createInvite,
	createServer,
	newUser,
	uniqueName
} from './helpers';

test('an invited user joins a server and the owner sees them without reloading', async ({
	browser
}) => {
	const a = await newUser(browser, 'owner');
	const b = await newUser(browser, 'guest');
	const serverName = uniqueName('Guild');

	const server = await createServer(a.context, serverName);
	const channel = await createChannel(a.context, server.id, 'general');
	const invite = await createInvite(a.context, server.id);

	const members = a.page.getByRole('complementary', { name: 'Members' });
	await a.page.goto(channelPath(server.id, channel.id));
	await expect(members.getByText(a.user.username)).toBeVisible();

	await b.page.goto(`/invite/${invite.id}/`);
	await expect(b.page.getByRole('heading', { name: serverName })).toBeVisible();
	await b.page.getByRole('button', { name: 'Accept Invite' }).click();

	await expect(b.page).toHaveURL(new RegExp(`/app/server/${server.id}`));
	await expect(
		b.page.getByRole('navigation', { name: 'Servers' }).getByRole('link', { name: serverName }),
		'B should see the joined server in the rail'
	).toBeVisible();
	await expect(
		members.getByText(b.user.username),
		'A should see B in the member list without reloading'
	).toBeVisible();
});
