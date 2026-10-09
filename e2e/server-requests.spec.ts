import { expect, test, type BrowserContext } from '@playwright/test';
import { newUser, uniqueName } from './helpers';

type Mode = { mode: 'open' | 'waitlist'; can_create: boolean };

async function serverCreationMode(context: BrowserContext) {
	const response = await context.request.get('/server-requests/me');
	expect(response.ok(), `/server-requests/me responded ${response.status()}`).toBe(true);
	return (await response.json()) as Mode;
}

test('with open server creation the flow says create and settings has no Server requests', async ({
	browser
}) => {
	const { context, page } = await newUser(browser, 'creator');
	const { mode } = await serverCreationMode(context);
	test.skip(mode !== 'open', 'The backend is running in waitlist mode');

	await page.goto('/app/direct/');
	await page.getByRole('button', { name: 'Create a server' }).click();
	const dialog = page.getByRole('dialog', { name: 'Add a server' });
	await expect(dialog.getByRole('tab', { name: 'Create' })).toBeVisible();
	await expect(dialog.getByLabel('Server name')).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
	await expect(dialog.getByText('approved by hand')).toHaveCount(0);
	await page.keyboard.press('Escape');

	await page.getByRole('button', { name: 'Account settings' }).click();
	const settings = page.getByRole('navigation', { name: 'Settings' });
	await expect(settings.getByRole('button', { name: 'My account' })).toBeVisible();
	await expect(settings.getByRole('button', { name: 'Server requests' })).toHaveCount(0);
});

test('in waitlist mode a request is sent, shown as pending in settings, and withdrawn', async ({
	browser
}) => {
	const { context, page } = await newUser(browser, 'requester');
	const { mode, can_create } = await serverCreationMode(context);
	test.skip(mode !== 'waitlist', 'The backend is running in open mode');
	expect(can_create, 'a new user is not a platform admin').toBe(false);

	const serverName = uniqueName('Guild');
	await page.goto('/app/direct/');

	await page.getByRole('button', { name: 'Request a server' }).click();
	const dialog = page.getByRole('dialog', { name: 'Request a server' });
	await expect(dialog.getByText(/approved by hand while capacity is limited/)).toBeVisible();
	await expect(dialog.getByText(/needs no approval/)).toBeVisible();
	await expect(dialog.getByRole('button', { name: /^Create/ })).toHaveCount(0);

	await dialog.getByLabel('Server name').fill(serverName);
	await dialog.getByLabel('What is it for?').fill('Game nights with friends');
	await dialog.getByRole('button', { name: 'Send request' }).click();

	await expect(dialog.getByText('Request sent')).toBeVisible();
	await dialog.getByRole('button', { name: 'View request status' }).click();
	await expect(dialog).toBeHidden();

	const settings = page.getByRole('navigation', { name: 'Settings' });
	await expect(settings.getByRole('button', { name: 'Server requests' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	const current = page.getByRole('region', { name: 'Current request' });
	await expect(current.getByText(serverName)).toBeVisible();
	await expect(current.getByText('Pending')).toBeVisible();
	await expect(current.getByText('Game nights with friends')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Past requests' })).toContainText(
		'No past requests'
	);

	await current.getByRole('button', { name: 'Withdraw', exact: true }).click();
	await current.getByRole('button', { name: 'Withdraw request' }).click();
	await expect(current.getByText('No request yet')).toBeVisible();
	const past = page.getByRole('region', { name: 'Past requests' });
	await expect(past.getByText(serverName)).toBeVisible();
	await expect(past.getByText('Withdrawn')).toBeVisible();
});
