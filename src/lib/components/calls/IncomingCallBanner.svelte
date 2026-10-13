<script lang="ts">
	import { Phone, PhoneOff } from '@lucide/svelte';
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { callsState } from '$lib/states/callsState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';

	const call = $derived(callsState.incomingCall);
	const caller = $derived(call ? usersState.users[call.caller_id] : undefined);
	const name = $derived(caller?.username ?? 'Someone');
	const busy = $derived(callsState.accepting != null);

	$effect(() => {
		if (call) usersState.getOrFetchUser(call.caller_id);
	});
</script>

<div class="pointer-events-none fixed inset-x-3 top-(--notice-top) z-50 mx-auto max-w-md">
	{#if call}
		<div
			class="pointer-events-auto flex items-center gap-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
			role="alertdialog"
			aria-label="Incoming call from {name}"
		>
			<Avatar user={caller} name={caller ? null : name} size="lg" className="shrink-0" />
			<div class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-sm font-medium">{name}</span>
				<span class="text-xs text-muted-foreground">Incoming call</span>
			</div>
			<div class="flex shrink-0 gap-2">
				<Button variant="destructive" disabled={busy} onclick={() => callsState.decline(call.id)}>
					<PhoneOff aria-hidden="true" />
					Decline
				</Button>
				<Button disabled={busy} onclick={() => callsState.accept(call)}>
					<Phone aria-hidden="true" />
					Accept
				</Button>
			</div>
		</div>
	{/if}
</div>
