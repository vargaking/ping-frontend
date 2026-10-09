import { beforeEach, describe, expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import { overlayState } from '$lib/states/overlayState.svelte';
import { phoneState } from '$lib/states/phoneState.svelte';
import type { StoredMessage, StoredPost } from '$lib/types/localHistory.types';
import { clearJumpParam, openSearchResult, searchResultPath } from './openSearchResult';

vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));

const message = (fields: Partial<StoredMessage>) => ({ id: 'abc-1', ...fields }) as StoredMessage;

beforeEach(() => {
	vi.mocked(goto).mockClear();
});

describe('searchResultPath', () => {
	it('opens a channel message at the message', () => {
		expect(
			searchResultPath({
				kind: 'message',
				message: message({ server_id: 3, channel_id: 7 })
			})
		).toBe('/app/server/3/channel/7/?m=abc-1');
	});

	it('opens a post message inside its post', () => {
		expect(
			searchResultPath({
				kind: 'message',
				message: message({ server_id: 3, channel_id: 7, post_id: 9 })
			})
		).toBe('/app/server/3/forum/7/9/?m=abc-1');
	});

	it('opens a direct message in its conversation', () => {
		expect(searchResultPath({ kind: 'message', message: message({ conversation_id: 4 }) })).toBe(
			'/app/direct/4/?m=abc-1'
		);
	});

	it('opens a post without a message to jump to', () => {
		const post = { id: 9, channel_id: 7, server_id: 3 } as StoredPost;
		expect(searchResultPath({ kind: 'post', post })).toBe('/app/server/3/forum/7/9/');
	});

	it('has no path for a message without a place', () => {
		expect(searchResultPath({ kind: 'message', message: message({}) })).toBeNull();
	});
});

describe('openSearchResult', () => {
	it('closes the dialog, shows the page on a phone, and navigates', async () => {
		overlayState.open({} as never);
		phoneState.navOpen = true;

		await openSearchResult({ kind: 'message', message: message({ conversation_id: 4 }) });

		expect(overlayState.isOpen).toBe(false);
		expect(phoneState.navOpen).toBe(false);
		expect(goto).toHaveBeenCalledWith('/app/direct/4/?m=abc-1');
	});

	it('does nothing for a result without a place', async () => {
		await openSearchResult({ kind: 'message', message: message({}) });
		expect(goto).not.toHaveBeenCalled();
	});
});

describe('clearJumpParam', () => {
	it('removes only the jump parameter and replaces the history entry', async () => {
		await clearJumpParam(new URL('https://zeta.test/app/direct/4/?m=abc-1&x=1#top'));

		const [url, options] = vi.mocked(goto).mock.calls[0];
		expect(String(url)).toBe('https://zeta.test/app/direct/4/?x=1#top');
		expect(options).toEqual({ replaceState: true, keepFocus: true, noScroll: true });
	});
});
