import { SvelteMap } from 'svelte/reactivity';
import { usersState } from './usersState.svelte';

export const TYPING_TIMEOUT_MS = 5000;

/** Who is typing in each thread, in the order they started. */
class TypingState {
	private typers = new SvelteMap<string, SvelteMap<number, number>>();
	private timers = new Map<string, ReturnType<typeof setTimeout>>();

	/** Show the user as typing until the timeout runs out; each call restarts it. */
	note(key: string, userId: number) {
		const timerKey = this.timerKey(key, userId);
		clearTimeout(this.timers.get(timerKey));

		let thread = this.typers.get(key);
		if (!thread) {
			thread = new SvelteMap();
			this.typers.set(key, thread);
		}
		thread.set(userId, Date.now() + TYPING_TIMEOUT_MS);
		this.timers.set(
			timerKey,
			setTimeout(() => this.clear(key, userId), TYPING_TIMEOUT_MS)
		);
	}

	clear(key: string, userId: number) {
		const timerKey = this.timerKey(key, userId);
		clearTimeout(this.timers.get(timerKey));
		this.timers.delete(timerKey);

		const thread = this.typers.get(key);
		if (!thread) return;
		thread.delete(userId);
		if (thread.size === 0) this.typers.delete(key);
	}

	clearUser(userId: number) {
		for (const [key, thread] of [...this.typers]) {
			if (thread.has(userId)) this.clear(key, userId);
		}
	}

	clearAll() {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
		this.typers.clear();
	}

	/** Usernames of everyone typing in the thread except the logged-in user. */
	names(key: string): string[] {
		const meId = usersState.loggedInUser?.id;
		return [...(this.typers.get(key)?.keys() ?? [])]
			.filter((userId) => userId !== meId)
			.map((userId) => usersState.users[userId]?.username ?? 'Someone');
	}

	private timerKey(key: string, userId: number) {
		return `${key}|${userId}`;
	}
}

export const typingState = new TypingState();
