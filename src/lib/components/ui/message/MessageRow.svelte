<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import type { MessageType } from '$lib/types/messages.types';
	import MessageNode from './MessageNode.svelte';
	import MessageEditor from './MessageEditor.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { messagesState } from '$lib/states/messagesState.svelte';
	import { messageEditState } from '$lib/states/messageEditState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { editMessage } from '$lib/requests/messages/editMessage';
	import { deleteMessage } from '$lib/requests/messages/deleteMessage';
	import { db } from '$lib/utils/db';
	import { parseMessageContent } from '$lib/utils/messageContent';
	import { Pencil, Trash2 } from 'lucide-svelte';

	// The first row in a group already shows the timestamp in the group header,
	// so the hover-gutter time is only rendered on continuation rows.
	let { message, showHoverTime = true }: { message: MessageType; showHoverTime?: boolean } =
		$props();

	const parsedContent = $derived(parseMessageContent(message.content));

	const hoverTime = $derived(
		new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
	);

	const me = $derived(usersState.loggedInUser);
	const isAuthor = $derived(me != null && me.id === message.user_id);
	const isOwner = $derived(me != null && serversState.selectedServer?.owner_id === me.id);
	// Edit/delete only exist for server channels on the backend so far, so DM
	// rows stay read-only.
	const isDirect = $derived(message.conversation_id != null);
	const canEdit = $derived(isAuthor && !isDirect);
	const canDelete = $derived((isAuthor || isOwner) && !isDirect);
	const editing = $derived(messageEditState.isEditing(message.id));

	async function saveEdit(content: JSONContent) {
		try {
			const updated = await editMessage(message.id, content);
			messagesState.updateMessage(message.id, {
				content: updated.content,
				edited_at: updated.edited_at
			});
			await db.messages.update(message.id, {
				content: updated.content,
				edited_at: updated.edited_at
			});
			messageEditState.stop();
		} catch (e) {
			// Keep the editor open so the edit isn't lost.
			console.error('Failed to edit message', e);
		}
	}

	function promptDelete() {
		overlayState.open(ConfirmDialog, {
			title: 'Delete message',
			description: 'This removes the message for everyone. This can’t be undone.',
			confirmLabel: 'Delete',
			destructive: true,
			onConfirm: async () => {
				try {
					await deleteMessage(message.id);
					messagesState.removeMessage(message.id);
					await db.messages.delete(message.id);
				} catch (e) {
					console.error('Failed to delete message', e);
				}
			}
		});
	}
</script>

<div class="group/row relative">
	{#if editing}
		<div class="max-w-[760px] rounded-lg border border-input bg-surface-input px-3 py-1.5">
			<MessageEditor
				content={parsedContent}
				autofocus
				onSubmit={saveEdit}
				onCancel={() => messageEditState.stop()}
				editorClass="prose prose-sm max-w-none text-[15px] leading-[1.55] break-words whitespace-pre-wrap text-foreground prose-invert outline-none prose-headings:my-1 prose-p:my-0 prose-ol:my-1 prose-ul:my-1 prose-li:my-0"
			/>
			<div class="mt-1 text-[11px] text-text-subtle">
				escape to
				<button
					type="button"
					class="underline hover:text-text-body"
					onclick={() => messageEditState.stop()}>cancel</button
				>
				· enter to save
			</div>
		</div>
	{:else}
		{#if showHoverTime}
			<span
				class="pointer-events-none absolute top-0.5 -left-12 hidden w-11 pr-2 text-right font-mono text-[11px] text-text-subtle select-none group-hover/row:block"
				aria-hidden="true"
			>
				{hoverTime}
			</span>
		{/if}

		{#if canEdit || canDelete}
			<div
				class="absolute -top-3 right-0 hidden items-center gap-0.5 rounded-md border border-border bg-surface-input p-0.5 shadow-sm group-hover/row:flex"
			>
				{#if canEdit}
					<button
						type="button"
						aria-label="Edit message"
						onclick={() => messageEditState.start(message.id)}
						class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<Pencil size={15} strokeWidth={1.75} />
					</button>
				{/if}
				{#if canDelete}
					<button
						type="button"
						aria-label="Delete message"
						onclick={promptDelete}
						class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<Trash2 size={15} strokeWidth={1.75} />
					</button>
				{/if}
			</div>
		{/if}

		<div
			class="prose prose-sm max-w-[760px] text-[15px] leading-[1.55] break-words whitespace-pre-wrap text-text-body prose-invert"
		>
			<MessageNode node={parsedContent} />
			{#if message.edited_at}
				<span class="align-baseline text-[11px] text-text-subtle select-none">(edited)</span>
			{/if}
		</div>
	{/if}
</div>
