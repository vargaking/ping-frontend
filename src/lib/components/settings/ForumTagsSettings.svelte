<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { forumState } from '$lib/states/forumState.svelte';
	import { updateForumTag, type ForumTagUpdate } from '$lib/requests/forum/updateForumTag';
	import { deleteForumTag } from '$lib/requests/forum/deleteForumTag';
	import { reorderForumTags } from '$lib/requests/forum/reorderForumTags';
	import { getErrorMessage } from '$lib/requests/errors';
	import { TAG_NAME_MAX, type ForumTag } from '$lib/types/forum.types';
	import Input from '$lib/components/ui/input/input.svelte';
	import ForumTagColors from '$lib/components/forum/ForumTagColors.svelte';
	import NewTagForm from '$lib/components/forum/NewTagForm.svelte';
	import { ArrowDown, ArrowUp, Trash2 } from 'lucide-svelte';

	let { channelId }: { channelId: number } = $props();

	const tags = $derived(forumState.tags(channelId));

	$effect(() => {
		void forumState.loadTags(channelId);
	});

	async function run<T>(failure: string, work: () => Promise<T>): Promise<T | undefined> {
		try {
			return await work();
		} catch (e) {
			toast.error(`${failure}: ${getErrorMessage(e)}`);
			return undefined;
		}
	}

	async function change(tag: ForumTag, update: ForumTagUpdate) {
		const updated = await run("Couldn't update the tag", () =>
			updateForumTag(channelId, tag.id, update)
		);
		if (!updated) return false;
		forumState.applyTags(
			channelId,
			forumState.tags(channelId).map((t) => (t.id === updated.id ? updated : t))
		);
		return true;
	}

	async function rename(tag: ForumTag, input: HTMLInputElement) {
		const name = input.value.trim();
		if (name === tag.name) return;
		if (!name || !(await change(tag, { name }))) input.value = tag.name;
	}

	async function remove(tag: ForumTag) {
		try {
			await deleteForumTag(channelId, tag.id);
		} catch (e) {
			toast.error(`Couldn't delete the tag: ${getErrorMessage(e)}`);
			return;
		}
		forumState.applyTags(
			channelId,
			forumState.tags(channelId).filter((t) => t.id !== tag.id)
		);
	}

	async function move(index: number, by: -1 | 1) {
		const ids = tags.map((t) => t.id);
		const to = index + by;
		if (to < 0 || to >= ids.length) return;
		[ids[index], ids[to]] = [ids[to], ids[index]];
		const ordered = await run("Couldn't reorder the tags", () => reorderForumTags(channelId, ids));
		if (ordered) forumState.applyTags(channelId, ordered);
	}
</script>

<div class="flex max-w-xl flex-col gap-6">
	<p class="text-sm text-muted-foreground">
		Tags sort the posts in this forum. Members can add up to 5 to a post, and filter by them.
	</p>

	{#if tags.length > 0}
		<ul class="flex flex-col gap-2">
			{#each tags as tag, i (tag.id)}
				<li class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
					<Input
						aria-label="Tag name"
						value={tag.name}
						maxlength={TAG_NAME_MAX}
						class="h-8 min-w-[140px] flex-1"
						onblur={(e) => rename(tag, e.currentTarget)}
						onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
					/>
					<ForumTagColors
						selected={tag.color}
						pick={(color) => change(tag, { color })}
						label="Color of {tag.name}"
					/>
					<div class="flex items-center">
						<button
							type="button"
							aria-label="Move {tag.name} up"
							disabled={i === 0}
							onclick={() => move(i, -1)}
							class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-30 pointer-coarse:h-10 pointer-coarse:w-10"
						>
							<ArrowUp size={16} strokeWidth={1.75} />
						</button>
						<button
							type="button"
							aria-label="Move {tag.name} down"
							disabled={i === tags.length - 1}
							onclick={() => move(i, 1)}
							class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-30 pointer-coarse:h-10 pointer-coarse:w-10"
						>
							<ArrowDown size={16} strokeWidth={1.75} />
						</button>
						<button
							type="button"
							aria-label="Delete {tag.name}"
							onclick={() => remove(tag)}
							class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-10 pointer-coarse:w-10"
						>
							<Trash2 size={16} strokeWidth={1.75} />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-text-subtle">No tags yet.</p>
	{/if}

	<NewTagForm {channelId} />
</div>
