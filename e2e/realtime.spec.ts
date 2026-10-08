import { expect, test, type Locator, type Page } from '@playwright/test';
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

async function hoverMessage(page: Page, text: string): Promise<Locator> {
	const message = page.getByText(text, { exact: true });
	await message.hover();
	return message;
}

test('messages, edits, deletes and reactions reach the other user live', async ({ browser }) => {
	const a = await newUser(browser, 'alice');
	const b = await newUser(browser, 'bob');

	const server = await createServer(a.context, uniqueName('Guild'));
	const channel = await createChannel(a.context, server.id, 'general');
	await joinInvite(b.context, (await createInvite(a.context, server.id)).id);

	await a.page.goto(channelPath(server.id, channel.id));
	await b.page.goto(channelPath(server.id, channel.id));

	await sendMessageViaUi(a.page, 'first draft');
	await expect(
		b.page.getByText('first draft', { exact: true }),
		'B should see A’s message'
	).toBeVisible();

	await hoverMessage(a.page, 'first draft');
	await a.page.getByRole('button', { name: 'Edit message' }).click();
	await expect(a.page.getByRole('textbox').filter({ hasText: 'first draft' })).toBeVisible();
	await a.page.keyboard.press('ControlOrMeta+a');
	await a.page.keyboard.type('second draft');
	await a.page.keyboard.press('Enter');
	await expect(
		b.page.getByText('second draft', { exact: true }),
		'B should see A’s edit'
	).toBeVisible();
	await expect(b.page.getByText('first draft'), 'B should no longer see the old text').toHaveCount(
		0
	);

	await hoverMessage(b.page, 'second draft');
	await b.page.getByRole('button', { name: 'Add reaction' }).click();
	await b.page.getByRole('button', { name: 'thumbs up' }).click();
	await expect(
		a.page.getByRole('button', { name: /👍/ }),
		'A should see B’s reaction'
	).toContainText('1');

	await hoverMessage(a.page, 'second draft');
	await a.page.getByRole('button', { name: 'Delete message' }).click();
	await a.page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(
		b.page.getByText('second draft'),
		'B should no longer see A’s deleted message'
	).toHaveCount(0);
});

test('right-clicking a message opens its menu at the cursor', async ({ browser }) => {
	const a = await newUser(browser, 'alice');
	const server = await createServer(a.context, uniqueName('Guild'));
	const channel = await createChannel(a.context, server.id, 'general');
	await a.page.goto(channelPath(server.id, channel.id));
	await sendMessageViaUi(a.page, 'right click me');

	const message = a.page.getByText('right click me', { exact: true });
	const box = (await message.boundingBox())!;
	await a.page.mouse.click(box.x + 5, box.y + 5, { button: 'right' });

	const menu = a.page.getByRole('menu');
	await expect(menu).toBeVisible();
	const menuBox = (await menu.boundingBox())!;
	expect(Math.abs(menuBox.x - (box.x + 5))).toBeLessThan(20);
	await expect(a.page.locator('[data-held]')).toHaveCount(0);
});
