<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { forumState } from '$lib/states/forumState.svelte';
	import { updateForumPost } from '$lib/requests/forum/updateForumPost';
	import { getErrorMessage } from '$lib/requests/errors';
	import { POST_TITLE_MAX, type ForumPost, type ForumPostUpdate } from '$lib/types/forum.types';
	import Input from '$lib/components/ui/input/input.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ForumTagPicker from './ForumTagPicker.svelte';

	let { post }: { post: ForumPost } = $props();

	const knownTags = $derived(forumState.tags(post.channel_id));
	const original = $derived(post.tag_ids.filter((id) => knownTags.some((t) => t.id === id)));

	let title = $state(post.title);
	let tagIds = $state<number[]>(
		post.tag_ids.filter((id) => forumState.tags(post.channel_id).some((t) => t.id === id))
	);
	let saving = $state(false);

	const changed = $derived(
		title.trim() !== post.title ||
			tagIds.length !== original.length ||
			tagIds.some((id) => !original.includes(id))
	);

	async function save() {
		const trimmed = title.trim();
		if (!trimmed || saving || !changed) return;
		const update: ForumPostUpdate = {};
		if (trimmed !== post.title) update.title = trimmed;
		update.tag_ids = tagIds;
		saving = true;
		try {
			forumState.applyPost(await updateForumPost(post.id, update));
			overlayState.close();
		} catch (e) {
			toast.error(`Couldn't save the post: ${getErrorMessage(e)}`);
		} finally {
			saving = false;
		}
	}
</script>

<form
	class="flex w-[min(480px,90vw)] flex-col gap-4 bg-background p-6"
	onsubmit={(e) => {
		e.preventDefault();
		save();
	}}
>
	<h2 class="text-base font-semibold text-foreground">Edit post</h2>

	<div class="flex flex-col gap-1.5">
		<label for="edit-post-title" class="text-[13px] font-medium text-text-label">Title</label>
		<Input id="edit-post-title" bind:value={title} maxlength={POST_TITLE_MAX} autofocus />
	</div>

	<ForumTagPicker tags={knownTags} bind:selected={tagIds} />

	<div class="flex justify-end gap-2">
		<Button type="button" variant="ghost" onclick={() => overlayState.close()}>Cancel</Button>
		<Button type="submit" disabled={!title.trim() || !changed || saving}>
			{saving ? 'Saving…' : 'Save'}
		</Button>
	</div>
</form>
