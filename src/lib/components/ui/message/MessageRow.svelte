<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import type { MessageType } from '$lib/types/messages.types';
	import MessageNode from './MessageNode.svelte';
	import MessageEditor from './MessageEditor.svelte';
	import MessageAttachments from './MessageAttachments.svelte';
	import LinkEmbed from './LinkEmbed.svelte';
	import MessageReactions from './MessageReactions.svelte';
	import ReactionPicker from './ReactionPicker.svelte';
	import ActionContextMenu from '$lib/components/ui/context-menu/ActionContextMenu.svelte';
	import { messagesState, messageThreadKey } from '$lib/states/messagesState.svelte';
	import { conversationsState } from '$lib/states/conversationsState.svelte';
	import { messageEditState } from '$lib/states/messageEditState.svelte';
	import { replyState } from '$lib/states/replyState.svelte';
	import { editMessage } from '$lib/requests/messages/editMessage';
	import { db } from '$lib/utils/db';
	import { refreshReplyQuotes } from '$lib/utils/replies';
	import { mentionCandidates } from '$lib/utils/mentions';
	import { messagePlainText, parseMessageContent } from '$lib/utils/messageContent';
	import {
		canDeleteMessage,
		canEditMessage,
		messageActions,
		promptDeleteMessage
	} from '$lib/utils/menuActions';
	import { Pencil, Reply, SmilePlus, Trash2 } from 'lucide-svelte';

	// The first row in a group already shows the timestamp in the group header,
	// so the hover-gutter time is only rendered on continuation rows.
	let { message, showHoverTime = true }: { message: MessageType; showHoverTime?: boolean } =
		$props();

	const parsedContent = $derived(parseMessageContent(message.content));

	const attachments = $derived(message.attachments ?? []);
	const embeds = $derived(message.embeds ?? []);
	const hasText = $derived(messagePlainText(message.content) !== '');

	const hoverTime = $derived(
		new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
	);

	const canEdit = $derived(canEditMessage(message));
	const canDelete = $derived(canDeleteMessage(message));
	let pickerOpen = $state(false);
	const editing = $derived(messageEditState.isEditing(message.id));
	const actions = $derived(messageActions(message, { onReact: () => (pickerOpen = true) }));

	async function saveEdit(content: JSONContent) {
		try {
			const updated = await editMessage(message.id, content);
			const changes = { content: updated.content, edited_at: updated.edited_at };
			messagesState.updateMessage(message.id, changes);
			conversationsState.messageEdited(message.id, changes);
			await db.messages.update(message.id, changes);
			await refreshReplyQuotes(updated);
			messageEditState.stop();
		} catch (e) {
			// Keep the editor open so the edit isn't lost.
			console.error('Failed to edit message', e);
		}
	}
</script>

<ActionContextMenu {actions}>
	{#snippet children(menuProps)}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<!-- Focusable so Shift+F10 can open the row's menu. -->
		<div
			{...menuProps}
			class="group/row relative rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			tabindex="0"
			data-message-id={message.id}
		>
			{#if editing}
				<div class="max-w-[760px] rounded-lg border border-input bg-surface-input px-3 py-1.5">
					<MessageEditor
						content={parsedContent}
						autofocus
						allowEmpty={attachments.length > 0}
						mentionCandidates={() =>
							mentionCandidates({
								serverId: message.server_id,
								conversationId: message.conversation_id
							})}
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
						class="pointer-events-none absolute top-0.5 right-full hidden pr-2 font-mono text-[11px] whitespace-nowrap text-text-subtle select-none group-hover/row:block"
						aria-hidden="true"
					>
						{hoverTime}
					</span>
				{/if}

				<div
					class="absolute -top-3 right-0 items-center gap-0.5 rounded-md border border-border bg-surface-input p-0.5 shadow-sm group-hover/row:flex {pickerOpen
						? 'flex'
						: 'hidden'}"
				>
					<ReactionPicker {message} bind:open={pickerOpen}>
						{#snippet trigger(props)}
							<button
								{...props}
								type="button"
								aria-label="Add reaction"
								class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
							>
								<SmilePlus size={15} strokeWidth={1.75} />
							</button>
						{/snippet}
					</ReactionPicker>
					<button
						type="button"
						aria-label="Reply"
						onclick={() => replyState.start(messageThreadKey(message), message)}
						class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<Reply size={16} strokeWidth={1.75} />
					</button>
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
							onclick={() => promptDeleteMessage(message.id)}
							class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							<Trash2 size={15} strokeWidth={1.75} />
						</button>
					{/if}
				</div>

				{#if hasText || attachments.length === 0}
					<!-- No whitespace after MessageNode: under pre-wrap it renders as an extra line. -->
					<div
						class="prose prose-sm max-w-[760px] text-[15px] leading-[1.55] break-words whitespace-pre-wrap text-text-body prose-invert {message.edited_at
							? '[&>p:nth-last-child(2)]:inline'
							: ''}"
					>
						<MessageNode node={parsedContent} />{#if message.edited_at}<span
								class="ml-1 align-baseline text-[11px] text-text-subtle select-none">(edited)</span
							>{/if}
					</div>
				{/if}
				{#if attachments.length > 0}
					<div class={hasText ? 'mt-1.5' : ''}>
						<MessageAttachments {attachments} />
					</div>
					{#if !hasText && message.edited_at}
						<span class="text-[11px] text-text-subtle select-none">(edited)</span>
					{/if}
				{/if}
				{#each embeds as embed (embed.url)}
					<div class="mt-1.5">
						<LinkEmbed {embed} />
					</div>
				{/each}
				<MessageReactions {message} />
			{/if}
		</div>
	{/snippet}
</ActionContextMenu>
