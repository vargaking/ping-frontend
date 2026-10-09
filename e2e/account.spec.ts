import { expect, test } from '@playwright/test';
import { newUser, uniqueName } from './helpers';

test('renaming sends only the username, and a bad name stays on the field', async ({ browser }) => {
	const { page } = await newUser(browser, 'renamer');
	await page.goto('/app/');
	await page.getByRole('button', { name: 'Account settings' }).click();

	const field = page.getByRole('textbox', { name: 'Username' });
	const save = page.getByRole('button', { name: 'Save' });

	const requests: string[] = [];
	page.on('request', (request) => {
		if (request.method() === 'PUT' && /\/users\/\d+$/.test(request.url())) {
			requests.push(request.postData() ?? '');
		}
	});

	await field.fill('a b');
	await save.click();
	await expect(page.getByText('Use only letters, numbers, and . _ -')).toBeVisible();
	expect(requests, 'an invalid name is refused before sending').toEqual([]);

	const name = uniqueName('renamed').toLowerCase();
	await field.fill(name);
	await save.click();
	await expect(page.getByText('Profile updated')).toBeVisible();
	expect(requests.map((body) => JSON.parse(body))).toEqual([{ username: name }]);
});
