import { beforeEach, describe, expect, it } from 'vitest';
import type { Conversation } from '$lib/types/conversation.types';
import type { FriendshipFrame } from '$lib/types/friend.types';
import { conversationsState } from './conversationsState.svelte';
import { friendsState } from './friendsState.svelte';
import { unreadState } from './unreadState.svelte';

function requestFrame(state: FriendshipFrame['state']): FriendshipFrame {
	return {
		type: 'friendship_updated',
		user_id: 3,
		state,
		reason: 'requested',
		actor_id: state === 'incoming' ? 3 : 1,
		user: { id: 3, username: 'cat', public_key: '', profile: {} },
		created_at: '2026-10-11T10:00:00Z'
	};
}

beforeEach(() => {
	unreadState.reset();
	conversationsState.reset();
	friendsState.reset();
});

describe('badgeTotal', () => {
	it('adds the requests sent to me to mentions and unread DMs', () => {
		conversationsState.conversations[7] = {
			id: 7,
			created_at: '2026-10-08T12:00:00Z',
			other_user: { id: 2, username: 'bob' },
			last_message: null,
			last_activity: '2026-10-08T12:00:00Z',
			last_message_id: 'm9',
			last_read_message_id: 'm0',
			unread_count: 4
		} as Conversation;
		unreadState.noteChannelMessage(1, 1, 'm1', { mentionsMe: true });
		expect(unreadState.badgeTotal).toBe(5);

		friendsState.applyFrame(requestFrame('incoming'));
		expect(unreadState.badgeTotal).toBe(6);
	});

	it('leaves out the requests I sent', () => {
		friendsState.applyFrame(requestFrame('outgoing'));
		expect(unreadState.badgeTotal).toBe(0);
	});
});
