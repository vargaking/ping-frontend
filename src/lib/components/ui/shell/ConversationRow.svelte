<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { conversationsState } from '$lib/states/conversationsState.svelte';
	import type { Conversation } from '$lib/types/conversation.types';
	import { messagePlainText } from '$lib/utils/messageContent';

	type Props = {
		conversation: Conversation;
		meId: number | null;
		active?: boolean;
	};

	let { conversation, meId, active = false }: Props = $props();

	// Prefer the live user record so renames and avatar changes show up.
	const other = $derived(usersState.users[conversation.other_user.id] ?? conversation.other_user);

	const preview = $derived.by(() => {
		const last = conversation.last_message;
		if (!last) return '';
		const text = messagePlainText(last.content);
		return last.user_id === meId ? `You: ${text}` : text;
	});

	// Never shows as unread while it's the thread we're actively reading.
	const unread = $derived(!active && conversationsState.isUnread(conversation));
</script>

<a
	href={`/app/direct/${conversation.id}/`}
	aria-current={active ? 'page' : undefined}
	class="flex h-12 w-full items-center gap-2.5 rounded-lg px-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {active
		? 'bg-accent'
		: 'hover:bg-card'}"
>
	<Avatar user={other} size="sm" rounded="rounded-lg" className="shrink-0" />
	<div class="flex min-w-0 flex-1 flex-col">
		<span
			class="truncate text-sm text-foreground {active
				? 'font-medium'
				: unread
					? 'font-semibold'
					: ''}"
		>
			{other.username}
			{#if unread}<span class="sr-only">, unread</span>{/if}
		</span>
		{#if preview}
			<span class="truncate text-xs {unread ? 'text-foreground' : 'text-text-subtle'}"
				>{preview}</span
			>
		{/if}
	</div>
	{#if unread}
		<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
	{/if}
</a>
