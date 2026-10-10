import type { ServerImportFinishedFrame } from '$lib/types/serverImport.types';
import { forumState } from './forumState.svelte';
import { historySyncState } from './historySyncState.svelte';
import { resyncState } from './resyncState.svelte';
import { serverImportState } from './serverImportState.svelte';
import { serversState } from './serversState.svelte';

/** Every member sees what an import added; the owner's tab also shows the outcome. */
export async function refreshAfterImport(frame: ServerImportFinishedFrame): Promise<void> {
	const serverId = frame.server_id;
	serverImportState.refresh(serverId);

	const channelIds = frame.channel_ids ?? null;
	if (channelIds?.length === 0) {
		serversState
			.fetchServerChannels(serverId)
			.catch((e) => console.warn('Failed to reload channels after an import', e));
		return;
	}

	forumState.refreshChannels(channelIds);
	await historySyncState.forgetChannels(serverId, channelIds);
	await resyncState.request('import');
}
