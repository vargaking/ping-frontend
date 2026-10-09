import { expect, test } from '@playwright/test';
import { channelPath, createChannel, createServer, newUser, uniqueName } from './helpers';

test('a fenced block typed with the keyboard is sent as a code block', async ({ browser }) => {
	const { context, page } = await newUser(browser, 'coder');
	const server = await createServer(context, uniqueName('Guild'));
	const channel = await createChannel(context, server.id, 'general');
	await page.goto(channelPath(server.id, channel.id));

	const composer = page.getByRole('group', { name: 'Message composer' }).getByRole('textbox');
	await composer.click();
	await page.keyboard.type('```js');
	await page.keyboard.press('Enter');
	await expect(composer.locator('pre'), 'the fence line should turn into a block').toBeVisible();
	await page.keyboard.type('const answer = 42;');
	await page.keyboard.press('Enter');
	await page.keyboard.type('```');
	await page.keyboard.press('Enter');
	await expect(
		page.locator('[data-message-id]'),
		'nothing is sent until Enter after the block'
	).toHaveCount(0);
	await page.keyboard.press('Enter');

	const row = page.locator('[data-message-id]');
	await expect(row.locator('pre')).toHaveText('const answer = 42;');
	await expect(row.getByText('js', { exact: true })).toBeVisible();
	await expect(row.getByRole('button', { name: 'Copy code' })).toBeVisible();
	await expect(row.locator('.prose p'), 'no empty paragraph under the block').toHaveCount(0);

	const response = await context.request.get(`/channels/${channel.id}/messages`);
	const [message] = (await response.json()).messages as { content: string }[];
	const blocks = JSON.parse(message.content).content as { type: string }[];
	expect(blocks.map((block) => block.type)).toEqual(['codeBlock']);
});
