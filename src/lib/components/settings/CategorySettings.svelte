<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { serversState } from '$lib/states/serversState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { renameChannelGroup } from '$lib/requests/channels/renameChannelGroup';
	import { getErrorMessage } from '$lib/requests/errors';
	import { deleteGroup } from '$lib/utils/channelGroups';
	import SettingsForm from './SettingsForm.svelte';
	import SettingsTextField from './SettingsTextField.svelte';
	import DangerZone from './DangerZone.svelte';

	let { groupId }: { groupId: number } = $props();

	const group = $derived(
		serversState.selectedServerLayout.groups.find((g) => g.group.id === groupId)?.group ?? null
	);
	const savedName = $derived(group?.name ?? '');

	let name = $state('');
	let error = $state<string | undefined>();
	let saving = $state(false);
	let baseline = $state<string | null>(null);
	const dirty = $derived(baseline !== null && name !== baseline);

	$effect(() => {
		const next = savedName;
		untrack(() => {
			if (baseline === null || name === baseline) {
				name = next;
				baseline = next;
			}
		});
	});

	function reset() {
		name = savedName;
		baseline = savedName;
		error = undefined;
	}

	async function save() {
		if (!group) return;
		const trimmed = name.trim();
		if (!trimmed) {
			error = "Category name can't be empty.";
			return;
		}
		saving = true;
		try {
			const updated = await renameChannelGroup(group.server_id, group.id, trimmed);
			serversState.updateGroup(group.server_id, updated);
			name = updated.name;
			baseline = updated.name;
			toast.success('Category updated');
		} catch (e) {
			error = getErrorMessage(e);
		} finally {
			saving = false;
		}
	}
</script>

{#if group}
	<SettingsForm {dirty} {saving} onsave={save} onreset={reset}>
		<SettingsTextField
			id="category-name"
			label="Category name"
			bind:value={name}
			{error}
			oninput={() => (error = undefined)}
			maxlength={100}
		/>
		<DangerZone
			consequence="Deleting this category moves its channels to the top of the list. No channels or messages are deleted."
			actionLabel="Delete category"
			confirmTitle="Delete {group.name}?"
			confirmDescription="Its channels move to the top of the list and lose the category's permissions."
			onconfirm={async () => {
				await deleteGroup(group);
				overlayState.close();
			}}
		/>
	</SettingsForm>
{/if}
