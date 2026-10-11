import { getWhatsNewState } from '$lib/requests/whatsNew/getWhatsNewState';
import { markWhatsNewSeen } from '$lib/requests/whatsNew/markWhatsNewSeen';
import type { WhatsNewEntry, WhatsNewSeen } from '$lib/types/whatsNew.types';
import { isUnseen, laterId } from '$lib/utils/whatsNew';
import { WHATS_NEW } from '$lib/whatsNew/entries';

export class WhatsNewState {
	/** The last server answer; null while unknown. */
	seen: WhatsNewSeen | null = $state(null);
	/** Set when the panel opens, so the dot clears even if the server cannot be reached. */
	private localSeenId: string | null = $state(null);
	private userId: number | null = null;
	private generation = 0;

	constructor(readonly entries: WhatsNewEntry[] = WHATS_NEW) {}

	get marker(): WhatsNewSeen | null {
		if (!this.seen) return null;
		return { ...this.seen, last_seen_id: laterId(this.seen.last_seen_id, this.localSeenId) };
	}

	isUnseen(entry: WhatsNewEntry): boolean {
		const marker = this.marker;
		return marker != null && isUnseen(entry, marker);
	}

	get hasUnseen(): boolean {
		return this.entries.some((entry) => this.isUnseen(entry));
	}

	/** Follows the signed-in user; a different user starts from unknown. */
	sync(userId: number | null): void {
		if (userId === this.userId) return;
		this.generation++;
		this.seen = null;
		this.localSeenId = null;
		this.userId = userId;
		if (userId != null) void this.refresh();
	}

	async refresh(): Promise<void> {
		if (this.userId == null) return;
		const generation = this.generation;
		try {
			const seen = await getWhatsNewState();
			if (generation === this.generation) this.seen = seen;
		} catch (e) {
			console.warn("Failed to load what's new state", e);
		}
	}

	async markAllSeen(): Promise<void> {
		const newest = this.entries[0];
		if (!newest || this.userId == null) return;
		this.localSeenId = laterId(this.localSeenId, newest.id);
		if (this.seen && !isUnseen(newest, this.seen)) return;

		const generation = this.generation;
		try {
			const stored = await markWhatsNewSeen(newest.id);
			if (generation !== this.generation) return;
			if (this.seen) {
				this.seen = {
					...this.seen,
					last_seen_id: laterId(this.seen.last_seen_id, stored.last_seen_id)
				};
			} else {
				void this.refresh();
			}
		} catch (e) {
			console.warn("Failed to save what's new state", e);
		}
	}
}

export const whatsNewState = new WhatsNewState();
