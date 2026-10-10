import { expect, test, type Page } from '@playwright/test';
import { newUser, registerUser } from './helpers';

const NEWEST_TITLE = 'Catching up is quicker';

/** The button reads "What's new" until the state has loaded too, so wait for it. */
function stateLoaded(page: Page) {
	return page.waitForResponse(
		(r) => r.url().endsWith('/whats-new/state') && r.request().method() === 'GET'
	);
}

test('the dot shows for unseen entries and clears once the panel was opened', async ({
	browser
}) => {
	const { context, page, user } = await newUser(browser);

	await Promise.all([stateLoaded(page), page.goto('/app/')]);
	await expect(page.getByRole('button', { name: "What's new", exact: true })).toBeVisible();

	const stored = await context.request.put('/whats-new/state', {
		data: { last_seen_id: '2026-01-01' }
	});
	expect(stored.ok()).toBe(true);
	await page.reload();

	await page.getByRole('button', { name: "What's new, new updates", exact: true }).click();
	await expect(page.getByRole('heading', { name: "What's new", level: 1 })).toBeVisible();
	await expect(page.getByRole('heading', { name: NEWEST_TITLE })).toBeVisible();

	await page.getByRole('button', { name: "Close what's new", exact: true }).click();
	await expect(page.getByRole('heading', { name: "What's new", level: 1 })).toBeHidden();
	await expect(page.getByRole('button', { name: "What's new", exact: true })).toBeVisible();

	expect((await (await context.request.get('/whats-new/state')).json()).last_seen_id).toBe(
		'2026-10-10-2'
	);
	await Promise.all([stateLoaded(page), page.reload()]);
	await expect(page.getByRole('button', { name: "What's new", exact: true })).toBeVisible();

	const other = await browser.newContext();
	const login = await other.request.post('/auth/login', {
		data: { username: user.username, password: user.password }
	});
	expect(login.ok()).toBe(true);
	const otherPage = await other.newPage();
	await Promise.all([stateLoaded(otherPage), otherPage.goto('/app/')]);
	await expect(otherPage.getByRole('button', { name: "What's new", exact: true })).toBeVisible();
	await other.close();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('the panel fills the screen and closing leaves the page where it was', async ({
		context,
		page
	}) => {
		await registerUser(context);
		await context.request.put('/whats-new/state', { data: { last_seen_id: '2026-01-01' } });

		await page.goto('/app/direct/');
		const url = page.url();
		await page.getByRole('button', { name: "What's new, new updates", exact: true }).tap();

		const heading = page.getByRole('heading', { name: "What's new", level: 1 });
		await expect(heading).toBeVisible();
		const panel = page.locator('[data-fullscreen]');
		await expect.poll(async () => (await panel.boundingBox())?.width).toBe(390);
		expect((await panel.boundingBox())?.height).toBeGreaterThanOrEqual(800);

		await page.getByRole('button', { name: "Close what's new", exact: true }).tap();
		await expect(heading).toBeHidden();
		expect(page.url()).toBe(url);
	});
});
