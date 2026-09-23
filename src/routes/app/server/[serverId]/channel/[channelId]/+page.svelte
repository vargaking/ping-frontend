<script lang="ts">
	import { page } from '$app/state';
	import Composer from '$lib/components/ui/message/Composer.svelte';
	import ChannelHeader from '$lib/components/ui/message/ChannelHeader.svelte';
	import MessageList from '$lib/components/ui/message/MessageList.svelte';
	import TypingIndicator from '$lib/components/ui/message/TypingIndicator.svelte';
	import UsersSidebar from '$lib/components/ui/sidebar/UsersSidebar.svelte';
	import type { MessageTarget } from '$lib/types/messages.types';
	import { channelThreadKey } from '$lib/states/messagesState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { getChannelMessages } from '$lib/requests/channels/getChannelMessages';
	import { db } from '$lib/utils/db';
	import { untrack } from 'svelte';

	let membersOpen = $state(true);

	const currentChannelId = $derived(page.params.channelId ? parseInt(page.params.channelId) : null);
	const serverId = $derived(serversState.selectedServer?.id ?? null);

	const target = $derived<MessageTarget | null>(
		serverId != null && currentChannelId != null
			? { kind: 'channel', serverId, channelId: currentChannelId }
			: null
	);

	// Also waits on the channel itself, so a direct load selects it once the
	// server's channels arrive.
	$effect(() => {
		const channelId = currentChannelId;
		if (channelId == null || !serversState.selectedServerChannels[channelId]) return;
		untrack(() => serversState.setSelectedChannelById(channelId));
	});
</script>

<div class="flex h-full min-h-0">
	<div class="flex min-w-0 flex-1 flex-col">
		<ChannelHeader {membersOpen} onToggleMembers={() => (membersOpen = !membersOpen)} />

		{#if currentChannelId != null}
			{@const channelId = currentChannelId}
			<MessageList
				threadKey={channelThreadKey(channelId)}
				fetchPage={(before) => getChannelMessages(channelId, before)}
				readCache={() =>
					db.messages
						.where({ server_id: serversState.selectedServer?.id, channel_id: channelId })
						.sortBy('timestamp')}
				emptyDescription="Be the first to say something in this channel."
				errorDescription="There was a problem reading this channel."
			/>
		{/if}

		<TypingIndicator names={[]} />
		<Composer {target} />
	</div>

	{#if membersOpen}
		<UsersSidebar />
	{/if}
</div>
