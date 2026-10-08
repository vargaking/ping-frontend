<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { v4 as uuidv4 } from 'uuid';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { forumState } from '$lib/states/forumState.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import { createForumPost } from '$lib/requests/forum/createForumPost';
	import { normalizeError } from '$lib/requests/errors';
	import type { MessageDraft } from '$lib/types/messages.types';
	import { POST_TITLE_MAX } from '$lib/types/forum.types';
	import { postPath } from '$lib/utils/channelRoutes';
	import Composer from '$lib/components/ui/message/Composer.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import ForumTagPicker from './ForumTagPicker.svelte';

	let { serverId, channelId }: { serverId: number; channelId: number } = $props();

	let title = $state('');
	let tagIds = $state<number[]>([]);
	let titleInput = $state<HTMLInputElement | null>(null);
	let titleError = $state('');
	let creating = false;

	const tags = $derived(forumState.tags(channelId));

	const failures: Record<string, string> = {
		invalid_content: "Couldn't send that message.",
		invalid_attachments: "Couldn't send the attachment. Try uploading it again.",
		invalid_reply: "Couldn't create the post."
	};

	function failureText(e: unknown): string {
		const { status, message } = normalizeError(e);
		if (status === 403) return "You can't post in this forum.";
		return failures[message] ?? message;
	}

	async function create(draft: MessageDraft): Promise<boolean> {
		const trimmed = title.trim();
		if (!trimmed) {
			titleError = 'Give your post a title.';
			titleInput?.focus();
			return false;
		}
		if (creating) return false;
		creating = true;
		try {
			const { post, message } = await createForumPost(channelId, {
				title: trimmed,
				tag_ids: tagIds,
				message: {
					id: uuidv4(),
					content: draft.content,
					timestamp: new Date().toISOString(),
					attachment_ids: draft.attachments.map((a) => a.id),
					embeds: draft.embeds
				}
			});
			forumState.addCreated(post, message.id);
			unreadState.noteChannelMessage(channelId, serverId, message.id, { mine: true });
			// Closing empties the overlay's props.
			const path = postPath(serverId, channelId, post.id);
			overlayState.close();
			await goto(path);
			return true;
		} catch (e) {
			toast.error(failureText(e));
			return false;
		} finally {
			creating = false;
		}
	}
</script>

<div class="flex w-[min(560px,90vw)] flex-col gap-4 bg-background p-6">
	<h2 class="text-base font-semibold text-foreground">New post</h2>

	<div class="flex flex-col gap-1.5">
		<label for="new-post-title" class="text-[13px] font-medium text-text-label">Title</label>
		<Input
			id="new-post-title"
			bind:ref={titleInput}
			bind:value={title}
			maxlength={POST_TITLE_MAX}
			placeholder="What's this about?"
			aria-invalid={titleError ? true : undefined}
			oninput={() => (titleError = '')}
			autofocus
		/>
		{#if titleError}
			<p class="text-xs text-destructive">{titleError}</p>
		{/if}
	</div>

	<ForumTagPicker {tags} bind:selected={tagIds} />

	<div class="flex flex-col gap-1.5">
		<span class="text-[13px] font-medium text-text-label">Message</span>
		<Composer
			compact
			target={{ kind: 'channel', serverId, channelId }}
			onSend={create}
			placeholder="Write the first message…"
		/>
	</div>
</div>
