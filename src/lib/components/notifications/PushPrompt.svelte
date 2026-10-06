<script lang="ts">
	import { BellRing } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import Button from '$lib/components/ui/button/button.svelte';
	import { installState } from '$lib/states/installState.svelte';
	import { notificationsState } from '$lib/states/notificationsState.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import { phoneBlockedHelp } from '$lib/utils/install';
	import { dismissPushPrompt, isPushPromptSnoozed } from '$lib/utils/pushPrompt';

	let snoozed = $state(isPushPromptSnoozed());

	// Steps aside while the mic prompt for a voice join is up; they share this corner.
	// On a phone the install hint goes first.
	const visible = $derived(
		notificationsState.pushChecked &&
			notificationsState.push === 'off' &&
			!snoozed &&
			!voiceState.micPrompt &&
			!installState.visible
	);
	const blocked = $derived(notificationsState.permission === 'denied');
	const blockedHelp =
		phoneBlockedHelp(installState.platform) ??
		'Click the lock icon in the address bar, set Notifications to Allow, then reload.';

	async function enable() {
		const result = await notificationsState.setPush(true);
		if (result === 'enabled') {
			toast.success('Notifications on');
		} else if (result === 'error') {
			toast.error("Couldn't turn on notifications. Try again from Settings.");
		}
	}

	function notNow() {
		dismissPushPrompt();
		snoozed = true;
	}
</script>

<div
	class="pointer-events-none fixed right-4 bottom-4 z-40 w-80 max-w-[calc(100vw-2rem)] max-md:inset-x-3 max-md:top-[calc(env(safe-area-inset-top,0px)+2.75rem+0.5rem)] max-md:bottom-auto max-md:w-auto max-md:max-w-none"
	aria-live="polite"
>
	{#if visible}
		<div
			class="pointer-events-auto flex flex-col gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg"
			role="region"
			aria-label="Notifications"
		>
			<div class="flex items-start gap-3">
				<BellRing class="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
				<div class="flex flex-col gap-1">
					<span class="text-sm font-medium">Get notified about DMs and mentions</span>
					{#if blocked}
						<span class="text-xs text-muted-foreground">
							Notifications are blocked. {blockedHelp}
						</span>
					{:else}
						<span class="text-xs text-muted-foreground">
							Even when zeta is closed. You can change this in Settings.
						</span>
					{/if}
				</div>
			</div>
			<div class="flex justify-end gap-2">
				{#if blocked}
					<Button size="sm" variant="ghost" onclick={notNow}>Dismiss</Button>
				{:else}
					<Button size="sm" variant="ghost" onclick={notNow}>Not now</Button>
					<Button size="sm" onclick={enable} disabled={notificationsState.pushBusy}>Enable</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>
