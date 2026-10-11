import { normalizeError } from '$lib/requests/errors';
import type { User } from '$lib/types/auth.types';
import type {
	FriendEntry,
	FriendsList,
	FriendshipFrame,
	FriendshipResult,
	FriendState,
	FriendUpdate
} from '$lib/types/friend.types';

type Entries = Record<number, FriendEntry>;

/**
 * Take an update unless the entry already moved on past it. A `none` entry stays as a
 * tombstone, so a late older frame can't bring the row back.
 */
export function applyFriendship(entries: Entries, update: FriendUpdate): Entries {
	const existing = entries[update.userId];
	if (existing && Date.parse(update.at) < Date.parse(existing.since)) return entries;
	const user = update.user ?? existing?.user;
	if (!user) return entries;
	return { ...entries, [update.userId]: { user, state: update.state, since: update.at } };
}

export function entriesFromList(list: FriendsList): Entries {
	const entries: Entries = {};
	for (const { user, created_at } of list.outgoing) {
		entries[user.id] = { user, state: 'outgoing', since: created_at };
	}
	for (const { user, created_at } of list.incoming) {
		entries[user.id] = { user, state: 'incoming', since: created_at };
	}
	for (const { user, since } of list.friends) {
		entries[user.id] = { user, state: 'friends', since };
	}
	return entries;
}

/** Online first, then by name. */
export function sortFriends<T extends { user: User }>(
	list: T[],
	isOnline: (userId: number) => boolean
): T[] {
	return [...list].sort(
		(a, b) =>
			Number(isOnline(b.user.id)) - Number(isOnline(a.user.id)) ||
			a.user.username.localeCompare(b.user.username, undefined, { sensitivity: 'base' })
	);
}

export function newestFirst<T extends { since: string }>(list: T[]): T[] {
	return [...list].sort((a, b) => Date.parse(b.since) - Date.parse(a.since));
}

export type FriendToast = { message: string; viewRequests: boolean };

/** Only what someone else did to us is worth a toast; declining, cancelling and removing are silent. */
export function friendToast(frame: FriendshipFrame, meId: number | null): FriendToast | null {
	if (frame.actor_id === meId) return null;
	const name = frame.user.username;
	if (frame.reason === 'requested' && frame.state === 'incoming') {
		return { message: `${name} sent you a friend request`, viewRequests: true };
	}
	if (frame.reason === 'accepted' && frame.state === 'friends') {
		return { message: `${name} accepted your friend request`, viewRequests: false };
	}
	if (frame.reason === 'crossed' && frame.state === 'friends') {
		return { message: `You and ${name} are now friends`, viewRequests: false };
	}
	return null;
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function directRailLabel(dmUnread: number, requests: number): string {
	return (
		'Direct messages' +
		(dmUnread > 0 ? `, ${dmUnread} unread` : '') +
		(requests > 0 ? `, ${plural(requests, 'friend request')}` : '')
	);
}

export function friendsEntryLabel(requests: number): string {
	return requests > 0 ? `Friends, ${plural(requests, 'request')}` : 'Friends';
}

/** What the add form says after a request went through; `before` is how things stood. */
export function addFriendMessage(
	name: string,
	before: FriendState,
	result: FriendshipResult
): string {
	if (result.state === 'friends') {
		return before === 'friends'
			? `You and ${name} are already friends.`
			: `You and ${name} are now friends.`;
	}
	return before === 'outgoing'
		? `You already sent ${name} a request.`
		: `Friend request sent to ${name}.`;
}

export function addFriendError(name: string, status: number | null, fallback: string): string {
	if (status === 400) return 'You can’t add yourself.';
	if (status === 404) return `No one is called “${name}”. Usernames are case-sensitive.`;
	return fallback;
}

/** The message for a failed add, read off whatever was thrown. */
export function addFriendFailure(name: string, error: unknown): string {
	const { status, message } = normalizeError(error);
	return addFriendError(name, status, message);
}
