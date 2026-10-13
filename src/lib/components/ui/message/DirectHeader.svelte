<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { callsState } from '$lib/states/callsState.svelte';
	import { profileCardState } from '$lib/states/profileCardState.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import type { User } from '$lib/types/auth.types';
	import { Phone } from 'lucide-svelte';

	let { user, conversationId }: { user: User | null; conversationId: number | null } = $props();
	let card = $state<HTMLElement | null>(null);
	const inCall = $derived(conversationId != null && voiceState.isInCall(conversationId));
</script>

<header
	class="flex h-14 shrink-0 items-center gap-3 border-b border-border pr-4 pl-6 max-md:h-12 max-md:px-3"
>
	{#if user}
		{@const person = user}
		<h1 class="min-w-0 text-[15px] font-semibold">
			<button
				bind:this={card}
				type="button"
				aria-haspopup="dialog"
				aria-expanded={profileCardState.anchor === card}
				class="flex max-w-full items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				onclick={(e) =>
					profileCardState.toggle(
						e.currentTarget,
						{ kind: 'user', userId: person.id, serverId: null, fallbackName: person.username },
						{ side: 'bottom', align: 'start' }
					)}
			>
				<Avatar {user} size="sm" rounded="rounded-lg" className="h-7 w-7" />
				<span class="truncate">{user.username}</span>
			</button>
		</h1>
	{/if}
	{#if conversationId != null}
		{@const id = conversationId}
		<div class="ml-auto shrink-0">
			{#if inCall}
				<Button
					variant="secondary"
					size="sm"
					href="/app/direct/{id}/call/"
					class="max-md:w-11 max-md:px-0"
				>
					<Phone size={16} strokeWidth={1.75} />
					<span class="max-md:sr-only">Open call</span>
				</Button>
			{:else}
				<Button
					variant="secondary"
					size="sm"
					class="max-md:w-11 max-md:px-0"
					disabled={callsState.starting != null}
					onclick={() => callsState.start(id)}
				>
					<Phone size={16} strokeWidth={1.75} />
					<span class="max-md:sr-only">Call</span>
				</Button>
			{/if}
		</div>
	{/if}
</header>
