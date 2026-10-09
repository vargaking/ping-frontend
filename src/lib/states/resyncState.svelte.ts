import { serversState } from './serversState.svelte';
import { conversationsState } from './conversationsState.svelte';

export type ResyncReason = 'reconnect' | 'resume' | 'notification';

/** How long the page has to be hidden before coming back counts as a possible gap. */
export const HIDDEN_RESYNC_MS = 10_000;

/**
 * Catches up after frames may have been missed: refreshes the lists, then bumps
 * `generation`, which every open message list watches to refetch its thread.
 */
export class ResyncState {
	generation = $state(0);
	private running: Promise<void> | null = null;
	private queued = false;

	constructor(private refreshLists: () => Promise<void>) {}

	/** Runs one at a time; a request during a run queues a single follow-up. */
	request(reason: ResyncReason): Promise<void> {
		console.info(`Resyncing after ${reason}`);
		if (this.running) {
			this.queued = true;
			return this.running;
		}
		this.running = this.runUntilIdle().finally(() => (this.running = null));
		return this.running;
	}

	private async runUntilIdle() {
		do {
			this.queued = false;
			try {
				await this.refreshLists();
			} catch (e) {
				console.warn('Resync failed to refresh lists', e);
			}
			this.generation++;
		} while (this.queued);
	}
}

async function refreshLists() {
	await Promise.all([
		conversationsState.fetch(),
		...Object.keys(serversState.servers).map((id) =>
			serversState
				.loadServerChannels(Number(id), 0)
				.catch((e) => console.warn('Resync failed to refresh channels', e))
		)
	]);
}

export const resyncState = new ResyncState(refreshLists);
