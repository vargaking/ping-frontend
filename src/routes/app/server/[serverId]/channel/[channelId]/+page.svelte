<script lang="ts">
	import { page } from '$app/stores';
	import Input from '$lib/components/ui/input/input.svelte';
	import Message from '$lib/components/ui/message/Message.svelte';
	import { MessageStore } from '$lib/stores/messageStore';
	import { SocketStore } from '$lib/stores/socketStore';
	import {
		CurrentChannelIdStore,
		CurrentServerIdStore
	} from '$lib/stores/userStore';
	import type { MessageType } from '$lib/types/messages.types';
	import { db } from '$lib/utils/db';
	import { onMount, tick } from 'svelte';

	let messageText: string = '';

	$: channelId = $page.params.channelId;

	const loadMessages = async (channelId: number, serverId: number) => {
		if (!channelId) return;

		MessageStore.set([]);

		await db.messages
			.where({
				server_id: serverId,
				channel_id: channelId
			})
			.sortBy('timestamp')

			.then((messages: MessageType[]) => {
				MessageStore.set(messages);
				// Scroll after messages are loaded
				tick().then(() => {
					setTimeout(scrollToBottom, 100);
				});
			});
	};

	$: if (channelId) {
		CurrentChannelIdStore.set(parseInt(channelId));

		if ($CurrentServerIdStore) {
			loadMessages(parseInt(channelId), $CurrentServerIdStore);
		}
	}

	let messageWrapper: HTMLDivElement;

	const scrollToBottom = () => {
		if (messageWrapper) {
			messageWrapper.scrollTo({
				top: messageWrapper.scrollHeight
			});
		}
	};

	// Watch for new messages and scroll to bottom
	$: if ($MessageStore.length > 0) {
		tick().then(() => {
			// Add a small delay to ensure DOM and async content is rendered
			scrollToBottom();
		});
	}
</script>

<div class="flex h-screen w-full flex-col justify-end p-2">
	<div bind:this={messageWrapper} class="w-full flex-1 overflow-auto">
		{#each $MessageStore as message}
			<Message {...message} />
		{/each}
	</div>
	<Input
		onkeydown={(e) => {
			if (e.key === 'Enter') {
				// Handle sending message
				$SocketStore.sendMessage(messageText);
				messageText = '';
			}
		}}
		bind:value={messageText}
		placeholder="Type your message here..."
		class="bg-input-border w-full  rounded-b-md px-4 py-2 text-primary outline-none focus:ring-2 focus:ring-accent"
	/>
</div>
