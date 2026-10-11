import type { MessageType } from '$lib/types/messages.types';

/** The message each thread's composer is replying to, if any. Per thread, so
 *  switching threads keeps each draft reply. */
class ReplyState {
	target: Record<string, MessageType | undefined> = $state({});
	/** Bumped on every start() so the composer can pull focus. */
	focusRequest = $state(0);

	start(threadKey: string, message: MessageType) {
		this.target[threadKey] = $state.snapshot(message) as MessageType;
		this.focusRequest++;
	}

	cancel(threadKey: string) {
		delete this.target[threadKey];
	}

	/** Drop any draft reply to a message that no longer exists. */
	cancelFor(messageId: string) {
		for (const [key, message] of Object.entries(this.target)) {
			if (message?.id === messageId) delete this.target[key];
		}
	}

	reset() {
		this.target = {};
	}
}

export const replyState = new ReplyState();
