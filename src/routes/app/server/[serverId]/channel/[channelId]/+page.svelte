<script lang="ts">
	import { page } from '$app/state';
	import Composer from '$lib/components/ui/message/Composer.svelte';
	import ChannelHeader from '$lib/components/ui/message/ChannelHeader.svelte';
	import MessageList from '$lib/components/ui/message/MessageList.svelte';
	import TypingIndicator from '$lib/components/ui/message/TypingIndicator.svelte';
	import UsersSidebar from '$lib/components/ui/sidebar/UsersSidebar.svelte';
	import { membersPanelState } from '$lib/states/membersPanelState.svelte';
	import type { MessageTarget } from '$lib/types/messages.types';
	import { channelThreadKey } from '$lib/states/messagesState.svelte';
	import { typingState } from '$lib/states/typingState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { getChannelMessages } from '$lib/requests/channels/getChannelMessages';
	import { db } from '$lib/utils/db';
	import { goto } from '$app/navigation';
	import { channelPath } from '$lib/utils/channelRoutes';
	import { clearJumpParam, JUMP_PARAM } from '$lib/utils/openSearchResult';
	import { untrack } from 'svelte';

	const currentChannelId = $derived(page.params.channelId ? parseInt(page.params.channelId) : null);
	const serverId = $derived(page.params.serverId ? parseInt(page.params.serverId) : null);

	const target = $derived<MessageTarget | null>(
		serverId != null && currentChannelId != null
			? { kind: 'channel', serverId, channelId: currentChannelId }
			: null
	);

	$effect(() => {
		const channelId = currentChannelId;
		untrack(() => serversState.setSelectedChannelId(channelId));
	});

	const channel = $derived(
		currentChannelId != null
			? (serversState.selectedServerChannels[currentChannelId] ?? null)
			: null
	);
	const isText = $derived(channel == null || channel.type === 'text');

	$effect(() => {
		if (!channel || channel.type === 'text' || serverId == null) return;
		const path = channelPath(serverId, channel);
		untrack(() => goto(path, { replaceState: true }));
	});
</script>

<div class="flex h-full min-h-0">
	<div class="flex min-w-0 flex-1 flex-col">
		<ChannelHeader />

		{#if currentChannelId != null && isText}
			{@const channelId = currentChannelId}
			<MessageList
				threadKey={channelThreadKey(channelId)}
				{target}
				fetchPage={(before) => getChannelMessages(channelId, before)}
				readCache={() =>
					db.messages.where({ server_id: serverId, channel_id: channelId }).sortBy('timestamp')}
				emptyDescription="Be the first to say something in this channel."
				errorDescription="There was a problem reading this channel."
				jumpTo={page.url.searchParams.get(JUMP_PARAM)}
				onJumped={() => clearJumpParam(page.url)}
			/>
		{/if}

		<TypingIndicator
			names={currentChannelId != null ? typingState.names(channelThreadKey(currentChannelId)) : []}
		/>
		<Composer {target} />
	</div>

	{#if membersPanelState.open}
		<UsersSidebar />
	{/if}
</div>
