import { channelThreadKey } from '$lib/states/messagesState.svelte';
import { unreadState } from '$lib/states/unreadState.svelte';
import { documentFocusState } from '$lib/utils/documentFocus.svelte';

const MARK_READ_DELAY_MS = 400;

/**
 * Keep a forum channel read while one of its views is open and in front of the
 * user: new posts and replies that arrive then don't leave it unread. Call
 * during component setup.
 */
export function trackForumRead(channelId: () => number | null) {
	documentFocusState.attach();

	$effect(() => {
		const id = channelId();
		if (id == null || !documentFocusState.reading) return;
		const key = channelThreadKey(id);
		unreadState.setActiveThread(key);
		return () => {
			if (unreadState.isBeingRead(key)) unreadState.setActiveThread(null);
		};
	});

	$effect(() => {
		const id = channelId();
		if (id == null || !documentFocusState.reading) return;
		if (!unreadState.channelUnread(id)) return;
		const timer = setTimeout(() => unreadState.markChannelRead(id), MARK_READ_DELAY_MS);
		return () => clearTimeout(timer);
	});
}
