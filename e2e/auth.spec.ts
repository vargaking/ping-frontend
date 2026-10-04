import { expect, test } from '@playwright/test';
import { registerUser, sendMessageViaUi, uniqueName } from './helpers';

test('a new user can register, create a server and channel, and send a message', async ({
	page
}) => {
	const username = uniqueName('newbie');
	const serverName = uniqueName('Guild');

	await page.goto('/register');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery');
	await page.getByLabel('Confirm password').fill('correct-horse-battery');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/app\/direct/);

	await page.getByRole('button', { name: 'Create a server' }).click();
	await page.getByLabel('Server name').fill(serverName);
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(page).toHaveURL(/\/app\/server\/\d+\//);
	await expect(
		page.getByRole('navigation', { name: 'Servers' }).getByRole('link', { name: serverName })
	).toBeVisible();

	await page.getByRole('button', { name: serverName }).click();
	await page.getByRole('menuitem', { name: 'Create channel', exact: true }).click();
	await page.getByPlaceholder('Channel name').fill('general');
	await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
	await expect(page).toHaveURL(/\/channel\/\d+\//);
	await expect(page.getByRole('heading', { name: 'general' })).toBeVisible();

	await sendMessageViaUi(page, 'hello from the smoke test');
});

test('a wrong password shows an error and stays on the login page', async ({ browser, page }) => {
	const setup = await browser.newContext();
	const user = await registerUser(setup);
	await setup.close();

	await page.goto('/login');
	await page.getByLabel('Username').fill(user.username);
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page.getByRole('alert')).toHaveText('Incorrect username or password');
	await expect(page).toHaveURL(/\/login/);
});
