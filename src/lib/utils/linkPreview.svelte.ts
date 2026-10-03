import { unfurl } from '$lib/requests/unfurl';
import type { Embed } from '$lib/types/messages.types';
import { firstLinkHref } from '$lib/utils/linkify';

const DEBOUNCE_MS = 400;

/** The preview card for the first link in the message being composed. */
export class LinkPreview {
	embed = $state<Embed | null>(null);
	loading = $state(false);

	private url: string | null = null;
	private dismissedUrl: string | null = null;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private controller: AbortController | undefined;

	/** Call on every edit with the message's plain text. */
	update(text: string) {
		const url = firstLinkHref(text);
		if (url === this.url) return;

		this.cancel();
		this.url = url;
		this.embed = null;
		if (url === null) {
			this.dismissedUrl = null;
			return;
		}
		if (url === this.dismissedUrl) return;

		this.dismissedUrl = null;
		this.loading = true;
		this.timer = setTimeout(() => this.fetch(url), DEBOUNCE_MS);
	}

	/** The user removed the card; don't bring it back for this link. */
	dismiss() {
		this.dismissedUrl = this.url;
		this.cancel();
		this.embed = null;
	}

	reset() {
		this.cancel();
		this.url = null;
		this.dismissedUrl = null;
		this.embed = null;
	}

	/** The card to send with `text`, only if it is still for its first link. */
	embedFor(text: string): Embed | null {
		return this.embed && this.embed.url === firstLinkHref(text) ? this.embed : null;
	}

	private async fetch(url: string) {
		const controller = new AbortController();
		this.controller = controller;
		const embed = await unfurl(url, controller.signal);
		if (controller.signal.aborted) return;
		this.embed = embed;
		this.loading = false;
	}

	private cancel() {
		clearTimeout(this.timer);
		this.controller?.abort();
		this.controller = undefined;
		this.loading = false;
	}
}
