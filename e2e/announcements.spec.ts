import { expect, test } from '@playwright/test';
import { newUser, uniqueName } from './helpers';
import { datetimeLocalIn, makePlatformAdmin } from './announcements.helpers';

test('an announcement reaches an online user without a refresh and stays dismissed', async ({
	browser
}) => {
	const admin = await newUser(browser, 'admin');
	makePlatformAdmin(admin.user.username);
	const reader = await newUser(browser, 'reader');

	await reader.page.goto('/app/');
	await expect(
		reader.page.getByRole('button', { name: 'Connection status: Connected' })
	).toBeVisible();

	// The database outlives the run, so the announcement ends by itself even if the test dies.
	const text = uniqueName('Scheduled downtime');
	let id: number | undefined;
	try {
		await admin.page.goto('/admin/announcements/');
		await admin.page.getByLabel('Text').fill(text);
		await admin.page.getByLabel('Level').selectOption('incident');
		await admin.page.getByLabel('Expires (optional)').fill(datetimeLocalIn(10));
		const [created] = await Promise.all([
			admin.page.waitForResponse(
				(r) => r.url().endsWith('/api/admin/announcements') && r.request().method() === 'POST'
			),
			admin.page.getByRole('button', { name: 'Send announcement' }).click()
		]);
		expect(created.status()).toBe(201);
		id = (await created.json()).id;
		await expect(admin.page.getByText(text)).toBeVisible();

		const banner = reader.page.getByRole('alert').filter({ hasText: text });
		await expect(banner, 'the reader should see it without reloading').toBeVisible();

		await banner.getByRole('button', { name: 'Dismiss announcement' }).click();
		await expect(banner).toBeHidden();

		const [list] = await Promise.all([
			reader.page.waitForResponse(
				(r) => r.url().endsWith('/api/announcements') && r.request().method() === 'GET'
			),
			reader.page.reload()
		]);
		const stored = (await list.json()).find((a: { id: number }) => a.id === id);
		expect(stored?.dismissed, 'the server should remember the dismissal').toBe(true);
		await expect(
			reader.page.getByRole('button', { name: 'Connection status: Connected' })
		).toBeVisible();
		await expect(banner, 'a reload should keep it dismissed').toBeHidden();
	} finally {
		if (id != null) await admin.context.request.post(`/api/admin/announcements/${id}/end`);
	}
});
