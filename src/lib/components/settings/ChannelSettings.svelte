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

	let name = $state('');
	let topic = $state('');
	let errors = $state<{ name?: string; topic?: string }>({});
	let saving = $state(false);

	// What the fields were last synced from. While the form is clean, a change
	// to the channel (e.g. someone else renamed it) flows into the fields.
	let baseline = $state<{ name: string; topic: string } | null>(null);

	const dirty = $derived(baseline !== null && (name !== baseline.name || topic !== baseline.topic));

	$effect(() => {
		const next = { name: savedName, topic: savedTopic };
		untrack(() => {
			if (baseline === null || (name === baseline.name && topic === baseline.topic)) {
				name = next.name;
				topic = next.topic;
				baseline = next;
			}
		});
	});

	function reset() {
		name = savedName;
		topic = savedTopic;
		baseline = { name: savedName, topic: savedTopic };
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

		errors = {};
		saving = true;
		try {
			const updated = await updateChannel(channel.id, update);
			serversState.updateChannel(serverId, updated);
			name = updated.name;
			topic = updated.topic ?? '';
			baseline = { name, topic };
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
			maxlength={100}
		/>

		<SettingsTextField
			id="channel-topic"
			label="Topic"
			bind:value={topic}
			error={errors.topic}
			hint="Shown in the channel header. Leave empty for none."
			maxlength={1024}
			placeholder="What's this channel about?"
			multiline
		/>

		<div class="flex flex-col gap-1.5">
			<span class="text-[13px] font-medium text-text-label">Type</span>
			<p class="text-sm text-muted-foreground">
				{channel.type === 'voice' ? 'Voice channel' : 'Text channel'}. A channel's type can't be
				changed.
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
