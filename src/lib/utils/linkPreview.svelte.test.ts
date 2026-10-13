import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Embed } from '$lib/types/messages.types';

const mocks = vi.hoisted(() => ({ unfurl: vi.fn() }));
vi.mock('$lib/requests/unfurl', () => ({ unfurl: mocks.unfurl }));

import { LinkPreview } from './linkPreview.svelte';

const ORIGIN = 'https://ping.example.com';
const CODE = '3f2b8c1e-5d4a-4e6f-9a7b-0c1d2e3f4a5b';

const embed: Embed = {
	url: 'https://example.org/post',
	site_name: null,
	title: 'A post',
	description: null,
	image_url: null
};

beforeEach(() => {
	vi.useFakeTimers();
	mocks.unfurl.mockReset();
	mocks.unfurl.mockResolvedValue(embed);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('LinkPreview', () => {
	it('fetches a card for another site', async () => {
		const preview = new LinkPreview(() => ORIGIN);

		preview.update('read https://example.org/post');
		await vi.advanceTimersByTimeAsync(1000);

		expect(mocks.unfurl).toHaveBeenCalledWith('https://example.org/post', expect.anything());
		expect(preview.embed).toEqual(embed);
	});

	it.each([
		['an invite link', `${ORIGIN}/invite/${CODE}/`],
		['an invite link with a query', `${ORIGIN}/invite/${CODE}?from=dm`]
	])('makes no request and no card for %s on this origin', async (_, link) => {
		const preview = new LinkPreview(() => ORIGIN);

		preview.update(`join ${link}`);
		await vi.advanceTimersByTimeAsync(1000);

		expect(mocks.unfurl).not.toHaveBeenCalled();
		expect(preview.embed).toBeNull();
		expect(preview.loading).toBe(false);
		expect(preview.embedFor(`join ${link}`)).toBeNull();
	});

	it('still fetches an invite link of another origin', async () => {
		const preview = new LinkPreview(() => ORIGIN);

		preview.update(`https://other.example.com/invite/${CODE}`);
		await vi.advanceTimersByTimeAsync(1000);

		expect(mocks.unfurl).toHaveBeenCalledTimes(1);
	});

	it('drops the card when the text changes to an invite link', async () => {
		const preview = new LinkPreview(() => ORIGIN);
		preview.update('https://example.org/post');
		await vi.advanceTimersByTimeAsync(1000);

		preview.update(`${ORIGIN}/invite/${CODE}`);

		expect(preview.embed).toBeNull();
	});
});
