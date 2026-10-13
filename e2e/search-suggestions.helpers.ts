import type { Locator, Page } from '@playwright/test';

export function activeFilters(page: Page): Locator {
	return page.getByRole('list', { name: 'Active filters' }).getByRole('listitem');
}

/** Swaps the whole query, chips included. Backspace at the start turns a chip back into text
 *  at the end of the input, so the text is cleared after each one. */
export async function replaceQuery(page: Page, search: Locator, text: string): Promise<void> {
	const chips = activeFilters(page);
	await search.fill('');
	while ((await chips.count()) > 0) {
		await search.press('Home');
		await search.press('Backspace');
		await search.fill('');
	}
	await search.fill(text);
}
