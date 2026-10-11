<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { forumState } from '$lib/states/forumState.svelte';
	import { createForumTag } from '$lib/requests/forum/createForumTag';
	import { getErrorMessage } from '$lib/requests/errors';
	import { TAG_NAME_MAX, TAGS_PER_CHANNEL_MAX, type ForumTag } from '$lib/types/forum.types';
	import { TAG_COLORS } from '$lib/utils/forum';
	import Input from '$lib/components/ui/input/input.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ForumTagColors from '$lib/components/forum/ForumTagColors.svelte';
	import { Plus } from 'lucide-svelte';

	let { channelId, onadded }: { channelId: number; onadded?: () => void } = $props();

	const atLimit = $derived(forumState.tags(channelId).length >= TAGS_PER_CHANNEL_MAX);

	let newName = $state('');
	let newColor = $state<string | null>(TAG_COLORS[0]);
	let adding = $state(false);

	async function add() {
		const name = newName.trim();
		if (!name || adding || atLimit) return;
		adding = true;
		newName = '';
		let tag: ForumTag;
		try {
			tag = await createForumTag(channelId, name, newColor);
		} catch (e) {
			toast.error(`Couldn't add the tag: ${getErrorMessage(e)}`);
			newName ||= name;
			return;
		} finally {
			adding = false;
		}
		forumState.applyTags(channelId, [
			...forumState.tags(channelId).filter((t) => t.id !== tag.id),
			tag
		]);
		onadded?.();
	}
</script>

<div class="flex flex-col gap-2">
	<form
		class="flex flex-wrap items-center gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			add();
		}}
	>
		<Input
			aria-label="New tag name"
			placeholder="New tag"
			bind:value={newName}
			maxlength={TAG_NAME_MAX}
			disabled={atLimit}
			class="h-9 min-w-[140px] flex-1"
		/>
		<ForumTagColors
			selected={newColor}
			pick={(color) => (newColor = color)}
			label="New tag color"
		/>
		<Button type="submit" disabled={!newName.trim() || adding || atLimit}>
			<Plus size={16} strokeWidth={1.75} />
			Add
		</Button>
	</form>
	{#if atLimit}
		<p class="text-xs text-text-subtle">A forum can have up to {TAGS_PER_CHANNEL_MAX} tags.</p>
	{/if}
</div>
