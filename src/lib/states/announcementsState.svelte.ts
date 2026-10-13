import { toast } from 'svelte-sonner';
import { dismissAnnouncement } from '$lib/requests/announcements/dismissAnnouncement';
import { getAnnouncements } from '$lib/requests/announcements/getAnnouncements';
import type { Announcement, AnnouncementLevel } from '$lib/types/announcement.types';

/** The longest delay setTimeout accepts; anything larger fires at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

const SEVERITY: Record<AnnouncementLevel, number> = { info: 0, maintenance: 1, incident: 2 };

const newestFirst = (a: Announcement, b: Announcement) =>
	b.created_at.localeCompare(a.created_at) || b.id - a.id;

export class AnnouncementsState {
	/** Everything the server returned for the last 30 days, ended ones included. */
	items: Announcement[] = $state([]);
	private userId: number | null = null;
	private generation = 0;
	/** Counts local changes, so a response that was overtaken by one gets merged, not swapped in. */
	private mutations = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;

	/** Newest first, for the What's new panel. */
	get listed(): Announcement[] {
		return [...this.items].sort(newestFirst);
	}

	/** What the banner may show: not ended, not dismissed, most severe then newest first. */
	get active(): Announcement[] {
		return this.items
			.filter((a) => !a.ended && !a.dismissed)
			.sort((a, b) => SEVERITY[b.level] - SEVERITY[a.level] || newestFirst(a, b));
	}

	/** Follows the signed-in user; a different user starts from empty. */
	sync(userId: number | null): void {
		if (userId === this.userId) return;
		this.generation++;
		this.userId = userId;
		this.mutations++;
		this.items = [];
		this.rearm();
		if (userId != null) void this.refresh();
	}

	async refresh(): Promise<void> {
		if (this.userId == null) return;
		const generation = this.generation;
		const mutations = this.mutations;
		try {
			const items = await getAnnouncements();
			if (generation !== this.generation) return;
			this.items = mutations === this.mutations ? items : this.merge(items);
			this.rearm();
		} catch (e) {
			console.warn('Failed to load announcements', e);
		}
	}

	apply(announcement: Announcement): void {
		if (this.userId == null) return;
		this.mutations++;
		this.items = [...this.items.filter((a) => a.id !== announcement.id), announcement];
		this.rearm();
	}

	markEnded(id: number, expiresAt: string): void {
		this.mutations++;
		this.items = this.items.map((a) =>
			a.id === id ? { ...a, ended: true, expires_at: expiresAt } : a
		);
		this.rearm();
	}

	async dismiss(id: number): Promise<void> {
		const generation = this.generation;
		this.setDismissed(id, true);
		try {
			await dismissAnnouncement(id);
		} catch (e) {
			console.warn('Failed to dismiss announcement', e);
			if (generation !== this.generation) return;
			this.setDismissed(id, false);
			toast.error("Couldn't dismiss the announcement");
		}
	}

	private setDismissed(id: number, dismissed: boolean) {
		this.mutations++;
		this.items = this.items.map((a) => (a.id === id ? { ...a, dismissed } : a));
	}

	/** What the server said, plus what happened here while it was answering. */
	private merge(fetched: Announcement[]): Announcement[] {
		const merged = fetched.map((remote) => {
			const mine = this.items.find((a) => a.id === remote.id);
			if (!mine) return remote;
			return {
				...remote,
				dismissed: mine.dismissed || remote.dismissed,
				...(mine.ended && { ended: true, expires_at: mine.expires_at })
			};
		});
		const fromFrames = this.items.filter((a) => !fetched.some((f) => f.id === a.id));
		return [...merged, ...fromFrames];
	}

	/** One timer, to the soonest expiry; the server filter and resync cover a sleeping tab. */
	private rearm() {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		const soonest = Math.min(
			...this.items
				.filter((a) => !a.ended && a.expires_at != null)
				.map((a) => Date.parse(a.expires_at!))
		);
		if (!Number.isFinite(soonest)) return;
		const delay = Math.min(Math.max(soonest - Date.now(), 0), MAX_TIMER_MS);
		this.timer = setTimeout(() => this.expire(), delay);
	}

	private expire() {
		const now = Date.now();
		this.items = this.items.map((a) =>
			!a.ended && a.expires_at != null && Date.parse(a.expires_at) <= now
				? { ...a, ended: true }
				: a
		);
		this.rearm();
	}
}

export const announcementsState = new AnnouncementsState();
