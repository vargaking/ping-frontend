import { goto } from '$app/navigation';
import { overlayState } from '$lib/states/overlayState.svelte';
import { phoneState } from '$lib/states/phoneState.svelte';
import type { StoredMessage, StoredPost } from '$lib/types/localHistory.types';
import { channelPath, postPath } from '$lib/utils/channelRoutes';

export type SearchResult =
	| { kind: 'message'; message: StoredMessage }
	| { kind: 'post'; post: StoredPost };

export const JUMP_PARAM = 'm';

/** Where a result lives; message results carry the message to scroll to. */
export function searchResultPath(result: SearchResult): string | null {
	if (result.kind === 'post') {
		const { server_id, channel_id, id } = result.post;
		return postPath(server_id, channel_id, id);
	}

	const { id, server_id, channel_id, conversation_id, post_id } = result.message;
	let path: string;
	if (conversation_id != null) path = `/app/direct/${conversation_id}/`;
	else if (server_id == null || channel_id == null) return null;
	else if (post_id != null) path = postPath(server_id, channel_id, post_id);
	else path = channelPath(server_id, { id: channel_id, type: 'text' });
	return `${path}?${JUMP_PARAM}=${encodeURIComponent(id)}`;
}

/** Closes the search dialog and goes to the result. On a phone that means the page, not the navigation. */
export async function openSearchResult(result: SearchResult): Promise<void> {
	const path = searchResultPath(result);
	if (!path) return;
	overlayState.close();
	phoneState.closeNav();
	await goto(path);
}

/** Drops the jump parameter once a list has scrolled to its message. */
export function clearJumpParam(current: URL): Promise<void> {
	const url = new URL(current);
	url.searchParams.delete(JUMP_PARAM);
	return goto(url, { replaceState: true, keepFocus: true, noScroll: true });
}
