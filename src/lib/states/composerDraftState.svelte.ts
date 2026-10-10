import type { JSONContent } from '@tiptap/core';
import { saveReloadDraft, takeReloadDraft, type StorageLike } from '$lib/utils/reloadDraft';

export type OpenComposer = {
	threadKey: () => string | null;
	/** Null when the editor is empty. */
	content: () => JSONContent | null;
	hasAttachments: () => boolean;
};

/** The conversation composer on screen, so reloading for an update can keep its text. */
export class ComposerDraftState {
	private open = $state.raw<OpenComposer | null>(null);

	constructor(private storage: () => StorageLike | null) {}

	register(composer: OpenComposer): () => void {
		this.open = composer;
		return () => {
			if (this.open === composer) this.open = null;
		};
	}

	get hasUnsentAttachments(): boolean {
		return this.open?.hasAttachments() ?? false;
	}

	saveForReload(now = Date.now()) {
		const threadKey = this.open?.threadKey();
		const content = this.open?.content();
		saveReloadDraft(
			this.storage(),
			threadKey && content ? { threadKey, content, savedAt: now } : null
		);
	}

	takeRestored(threadKey: string, now = Date.now()): JSONContent | undefined {
		return takeReloadDraft(this.storage(), threadKey, now) ?? undefined;
	}
}

function sessionStore(): StorageLike | null {
	try {
		return typeof sessionStorage === 'undefined' ? null : sessionStorage;
	} catch {
		return null;
	}
}

export const composerDraftState = new ComposerDraftState(sessionStore);
