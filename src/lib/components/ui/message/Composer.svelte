<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import { onDestroy, untrack } from 'svelte';
	import axios from 'axios';
	import { toast } from 'svelte-sonner';
	import type { MessageDraft, MessageTarget } from '$lib/types/messages.types';
	import type { Attachment } from '$lib/types/attachment.types';
	import { socketState } from '$lib/states/socketState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { messagesState, threadKey } from '$lib/states/messagesState.svelte';
	import { messageEditState } from '$lib/states/messageEditState.svelte';
	import { replyState } from '$lib/states/replyState.svelte';
	import {
		MAX_ATTACHMENTS_PER_MESSAGE,
		MAX_ATTACHMENT_BYTES,
		formatBytes,
		uploadAttachment
	} from '$lib/requests/attachments/uploadAttachment';
	import { getErrorMessage } from '$lib/requests/errors';
	import { LinkPreview } from '$lib/utils/linkPreview.svelte';
	import { mentionCandidates } from '$lib/utils/mentions';
	import { messagePlainText, messagePreviewText } from '$lib/utils/messageContent';
	import LinkEmbed from './LinkEmbed.svelte';
	import * as Popover from '$lib/components/ui/popover/index';
	import EmojiPicker from '$lib/components/ui/emoji/EmojiPicker.svelte';
	import MessageEditor from './MessageEditor.svelte';
	import { File as FileIcon, Paperclip, Smile, SendHorizontal, X } from 'lucide-svelte';

	type PendingItem = {
		localId: string;
		file: File;
		status: 'uploading' | 'done' | 'error';
		progress: number;
		attachment?: Attachment;
		error?: string;
		previewUrl?: string;
	};

	let {
		target,
		onSend,
		compact = false,
		placeholder
	}: {
		target: MessageTarget | null;
		/** Takes the draft instead of sending it to the thread; false keeps it in the composer. */
		onSend?: (draft: MessageDraft) => boolean | Promise<boolean>;
		/** Drops the page padding, for use inside a dialog. */
		compact?: boolean;
		placeholder?: string;
	} = $props();

	let editor = $state<ReturnType<typeof MessageEditor>>();
	let isEmpty = $state(true);
	let fileInput = $state<HTMLInputElement>();
	let pending = $state<PendingItem[]>([]);
	let dragging = $state(false);
	let dragDepth = 0;
	let emojiOpen = $state(false);
	let closedByEscape = false;

	const privateChannelId = $derived(
		target?.kind === 'channel' &&
			serversState.channels[target.serverId]?.[target.channelId]?.private
			? target.channelId
			: null
	);

	$effect(() => {
		const channelId = privateChannelId;
		if (channelId != null) untrack(() => serversState.loadChannelViewers(channelId));
	});

	const controllers: Record<string, AbortController> = {};
	const linkPreview = new LinkPreview();

	const doneAttachments = $derived(
		pending.flatMap((p) => (p.status === 'done' && p.attachment ? [p.attachment] : []))
	);
	const uploading = $derived(pending.some((p) => p.status === 'uploading'));
	const failed = $derived(pending.some((p) => p.status === 'error'));
	const canSend = $derived(
		target != null && (!isEmpty || doneAttachments.length > 0) && !uploading && !failed
	);

	const targetKey = $derived(target ? threadKey(target) : null);

	const replyTarget = $derived(targetKey ? replyState.target[targetKey] : undefined);
	const replyAuthor = $derived(
		replyTarget ? (usersState.users[replyTarget.user_id]?.username ?? 'someone') : ''
	);

	function cancelReply() {
		if (targetKey) replyState.cancel(targetKey);
		editor?.focus();
	}

	let lastFocusRequest = replyState.focusRequest;
	$effect(() => {
		const request = replyState.focusRequest;
		if (request === lastFocusRequest) return;
		lastFocusRequest = request;
		untrack(() => editor?.focus());
	});

	let lastTargetKey: string | null | undefined;
	$effect(() => {
		if (targetKey === lastTargetKey) return;
		lastTargetKey = targetKey;
		untrack(clearPending);
		untrack(() => linkPreview.reset());
	});

	onDestroy(() => {
		clearPending();
		linkPreview.reset();
	});

	function clearPending() {
		for (const id of Object.keys(controllers)) {
			controllers[id].abort();
			delete controllers[id];
		}
		for (const item of pending) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
		pending = [];
	}

	function removePending(localId: string) {
		controllers[localId]?.abort();
		delete controllers[localId];
		const item = pending.find((p) => p.localId === localId);
		if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
		pending = pending.filter((p) => p.localId !== localId);
	}

	async function upload(localId: string, file: File, uploadTarget: MessageTarget) {
		const controller = new AbortController();
		controllers[localId] = controller;
		const find = () => pending.find((p) => p.localId === localId);

		try {
			const attachment = await uploadAttachment(
				file,
				uploadTarget,
				(fraction) => {
					const item = find();
					if (item) item.progress = fraction;
				},
				controller.signal
			);
			const item = find();
			if (item) {
				item.attachment = attachment;
				item.progress = 1;
				item.status = 'done';
			}
		} catch (e) {
			if (axios.isCancel(e)) return;
			const item = find();
			if (item) {
				item.status = 'error';
				item.error = getErrorMessage(e);
			}
		} finally {
			delete controllers[localId];
		}
	}

	function addFiles(files: File[]) {
		if (!target || files.length === 0) return;

		let overLimit = false;
		for (const file of files) {
			if (file.size > MAX_ATTACHMENT_BYTES) {
				toast.error(`${file.name} is larger than 10 MB`);
				continue;
			}
			if (pending.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
				overLimit = true;
				continue;
			}

			const localId = crypto.randomUUID();
			pending.push({
				localId,
				file,
				status: 'uploading',
				progress: 0,
				previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
			});
			upload(localId, file, target);
		}

		if (overLimit) {
			toast.error(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files to a message`);
		}
	}

	function handleFileInput(event: Event & { currentTarget: HTMLInputElement }) {
		addFiles(Array.from(event.currentTarget.files ?? []));
		event.currentTarget.value = '';
	}

	function handlePaste(event: ClipboardEvent) {
		const files = Array.from(event.clipboardData?.files ?? []);
		if (files.length === 0) return;
		event.preventDefault();
		addFiles(files);
	}

	const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;

	function handleDragEnter(event: DragEvent) {
		if (!hasFiles(event)) return;
		dragDepth++;
		dragging = true;
	}

	function handleDragOver(event: DragEvent) {
		if (hasFiles(event)) event.preventDefault();
	}

	function handleDragLeave(event: DragEvent) {
		if (!hasFiles(event)) return;
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) dragging = false;
	}

	function handleDrop(event: DragEvent) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		dragDepth = 0;
		dragging = false;
		addFiles(Array.from(event.dataTransfer?.files ?? []));
	}

	function handleEmojiCloseFocus(event: Event) {
		event.preventDefault();
		if (closedByEscape) editor?.focus(null);
		closedByEscape = false;
	}

	function handleChange(json: JSONContent) {
		linkPreview.update(messagePlainText(json));
		if (target && !isEmpty && !onSend) socketState.sendTyping(target);
	}

	async function handleSubmit(message: JSONContent) {
		if (!target || !canSend) return;
		const embed = linkPreview.embedFor(messagePlainText(message));
		if (onSend) {
			const accepted = await onSend({
				content: message,
				attachments: $state.snapshot(doneAttachments),
				embeds: embed ? [embed] : []
			});
			if (!accepted) return;
		} else {
			socketState.sendMessage(target, message, doneAttachments, replyTarget, embed ? [embed] : []);
		}
		editor?.clear();
		linkPreview.reset();
		clearPending();
		cancelReply();
		editor?.focus();
	}

	// ↑ on an empty composer jumps to editing your most recent message here.
	function editLastOwnMessage() {
		const me = usersState.loggedInUser;
		if (!me || !target) return;

		const messages = messagesState.messages(threadKey(target));
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].user_id === me.id && !messages[i].status) {
				messageEditState.start(messages[i].id);
				return;
			}
		}
	}
</script>

<div class={compact ? '' : 'px-8 pb-6 max-md:px-3 max-md:pb-[max(12px,var(--safe-bottom))]'}>
	<p
		aria-live="polite"
		class="px-1 pb-1.5 text-xs text-text-subtle {socketState.reconnecting ? '' : 'sr-only'}"
	>
		{#if socketState.reconnecting}Reconnecting — you can keep typing.{/if}
	</p>
	{#if replyTarget}
		<div
			class="mb-1.5 flex items-center gap-2 rounded-lg border border-input bg-card py-1 pr-1 pl-3 text-xs"
		>
			<span class="min-w-0 flex-1 truncate text-text-subtle">
				<span class="text-muted-foreground">Replying to <strong>{replyAuthor}</strong></span>
				<span class="ml-1.5"
					>{messagePreviewText(replyTarget.content, replyTarget.attachments)}</span
				>
			</span>
			<button
				type="button"
				aria-label="Cancel reply"
				onclick={cancelReply}
				class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<X size={16} strokeWidth={1.75} />
			</button>
		</div>
	{/if}
	<div
		role="group"
		aria-label="Message composer"
		class="flex flex-col rounded-xl border border-input bg-surface-input transition-colors focus-within:border-ring {dragging
			? 'ring-2 ring-ring'
			: ''}"
		onpastecapture={handlePaste}
		ondragenter={handleDragEnter}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondropcapture={handleDrop}
	>
		{#if linkPreview.embed}
			<div class="flex items-start gap-1 px-2.5 pt-2.5">
				<LinkEmbed embed={linkPreview.embed} compact />
				<button
					type="button"
					aria-label="Remove link preview"
					onclick={() => linkPreview.dismiss()}
					class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<X size={16} strokeWidth={1.75} />
				</button>
			</div>
		{/if}

		{#if pending.length > 0}
			<ul class="flex flex-wrap gap-2 px-2.5 pt-2.5">
				{#each pending as item (item.localId)}
					<li
						class="relative flex max-w-[240px] min-w-0 items-center gap-2 overflow-hidden rounded-lg border bg-card p-1.5 {item.status ===
						'error'
							? 'border-destructive-border'
							: 'border-border'}"
					>
						{#if item.previewUrl}
							<img
								src={item.previewUrl}
								alt=""
								class="h-10 w-10 shrink-0 rounded-md object-cover"
							/>
						{:else}
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground"
							>
								<FileIcon size={18} strokeWidth={1.75} />
							</div>
						{/if}

						<div class="min-w-0 flex-1">
							<div class="truncate text-[13px] text-foreground" title={item.file.name}>
								{item.file.name}
							</div>
							{#if item.status === 'error'}
								<div class="truncate text-[11px] text-destructive" title={item.error}>
									{item.error}
								</div>
							{:else}
								<div class="font-mono text-[11px] text-text-subtle">
									{formatBytes(item.file.size)}
								</div>
							{/if}
						</div>

						<button
							type="button"
							aria-label="Remove {item.file.name}"
							onclick={() => removePending(item.localId)}
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							<X size={16} strokeWidth={1.75} />
						</button>

						{#if item.status === 'uploading'}
							<div
								role="progressbar"
								aria-label="Uploading {item.file.name}"
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={Math.round(item.progress * 100)}
								class="absolute right-0 bottom-0 left-0 h-0.5 bg-border"
							>
								<div
									class="h-full bg-primary transition-[width]"
									style="width: {item.progress * 100}%"
								></div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<div class="flex min-h-[52px] items-end gap-1 py-2 pr-2 pl-2.5">
			<input
				bind:this={fileInput}
				type="file"
				multiple
				class="hidden"
				tabindex="-1"
				aria-hidden="true"
				onchange={handleFileInput}
			/>
			<button
				type="button"
				aria-label="Attach a file"
				onclick={() => fileInput?.click()}
				disabled={!target}
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
			>
				<Paperclip size={18} strokeWidth={1.75} />
			</button>

			<MessageEditor
				bind:this={editor}
				bind:isEmpty
				{placeholder}
				allowEmpty={doneAttachments.length > 0}
				onSubmit={handleSubmit}
				onChange={handleChange}
				onArrowUp={editLastOwnMessage}
				onCancel={replyTarget ? cancelReply : undefined}
				mentionCandidates={() =>
					mentionCandidates({
						serverId: target?.kind === 'channel' ? target.serverId : null,
						channelId: target?.kind === 'channel' ? target.channelId : null,
						conversationId: target?.kind === 'direct' ? target.conversationId : null
					})}
				editorClass="prose prose-sm max-h-40 w-full max-w-none min-w-0 flex-1 self-center overflow-y-auto py-1.5 text-[15px] break-words whitespace-pre-wrap text-foreground prose-invert outline-none prose-headings:my-1 prose-p:my-0 prose-ol:my-1 prose-ul:my-1 prose-li:my-0"
			/>

			<Popover.Root bind:open={emojiOpen}>
				<Popover.Trigger disabled={!target}>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							aria-label="Add emoji"
							disabled={!target}
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
						>
							<Smile size={18} strokeWidth={1.75} />
						</button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content
					class="w-auto p-0"
					side="top"
					align="end"
					sideOffset={6}
					onEscapeKeydown={() => (closedByEscape = true)}
					onOpenAutoFocus={(event) => event.preventDefault()}
					onCloseAutoFocus={handleEmojiCloseFocus}
				>
					<EmojiPicker onpick={(unicode) => editor?.insertText(unicode)} />
				</Popover.Content>
			</Popover.Root>

			<button
				type="button"
				aria-label="Send message"
				onclick={() => editor?.submit()}
				disabled={!canSend}
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-input focus-visible:outline-none disabled:opacity-40"
			>
				<SendHorizontal size={18} strokeWidth={1.75} />
			</button>
		</div>
	</div>
</div>
