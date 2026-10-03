<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { createChannel } from '$lib/requests/channels/createChannel';
	import { getErrorMessage } from '$lib/requests/errors';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Input from '$lib/components/ui/input/input.svelte';
	import Button from '$lib/components/ui/button/button.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let channelName = $state('');
	let channelType: 'text' | 'voice' = $state('text');
	let creating = $state(false);

	async function submit() {
		const serverId = serversState.selectedServer?.id;
		if (!serverId || !channelName.trim() || creating) return;
		creating = true;
		try {
			const channel = await createChannel(serverId, channelName.trim(), channelType);
			serversState.addChannel(serverId, channel);
			channelName = '';
			channelType = 'text';
			open = false;
			const route = channel.type === 'text' ? 'channel' : 'voice';
			await goto(`/app/server/${serverId}/${route}/${channel.id}/`);
		} catch (e) {
			toast.error(`Couldn't create channel: ${getErrorMessage(e)}`);
		} finally {
			creating = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>Create a channel</Dialog.Title></Dialog.Header>
		<div class="flex flex-col gap-4 py-2">
			<Input placeholder="Channel name" maxlength={100} bind:value={channelName} />
			<div class="flex gap-4">
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input
						type="radio"
						name="channelType"
						value="text"
						checked={channelType === 'text'}
						onchange={() => (channelType = 'text')}
						class="accent-primary"
					/>
					Text
				</label>
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input
						type="radio"
						name="channelType"
						value="voice"
						checked={channelType === 'voice'}
						onchange={() => (channelType = 'voice')}
						class="accent-primary"
					/>
					Voice
				</label>
			</div>
		</div>
		<Dialog.Footer>
			<Button onclick={submit} disabled={!channelName.trim() || creating}>
				{creating ? 'Creating…' : 'Create'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
