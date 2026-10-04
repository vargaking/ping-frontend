<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { createChannel } from '$lib/requests/channels/createChannel';
	import { getErrorMessage } from '$lib/requests/errors';
	import * as Dialog from '$lib/components/ui/dialog/index';
	import Input from '$lib/components/ui/input/input.svelte';
	import Button from '$lib/components/ui/button/button.svelte';

	let {
		open = $bindable(false),
		groupId
	}: {
		open?: boolean;
		/** Category to preselect; left out, the first category is used if there is one. */
		groupId?: number | null;
	} = $props();

	let channelName = $state('');
	let channelType: 'text' | 'voice' = $state('text');
	let creating = $state(false);
	let selectedGroup = $state('');

	const groups = $derived(serversState.selectedServerLayout.groups.map((g) => g.group));

	$effect(() => {
		if (!open) return;
		untrack(() => {
			const id = groupId === undefined ? (groups[0]?.id ?? null) : groupId;
			selectedGroup = id == null ? '' : String(id);
		});
	});

	async function submit() {
		const serverId = serversState.selectedServer?.id;
		if (!serverId || !channelName.trim() || creating) return;
		creating = true;
		try {
			const channel = await createChannel(
				serverId,
				channelName.trim(),
				channelType,
				selectedGroup === '' ? null : Number(selectedGroup)
			);
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
			<div class="flex flex-col gap-1.5">
				<label for="create-channel-group" class="text-[13px] font-medium text-text-label">
					Category
				</label>
				<select
					id="create-channel-group"
					bind:value={selectedGroup}
					class="h-11 w-full rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					<option value="">No category</option>
					{#each groups as group (group.id)}
						<option value={String(group.id)}>{group.name}</option>
					{/each}
				</select>
			</div>
		</div>
		<Dialog.Footer>
			<Button onclick={submit} disabled={!channelName.trim() || creating}>
				{creating ? 'Creating…' : 'Create'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
