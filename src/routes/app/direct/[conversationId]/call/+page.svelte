<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/button/button.svelte';
	import EmptyState from '$lib/components/ui/feedback/EmptyState.svelte';
	import VoiceStage from '$lib/components/voice/VoiceStage.svelte';
	import { callRoster } from '$lib/states/callRoster.svelte';
	import { callsState } from '$lib/states/callsState.svelte';
	import { conversationsState } from '$lib/states/conversationsState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { ArrowLeft, Phone } from 'lucide-svelte';

	const conversationId = $derived.by(() => {
		const id = parseInt(page.params.conversationId ?? '');
		return Number.isNaN(id) ? null : id;
	});
	const conversation = $derived(
		conversationId != null ? conversationsState.conversations[conversationId] : undefined
	);
	const person = $derived(
		conversation ? (usersState.users[conversation.other_user.id] ?? conversation.other_user) : null
	);
	const name = $derived(person?.username ?? 'this person');

	const call = $derived(conversationId != null ? callsState.forConversation(conversationId) : null);
	const inThisCall = $derived(conversationId != null && voiceState.isInCall(conversationId));
	const live = $derived(inThisCall && voiceState.connected);
	const roster = $derived(conversationId != null ? callRoster(call, conversationId) : []);
	const screens = $derived(live ? Array.from(voiceState.screens.values()) : []);

	$effect(() => {
		if (conversationId == null) goto('/app/direct/', { replaceState: true });
	});

	function join() {
		if (call && !inThisCall) {
			void voiceState.joinCall({ id: call.id, conversation_id: call.conversation_id });
		}
	}
</script>

{#snippet joinButton()}
	{#if call}
		<Button onclick={join} disabled={inThisCall}>
			{inThisCall ? 'Connecting…' : 'Join call'}
		</Button>
	{/if}
{/snippet}

{#snippet empty()}
	<EmptyState title="No call right now" description="Call {name} to talk.">
		{#snippet icon()}
			<Phone size={20} strokeWidth={1.75} />
		{/snippet}
		{#snippet action()}
			{#if conversationId != null}
				{@const id = conversationId}
				<Button onclick={() => callsState.start(id)} disabled={callsState.starting != null}>
					Call {name}
				</Button>
			{/if}
		{/snippet}
	</EmptyState>
{/snippet}

<div class="flex h-full min-h-0 flex-col">
	<header
		class="flex h-14 shrink-0 items-center gap-3 border-b border-border pr-4 pl-4 max-md:h-12 max-md:px-3"
	>
		{#if conversationId != null}
			<a
				href="/app/direct/{conversationId}/"
				aria-label="Back to the conversation"
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11"
			>
				<ArrowLeft size={18} strokeWidth={1.75} />
			</a>
		{/if}
		<h1 class="min-w-0 truncate text-[15px] font-semibold">Call with {name}</h1>
	</header>

	<div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 scrollbar-stable max-md:p-3">
		<VoiceStage {roster} {screens} {live} label="Call with {name}" {empty} idle={joinButton} />
	</div>
</div>
