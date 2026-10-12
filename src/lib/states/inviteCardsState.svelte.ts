import { SvelteMap } from 'svelte/reactivity';
import { normalizeError } from '$lib/requests/errors';
import { getInvite } from '$lib/requests/invites';
import type { InvitePublicResponse } from '$lib/types/invite.types';

/** What an invite code resolved to. A code that is still loading has no entry. */
export type InviteCardEntry =
	| { status: 'ready'; invite: InvitePublicResponse }
	| { status: 'gone' }
	| { status: 'failed' };

/**
 * One lookup per invite code for every card on screen. The answers belong to the user who
 * asked: the server tells a signed-in member things it keeps from guests.
 */
export class InviteCardsState {
	private entries = new SvelteMap<string, InviteCardEntry>();
	private inflight = new SvelteMap<string, Promise<void>>();
	private owner: number | null | undefined;
	private generation = 0;

	entry(code: string, userId: number | null): InviteCardEntry | undefined {
		return this.owner === userId ? this.entries.get(code) : undefined;
	}

	/** Looks the code up unless it is already known or on its way. */
	load(code: string, userId: number | null): Promise<void> {
		this.claim(userId);
		if (this.entries.has(code)) return Promise.resolve();

		const pending = this.inflight.get(code);
		if (pending) return pending;

		const generation = this.generation;
		const request: Promise<void> = this.lookup(code)
			.then((entry) => {
				if (generation === this.generation) this.entries.set(code, entry);
			})
			.finally(() => {
				if (this.inflight.get(code) === request) this.inflight.delete(code);
			});
		this.inflight.set(code, request);
		return request;
	}

	/** Fetches the code again, e.g. for the member count after a join; the old answer stays shown. */
	async refresh(code: string, userId: number | null): Promise<void> {
		this.claim(userId);
		const generation = this.generation;
		const entry = await this.lookup(code);
		if (generation === this.generation && entry.status === 'ready') this.entries.set(code, entry);
	}

	reset(): void {
		this.entries.clear();
		this.inflight.clear();
		this.generation++;
		this.owner = undefined;
	}

	private claim(userId: number | null): void {
		if (this.owner === userId) return;
		this.reset();
		this.owner = userId;
	}

	private async lookup(code: string): Promise<InviteCardEntry> {
		try {
			return { status: 'ready', invite: await getInvite(code) };
		} catch (e) {
			return { status: normalizeError(e).status === 404 ? 'gone' : 'failed' };
		}
	}
}

export const inviteCardsState = new InviteCardsState();
