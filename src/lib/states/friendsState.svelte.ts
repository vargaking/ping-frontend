import { acceptFriendRequest } from '$lib/requests/friends/acceptFriendRequest';
import { cancelFriendRequest } from '$lib/requests/friends/cancelFriendRequest';
import { declineFriendRequest } from '$lib/requests/friends/declineFriendRequest';
import { getFriends } from '$lib/requests/friends/getFriends';
import { removeFriend } from '$lib/requests/friends/removeFriend';
import { sendFriendRequest } from '$lib/requests/friends/sendFriendRequest';
import { normalizeError } from '$lib/requests/errors';
import type {
	FriendEntry,
	FriendshipFrame,
	FriendshipResult,
	FriendState,
	FriendTarget,
	FriendUpdate
} from '$lib/types/friend.types';
import { applyFriendship, entriesFromList } from '$lib/utils/friends';
import { usersState } from './usersState.svelte';

export class FriendsState {
	entries: Record<number, FriendEntry> = $state({});
	loaded = $state(false);
	loadFailed = $state(false);

	private fetchSeq = 0;
	private loading = false;
	/** Updates that landed while a response was in flight; they are newer than it. */
	private sinceFetch: FriendUpdate[] = [];

	readonly friends = $derived(this.withState('friends'));
	readonly incoming = $derived(this.withState('incoming'));
	readonly outgoing = $derived(this.withState('outgoing'));
	readonly incomingCount = $derived(this.incoming.length);

	private withState(state: FriendState): FriendEntry[] {
		return Object.values(this.entries).filter((entry) => entry.state === state);
	}

	stateOf(userId: number): FriendState {
		return this.entries[userId]?.state ?? 'none';
	}

	/** Usernames are case-sensitive. */
	stateOfName(username: string): FriendState {
		const entry = Object.values(this.entries).find((e) => e.user.username === username);
		return entry?.state ?? 'none';
	}

	/** Never throws. A response that a newer fetch or a reset overtook is dropped. */
	async fetch() {
		const seq = ++this.fetchSeq;
		this.loading = true;
		this.sinceFetch = [];
		try {
			const list = await getFriends();
			if (seq !== this.fetchSeq) return;
			let entries = entriesFromList(list);
			for (const update of this.sinceFetch) entries = applyFriendship(entries, update);
			this.entries = entries;
			for (const { user } of Object.values(entries)) {
				if (!usersState.users[user.id]) usersState.applyUser(user);
			}
			this.loaded = true;
			this.loadFailed = false;
		} catch (e) {
			if (seq !== this.fetchSeq) return;
			console.warn('Failed to load friends', e);
			this.loadFailed = true;
		} finally {
			if (seq === this.fetchSeq) {
				this.loading = false;
				this.sinceFetch = [];
			}
		}
	}

	/** False when the frame is older than what we already know. */
	applyFrame(frame: FriendshipFrame): boolean {
		const applied = this.apply({
			userId: frame.user_id,
			state: frame.state,
			user: frame.user,
			at: frame.created_at
		});
		if (applied) usersState.applyUser(frame.user);
		return applied;
	}

	async request(target: FriendTarget): Promise<FriendshipResult> {
		return this.applyResult(await sendFriendRequest(target));
	}

	async accept(userId: number): Promise<FriendshipResult> {
		try {
			return this.applyResult(await acceptFriendRequest(userId));
		} catch (e) {
			if (normalizeError(e).status !== 404) throw e;
			await this.fetch();
			throw new Error('That friend request is no longer there.');
		}
	}

	async decline(userId: number) {
		const since = this.entries[userId]?.since;
		await declineFriendRequest(userId);
		this.dropIfUnchanged(userId, since);
	}

	async cancel(userId: number) {
		const since = this.entries[userId]?.since;
		await cancelFriendRequest(userId);
		this.dropIfUnchanged(userId, since);
	}

	async remove(userId: number) {
		const since = this.entries[userId]?.since;
		await removeFriend(userId);
		this.dropIfUnchanged(userId, since);
	}

	reset() {
		this.fetchSeq++;
		this.loading = false;
		this.sinceFetch = [];
		this.entries = {};
		this.loaded = false;
		this.loadFailed = false;
	}

	private applyResult(result: FriendshipResult): FriendshipResult {
		usersState.applyUser(result.user);
		this.apply({
			userId: result.user.id,
			state: result.state,
			user: result.user,
			at: result.created_at
		});
		return result;
	}

	/** An answer of 204 says nothing about when it happened, so a newer entry stays. */
	private dropIfUnchanged(userId: number, since: string | undefined) {
		if (since) this.apply({ userId, state: 'none', at: since });
	}

	private apply(update: FriendUpdate): boolean {
		const current = this.entries;
		const next = applyFriendship(current, update);
		if (next === current) return false;
		this.entries = next;
		if (this.loading) this.sinceFetch.push(update);
		return true;
	}
}

export const friendsState = new FriendsState();
