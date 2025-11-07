<script lang="ts">
	import { page } from '$app/stores';
	import Input from '$lib/components/ui/input/input.svelte';
	import Message from '$lib/components/ui/message/Message.svelte';
	import { getUserChannels } from '$lib/requests/channels/getUserChannels';
	import { getUserServers } from '$lib/requests/servers/getUserServers';
	import { UserChannelsStore } from '$lib/stores/channelsStore';
	import { MessageStore } from '$lib/stores/messageStore';
	import { SocketStore } from '$lib/stores/socketStore';
	import {
		CurrentChannelIdStore,
		CurrentChannelStore,
		CurrentServerStore,
		UserInitedStore,
		UserServersStore,
		UserStore
	} from '$lib/stores/userStore';
	import type { MessageType } from '$lib/types/messages.types';
	import { db } from '$lib/utils/db';
	import { onMount, tick } from 'svelte';

	let messageText: string = '';

	onMount(() => {
		const unsubscribers = [];
		console.log('Mounting channel page');

		const { slug } = $page.params;

		if (!slug) return;

		CurrentChannelIdStore.set(parseInt(slug));

		unsubscribers.push(
			UserInitedStore.subscribe((inited) => {
				if (inited) {
					// preload user data
					// Fetch user servers
					unsubscribers.push(
						CurrentServerStore.subscribe((server) => {
							if (!server) return;

							getUserChannels(server.id).then((channels) => {
								UserChannelsStore.set(channels);

								console.log('Fetched user channels:', channels, $CurrentChannelIdStore);

								const currentChannel = channels.find((channel) => channel.id === parseInt(slug));

								if (!currentChannel) {
									console.error('Current channel not found');
									return;
								}

								CurrentChannelStore.set(currentChannel);

								loadMessages(currentChannel.id, server.id);
							});
						})
					);
				}
			}),
			CurrentChannelIdStore.subscribe((channelId) => {
				const server = $CurrentServerStore;

				if (server && channelId) {
					loadMessages(channelId, server.id);
				}
			})
		);
		return () => {
			unsubscribers.forEach((unsub) => unsub());
		};
	});

	let messageWrapper: HTMLDivElement;

	const scrollToBottom = () => {
		if (messageWrapper) {
			messageWrapper.scrollTo({
				top: messageWrapper.scrollHeight
			});
		}
	};

	const loadMessages = async (channelId: number, serverId: number) => {
		if (!$page.params.slug) return;

		await db.messages
			.where({
				server_id: serverId,
				channel_id: channelId
			})
			.toArray()
			.then((messages: MessageType[]) => {
				MessageStore.set(messages);
				// Scroll after messages are loaded
				tick().then(() => {
					setTimeout(scrollToBottom, 100);
				});
			});
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
