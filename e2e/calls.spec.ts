import { expect, test } from '@playwright/test';
import { newUser, openConversation, registerUser } from './helpers';

// CI has no voice server, so starting a call ends in this toast rather than a call.
const NOT_SET_UP = "Voice isn't set up on this server.";

test('a call that cannot start says so and leaves no row in the conversation', async ({
	browser
}) => {
	const a = await newUser(browser, 'alice');
	const b = await newUser(browser, 'bob');
	const conversation = await openConversation(a.context, b.user.id);

	await a.page.goto(`/app/direct/${conversation.id}/`);
	await expect(a.page.getByText('Send the first message.')).toBeVisible();

	await a.page.getByRole('button', { name: 'Call', exact: true }).click();

	await expect(a.page.getByText(NOT_SET_UP)).toBeVisible();
	await expect(a.page.getByText(/Calling…|Started a call/)).toHaveCount(0);
	await expect(a.page.locator('[data-message-id]')).toHaveCount(0);
	await expect(a.page.getByText('Send the first message.')).toBeVisible();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

	test.beforeEach(async ({ context }) => {
		await context.addInitScript(() => {
			try {
				for (const key of ['notifications:installPrompt', 'notifications:pushPrompt']) {
					localStorage.setItem(key, JSON.stringify({ dismissedAt: Date.now(), count: 1 }));
				}
			} catch {
				// storage is unavailable on opaque origins
			}
		});
	});

	test('the conversation header keeps the Call button in reach', async ({
		browser,
		context,
		page
	}) => {
		await registerUser(context, 'alice');
		const b = await newUser(browser, 'bob');
		const conversation = await openConversation(context, b.user.id);

		await page.goto(`/app/direct/${conversation.id}/`);

		const call = page.getByRole('button', { name: 'Call', exact: true });
		await expect(call).toBeVisible();
		await expect(call).toBeInViewport({ ratio: 1 });
	});
});
