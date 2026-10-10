/** Within this distance of the top the list asks for older messages. */
export const NEAR_TOP_PX = 150;
/** A fetch that takes longer than this shows placeholder rows. */
export const SKELETON_DELAY_MS = 200;
/** Ignore sub-pixel rounding when deciding whether the list overflows. */
const OVERFLOW_SLACK_PX = 4;

export type ScrollPosition = Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>;

/** Near the top, or too short to scroll at all, so the user can't reach older messages by scrolling. */
export function wantsOlder(m: ScrollPosition): boolean {
	const overflows = m.scrollHeight - m.clientHeight > OVERFLOW_SLACK_PX;
	return !overflows || m.scrollTop <= NEAR_TOP_PX;
}

export type OlderResult = { ok: true; added: number } | { ok: false };

export type OlderHistoryHost<Page> = {
	metrics(): ScrollPosition | null;
	/** An older page exists and the list is in a state to take it. */
	available(): boolean;
	fetch(): Promise<Page>;
	/** Prepends the page and returns how many messages it added. */
	apply(page: Page): number;
	/** Runs `change`, then restores the view to the messages it showed before. */
	keepView(change: () => void): Promise<void>;
};

/** Loads older pages of a thread when the user is at its top, and tracks what to show meanwhile. */
export class OlderHistory<Page> {
	loading = $state(false);
	/** The fetch is taking long enough that placeholder rows should show. */
	slow = $state(false);
	/** The last fetch failed; cleared once a page loads. */
	failed = $state(false);

	#host: OlderHistoryHost<Page>;
	#delayMs: number;
	#run: Promise<OlderResult> | null = null;
	#timer: ReturnType<typeof setTimeout> | null = null;
	#generation = 0;

	constructor(host: OlderHistoryHost<Page>, delayMs = SKELETON_DELAY_MS) {
		this.#host = host;
		this.#delayMs = delayMs;
	}

	/**
	 * Loads pages while the user is at the top, or the list is too short to scroll. Safe to call
	 * on every scroll: it does nothing while a fetch is running, and after a failure only a
	 * later call (another scroll, or `force` from a retry button) tries again.
	 */
	async request(force = false): Promise<void> {
		if (this.#run || !this.#host.available()) return;
		const position = this.#host.metrics();
		if (!force && position && !wantsOlder(position)) return;
		const result = await this.load();
		if (result.ok && result.added > 0) await this.request();
	}

	/** Fetches the next older page whatever the position; calls during a fetch share it. */
	load(): Promise<OlderResult> {
		if (this.#run) return this.#run;
		const run = this.#fetchPage().finally(() => {
			if (this.#run === run) this.#run = null;
		});
		this.#run = run;
		return run;
	}

	/** Resolves once no fetch is running. */
	async idle(): Promise<void> {
		await this.#run;
	}

	/** Forget a fetch in progress, e.g. when another thread is shown. */
	reset() {
		this.#generation++;
		this.#run = null;
		this.#finish();
		this.failed = false;
	}

	async #fetchPage(): Promise<OlderResult> {
		const generation = this.#generation;
		this.loading = true;
		this.#timer = setTimeout(() => (this.slow = true), this.#delayMs);

		let page: Page;
		try {
			page = await this.#host.fetch();
		} catch (e) {
			if (generation !== this.#generation) return { ok: true, added: 0 };
			console.error('Failed to load older messages', e);
			await this.#host.keepView(() => {
				this.#finish();
				this.failed = true;
			});
			return { ok: false };
		}
		if (generation !== this.#generation) return { ok: true, added: 0 };

		let added = 0;
		await this.#host.keepView(() => {
			added = this.#host.apply(page);
			this.#finish();
			this.failed = false;
		});
		return { ok: true, added };
	}

	#finish() {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		this.loading = false;
		this.slow = false;
	}
}
