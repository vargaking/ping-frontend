<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { profileCardState, provideProfileCardServer } from '$lib/states/profileCardState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import type { User } from '$lib/types/auth.types';
	import type { MessageType } from '$lib/types/messages.types';
	import MessageRow from './MessageRow.svelte';
	import AuthorName from './AuthorName.svelte';
	import ReplyContext from './ReplyContext.svelte';

	let {
		messages,
		onJumpToMessage
	}: { messages: MessageType[]; onJumpToMessage: (messageId: string) => void } = $props();

	const serverId = $derived(messages[0].server_id ?? null);
	provideProfileCardServer(() => serverId);

	const userId = $derived(messages[0].user_id);
	const imported = $derived(messages[0].imported_author ?? null);
	const nameColor = $derived(
		imported ? null : serversState.nameColorOf(messages[0].server_id, userId)
	);

	// Resolve the author without gating the whole row on a promise — the row
	// renders immediately (Avatar shows its placeholder) and fills in when the
	// user resolves, so cached authors never flicker and uncached ones don't
	// blank out the message body.
	let user = $state<User | null>(null);

	$effect(() => {
		if (imported) {
			user = null;
			return;
		}
		let cancelled = false;
		Promise.resolve(usersState.getOrFetchUser(userId)).then((u) => {
			if (!cancelled) user = u;
		});
		return () => {
			cancelled = true;
		};
	});

	const headerTime = $derived(
		messages.length > 0
			? new Date(messages[0].timestamp).toLocaleString([], {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit'
				})
			: ''
	);

	let avatarButton = $state<HTMLElement | null>(null);

	function openCard(anchor: HTMLElement) {
		profileCardState.toggle(
			anchor,
			imported
				? { kind: 'imported', name: imported.name }
				: { kind: 'user', userId, serverId, fallbackName: user?.username },
			{ side: 'right', align: 'start' }
		);
	}
</script>

{#snippet avatar()}
	<button
		bind:this={avatarButton}
		type="button"
		aria-label="Show profile of {imported?.name ?? user?.username ?? 'this author'}"
		aria-haspopup="dialog"
		aria-expanded={profileCardState.anchor === avatarButton}
		class="mt-0.5 block rounded-[10px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		onclick={(e) => openCard(e.currentTarget)}
	>
		<Avatar {user} name={imported?.name} size="md" rounded="rounded-[10px]" />
	</button>
{/snippet}

{#snippet header()}
	{#if messages[0].reply_to}
		<ReplyContext reply={messages[0].reply_to} onJump={onJumpToMessage} />
	{/if}
	<div class="mb-0.5 flex max-w-[760px] items-baseline gap-2">
		<span class="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
			<AuthorName
				name={imported?.name ?? user?.username ?? '…'}
				imported={imported != null}
				color={nameColor}
				onclick={openCard}
			/>
		</span>
		<span class="shrink-0 font-mono text-[11px] whitespace-nowrap text-text-subtle">
			{headerTime}
		</span>
	</div>
{/snippet}

<div class="-my-px flex flex-col">
	{#each messages as message, i (message.id)}
		<MessageRow
			{message}
			avatar={i === 0 ? avatar : undefined}
			header={i === 0 ? header : undefined}
		/>
	{/each}
</div>
