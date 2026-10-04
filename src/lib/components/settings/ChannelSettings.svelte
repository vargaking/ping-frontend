<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { updateChannel, type ChannelUpdate } from '$lib/requests/channels/updateChannel';
	import { deleteChannel } from '$lib/requests/channels/deleteChannel';
	import { fieldErrorsFrom, getErrorMessage } from '$lib/requests/errors';
	import { channelRemoved } from '$lib/utils/channelRemoved';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import SettingsForm from './SettingsForm.svelte';
	import SettingsTextField from './SettingsTextField.svelte';
	import DangerZone from './DangerZone.svelte';
	import { Hash } from 'lucide-svelte';

	let { channelId }: { channelId: number } = $props();

	const channel = $derived(serversState.selectedServerChannels[channelId] ?? null);
	const savedName = $derived(channel?.name ?? '');
	const savedTopic = $derived(channel?.topic ?? '');
	const savedGroup = $derived(channel?.group_id == null ? '' : String(channel.group_id));
	const groups = $derived(serversState.selectedServerLayout.groups.map((g) => g.group));

	let name = $state('');
	let topic = $state('');
	let group = $state('');
	let errors = $state<{ name?: string; topic?: string }>({});
	let saving = $state(false);

	// What the fields were last synced from. While the form is clean, a change
	// to the channel (e.g. someone else renamed it) flows into the fields.
	let baseline = $state<{ name: string; topic: string; group: string } | null>(null);

	const dirty = $derived(
		baseline !== null &&
			(name !== baseline.name || topic !== baseline.topic || group !== baseline.group)
	);

	$effect(() => {
		const next = { name: savedName, topic: savedTopic, group: savedGroup };
		untrack(() => {
			if (
				baseline === null ||
				(name === baseline.name && topic === baseline.topic && group === baseline.group)
			) {
				name = next.name;
				topic = next.topic;
				group = next.group;
				baseline = next;
			}
		});
	});

	function reset() {
		name = savedName;
		topic = savedTopic;
		group = savedGroup;
		baseline = { name: savedName, topic: savedTopic, group: savedGroup };
		errors = {};
	}

	async function save() {
		const serverId = serversState.selectedServer?.id;
		if (!channel || serverId == null || !baseline) return;

		const trimmedName = name.trim();
		if (!trimmedName) {
			errors = { name: "Channel name can't be empty." };
			return;
		}

		const update: ChannelUpdate = {};
		if (name !== baseline.name) update.name = trimmedName;
		if (topic !== baseline.topic) update.topic = topic.trim() || null;
		if (group !== baseline.group) update.group_id = group === '' ? null : Number(group);

		errors = {};
		saving = true;
		try {
			const updated = await updateChannel(channel.id, update);
			serversState.updateChannel(serverId, updated);
			name = updated.name;
			topic = updated.topic ?? '';
			group = updated.group_id == null ? '' : String(updated.group_id);
			baseline = { name, topic, group };
			toast.success('Channel updated');
		} catch (e) {
			const message = getErrorMessage(e);
			const fields = fieldErrorsFrom(e);
			errors = {
				name: fields.name ?? ('name' in update && !fields.topic ? message : undefined),
				topic: fields.topic ?? ('topic' in update && !fields.name ? message : undefined)
			};
			toast.error(`Couldn't save channel: ${message}`);
		} finally {
			saving = false;
		}
	}

	async function remove() {
		const serverId = serversState.selectedServer?.id;
		if (!channel || serverId == null) return;
		// Captured up front: once the channel is gone, `channel` derives to null.
		const { id, name: deletedName } = channel;
		try {
			await deleteChannel(id);
		} catch (e) {
			toast.error(`Couldn't delete channel: ${getErrorMessage(e)}`);
			return;
		}
		overlayState.close();
		await channelRemoved(serverId, id, true);
		toast.success(`Deleted #${deletedName}`);
	}
</script>

{#if channel}
	<SettingsForm {dirty} {saving} onsave={save} onreset={reset}>
		<SettingsTextField
			id="channel-name"
			label="Channel name"
			bind:value={name}
			error={errors.name}
			oninput={() => (errors.name = undefined)}
			maxlength={100}
		/>

		<SettingsTextField
			id="channel-topic"
			label="Topic"
			bind:value={topic}
			error={errors.topic}
			oninput={() => (errors.topic = undefined)}
			hint="Shown in the channel header. Leave empty for none."
			maxlength={1024}
			placeholder="What's this channel about?"
			multiline
		/>

		<div class="flex max-w-md flex-col gap-1.5">
			<label for="channel-group" class="text-[13px] font-medium text-text-label">Category</label>
			<select
				id="channel-group"
				bind:value={group}
				class="h-11 w-full rounded-[10px] border border-input bg-surface-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			>
				<option value="">No category</option>
				{#each groups as g (g.id)}
					<option value={String(g.id)}>{g.name}</option>
				{/each}
			</select>
		</div>

		<div class="flex flex-col gap-1.5">
			<span class="text-[13px] font-medium text-text-label">Type</span>
			<p class="text-sm text-muted-foreground">
				{channel.type === 'voice'
					? 'Voice channel'
					: channel.type === 'forum'
						? 'Forum channel'
						: 'Text channel'}. A channel's type can't be changed.
			</p>
		</div>

		<DangerZone
			consequence="Deleting this channel removes it and all of its messages for everyone."
			actionLabel="Delete channel"
			confirmTitle="Delete #{channel.name}?"
			confirmDescription="This permanently deletes the channel and its message history. It can't be undone."
			onconfirm={remove}
		/>
	</SettingsForm>
{:else}
	<div class="p-7">
		<EmptyState title="Channel not found" description="It may have been deleted.">
			{#snippet icon()}
				<Hash size={20} strokeWidth={1.75} />
			{/snippet}
		</EmptyState>
	</div>
{/if}
