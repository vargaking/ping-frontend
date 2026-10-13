<script lang="ts">
	import { Phone, PhoneMissed, PhoneOff } from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { callsState } from '$lib/states/callsState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import type { MessageType } from '$lib/types/messages.types';
	import { callRowView } from '$lib/utils/callText';

	let { message }: { message: MessageType } = $props();

	const call = $derived(message.call);
	const mine = $derived(message.user_id === usersState.loggedInUser?.id);
	const callerName = $derived(usersState.users[message.user_id]?.username ?? 'Someone');
	const view = $derived(
		call
			? callRowView(call, {
					caller: mine,
					callerName,
					stale: callsState.isStale(call.id)
				})
			: null
	);
	const joined = $derived(call != null && voiceState.callId === call.id);
	const time = $derived(
		new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
	);
	const missedForMe = $derived(call?.state === 'missed' && !mine);
	const live = $derived(view != null && (view.canJoin || joined));

	$effect(() => {
		usersState.getOrFetchUser(message.user_id);
	});

	function join() {
		if (!call || message.conversation_id == null) return;
		void voiceState.joinCall({ id: call.id, conversation_id: message.conversation_id });
	}
</script>

{#if call && view}
	<div class="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5" data-message-id={message.id}>
		<span
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card {live
				? 'text-online'
				: missedForMe
					? 'text-destructive'
					: 'text-muted-foreground'}"
			aria-hidden="true"
		>
			{#if missedForMe}
				<PhoneMissed size={18} strokeWidth={1.75} />
			{:else if live || call.state === 'ended'}
				<Phone size={18} strokeWidth={1.75} />
			{:else}
				<PhoneOff size={18} strokeWidth={1.75} />
			{/if}
		</span>
		<div class="min-w-0 flex-1">
			<p class="text-[15px] leading-snug text-foreground">{view.text}</p>
			<p class="font-mono text-[11px] text-text-subtle">{time}</p>
		</div>
		{#if view.canJoin || view.canDecline}
			<div class="flex shrink-0 items-center gap-2">
				{#if view.canDecline}
					<Button variant="secondary" size="sm" onclick={() => callsState.decline(call.id)}>
						Decline
					</Button>
				{/if}
				{#if view.canJoin && !joined}
					<Button size="sm" onclick={join}>Join</Button>
				{/if}
			</div>
		{/if}
	</div>
{/if}
