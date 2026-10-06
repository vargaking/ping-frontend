import { expect, test, type Page } from '@playwright/test';
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

// The browser refusing the session cookie: the server says yes, but nothing sticks.
async function dropSessionCookie(page: Page, path: string) {
	await page.route(`**${path}`, async (route) => {
		const response = await route.fetch();
		const headers = { ...response.headers() };
		delete headers['set-cookie'];
		await route.fulfill({ response, headers });
		await page.context().clearCookies();
	});
}

test('a login that leaves no session says so and keeps the username', async ({ browser, page }) => {
	const setup = await browser.newContext();
	const user = await registerUser(setup);
	await setup.close();

	await dropSessionCookie(page, '/auth/login');
	await page.goto('/login');
	await page.getByLabel('Username').fill(user.username);
	await page.getByLabel('Password').fill(user.password);
	await page.getByRole('button', { name: 'Sign in' }).click();

	await expect(page.getByRole('alert')).toHaveText(
		"Signed in, but this browser didn't keep you logged in. Allow cookies for this site, or open Zeta in another browser."
	);
	await expect(page.getByLabel('Username')).toHaveValue(user.username);
	await expect(page.getByLabel('Password')).toHaveValue('');
	await expect(page).toHaveURL(/\/login/);
});

test('a registration that leaves no session says so and keeps the username', async ({ page }) => {
	const username = uniqueName('nocookie');

	await dropSessionCookie(page, '/auth/register');
	await page.goto('/register');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery');
	await page.getByLabel('Confirm password').fill('correct-horse-battery');
	await page.getByRole('button', { name: 'Create account' }).click();

	await expect(page.getByRole('alert')).toHaveText(
		"Account created, but this browser didn't keep you logged in. Allow cookies for this site, or open Zeta in another browser."
	);
	await expect(page.getByLabel('Username')).toHaveValue(username);
	await expect(page).toHaveURL(/\/register/);
});
