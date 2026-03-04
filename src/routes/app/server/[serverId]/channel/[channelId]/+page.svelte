<script lang="ts">
	import { page } from '$app/state';
	import ChatInput from '$lib/components/ui/ChatInput.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Message from '$lib/components/ui/message/Message.svelte';
	import UsersSidebar from '$lib/components/ui/sidebar/UsersSidebar.svelte';
	import { messagesState } from '$lib/states/messagesState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { socketState } from '$lib/states/socketState.svelte';
	import { db } from '$lib/utils/db';
	import { tick } from 'svelte';

	let messageText: string = $state('');

	let messageWrapper: HTMLDivElement;

	const scrollToBottom = () => {
		if (messageWrapper) {
			messageWrapper.scrollTo({
				top: messageWrapper.scrollHeight
			});
		}
	};

	$effect(() => {
		if (!page.params.channelId) return;
		const channelId = parseInt(page.params.channelId);
		serversState.setSelectedChannelById(channelId);

		messagesState.clear();

		db.messages
			.where({
				server_id: serversState.selectedServer?.id,
				channel_id: channelId
			})
			.sortBy('timestamp')
			.then((messages) => {
				messagesState.set(messages);

				// Scroll after messages are loaded
				tick().then(() => {
					setTimeout(scrollToBottom, 100);
				});
			});
	});

	// Watch for new messages and scroll to bottom
	$effect(() => {
		if (messagesState.messages.length > 0) {
			tick().then(() => {
				// Add a small delay to ensure DOM and async content is rendered
				scrollToBottom();
			});
		}
	});
</script>

<div class="flex h-full w-full">
	<div class="flex flex-1 flex-col justify-end p-2">
		<div bind:this={messageWrapper} class="w-full flex-1 overflow-auto">
			{#each messagesState.messages as message}
				<Message {...message} />
			{/each}
		</div>
		<ChatInput />
	</div>
	<UsersSidebar />
</div>
