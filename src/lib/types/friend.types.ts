import type { User } from './auth.types';

export type FriendState = 'none' | 'outgoing' | 'incoming' | 'friends';

export type FriendshipReason =
	| 'requested'
	| 'accepted'
	| 'crossed'
	| 'declined'
	| 'cancelled'
	| 'removed';

export type FriendsList = {
	friends: { user: User; since: string }[];
	incoming: { user: User; created_at: string }[];
	outgoing: { user: User; created_at: string }[];
};

export type FriendTarget = { user_id: number } | { username: string };

export type FriendshipResult = {
	user: User;
	state: Exclude<FriendState, 'none'>;
	created_at: string;
};

export type FriendshipFrame = {
	type: 'friendship_updated';
	user_id: number;
	state: FriendState;
	reason: FriendshipReason;
	actor_id: number;
	user: User;
	created_at: string;
};

export type FriendEntry = {
	user: User;
	state: FriendState;
	/** When the current state began. */
	since: string;
};

export type FriendUpdate = {
	userId: number;
	state: FriendState;
	user?: User;
	at: string;
};
