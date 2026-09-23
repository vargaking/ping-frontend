<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Composer from '$lib/components/ui/message/Composer.svelte';
	import DirectHeader from '$lib/components/ui/message/DirectHeader.svelte';
	import MessageList from '$lib/components/ui/message/MessageList.svelte';
	import TypingIndicator from '$lib/components/ui/message/TypingIndicator.svelte';
	import type { MessageTarget } from '$lib/types/messages.types';
	import { directThreadKey } from '$lib/states/messagesState.svelte';
	import { conversationsState } from '$lib/states/conversationsState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { getConversationMessages } from '$lib/requests/conversations/getConversationMessages';
	import { db } from '$lib/utils/db';

	const conversationId = $derived.by(() => {
		const id = parseInt(page.params.conversationId ?? '');
		return Number.isNaN(id) ? null : id;
	});

	const conversation = $derived(
		conversationId != null ? conversationsState.conversations[conversationId] : undefined
	);
	const otherUser = $derived(
		conversation ? (usersState.users[conversation.other_user.id] ?? conversation.other_user) : null
	);

	const target = $derived<MessageTarget | null>(
		conversationId != null ? { kind: 'direct', conversationId } : null
	);

	// Missing or not ours: forget it and fall back silently to the DM home.
	function fallBack() {
		if (conversationId != null) conversationsState.forget(conversationId);
		else conversationsState.setLastActive(null);
		goto('/app/direct/', { replaceState: true });
	}

	$effect(() => {
		if (conversationId == null) fallBack();
		else conversationsState.setLastActive(conversationId);
	});
</script>

<div class="flex h-full min-h-0 flex-col">
	<DirectHeader user={otherUser} />

	{#if conversationId != null}
		{@const id = conversationId}
		<MessageList
			threadKey={directThreadKey(id)}
			fetchPage={(before) => getConversationMessages(id, before)}
			readCache={() => db.messages.where({ conversation_id: id }).sortBy('timestamp')}
			emptyDescription="Send the first message."
			errorDescription="There was a problem reading this conversation."
			onNotFound={fallBack}
		/>
	{/if}

	<TypingIndicator names={[]} />
	<Composer {target} />
</div>
