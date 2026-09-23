<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import type { MessageTarget } from '$lib/types/messages.types';
	import { socketState } from '$lib/states/socketState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { messagesState, threadKey } from '$lib/states/messagesState.svelte';
	import { messageEditState } from '$lib/states/messageEditState.svelte';
	import MessageEditor from './MessageEditor.svelte';
	import { Paperclip, Smile, SendHorizontal } from 'lucide-svelte';

	let { target }: { target: MessageTarget | null } = $props();

	let editor = $state<ReturnType<typeof MessageEditor>>();
	let isEmpty = $state(true);

	function handleSubmit(message: JSONContent) {
		if (!target) return;
		socketState.sendMessage(target, message);
		editor?.clear();
		editor?.focus();
	}

	// ↑ on an empty composer jumps to editing your most recent message here.
	// Channel messages only: DM messages can't be edited yet.
	function editLastOwnMessage() {
		const me = usersState.loggedInUser;
		if (!me || target?.kind !== 'channel') return;

		const messages = messagesState.messages(threadKey(target));
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].user_id === me.id) {
				messageEditState.start(messages[i].id);
				return;
			}
		}
	}
</script>

<div class="px-8 pb-6">
	<div
		class="flex min-h-[52px] items-end gap-1 rounded-xl border border-input bg-surface-input py-2 pr-2 pl-2.5 transition-colors focus-within:border-ring"
	>
		<button
			type="button"
			aria-label="Attach a file"
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<Paperclip size={18} strokeWidth={1.75} />
		</button>

		<MessageEditor
			bind:this={editor}
			bind:isEmpty
			onSubmit={handleSubmit}
			onArrowUp={editLastOwnMessage}
			editorClass="prose prose-sm max-h-40 w-full max-w-none min-w-0 flex-1 self-center overflow-y-auto py-1.5 text-[15px] break-words whitespace-pre-wrap text-foreground prose-invert outline-none prose-headings:my-1 prose-p:my-0 prose-ol:my-1 prose-ul:my-1 prose-li:my-0"
		/>

		<button
			type="button"
			aria-label="Add emoji"
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<Smile size={18} strokeWidth={1.75} />
		</button>

		<button
			type="button"
			aria-label="Send message"
			onclick={() => editor?.submit()}
			disabled={isEmpty}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-input focus-visible:outline-none disabled:opacity-40"
		>
			<SendHorizontal size={18} strokeWidth={1.75} />
		</button>
	</div>
</div>
