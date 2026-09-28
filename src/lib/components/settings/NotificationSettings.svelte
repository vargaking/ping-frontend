<script lang="ts">
	import { onMount } from 'svelte';
	import { notificationsState } from '$lib/states/notificationsState.svelte';

	onMount(() => {
		notificationsState.refreshPermission();
		notificationsState.attachPermissionListeners();
	});

	const desktopDisabled = $derived(
		notificationsState.permission === 'denied' || notificationsState.permission === 'unsupported'
	);

	async function toggleDesktop() {
		if (desktopDisabled) return;

		if (notificationsState.desktop) {
			notificationsState.setDesktop(false);
			return;
		}

		// Must be requested from this click — browsers reject requestPermission()
		// calls that don't originate from a user gesture.
		if (notificationsState.permission === 'default') {
			const result = await notificationsState.requestPermission();
			if (result === 'granted') notificationsState.setDesktop(true);
			return;
		}

		if (notificationsState.permission === 'granted') {
			notificationsState.setDesktop(true);
		}
	}

	function toggleSound() {
		notificationsState.setSound(!notificationsState.sound);
	}
</script>

<div class="flex flex-col gap-6">
	<h2 class="text-xl font-bold">Notifications</h2>

	<div class="flex max-w-md flex-col gap-5">
		<div class="flex items-start justify-between gap-4">
			<div class="flex flex-col gap-1">
				<span class="text-sm font-medium">Desktop notifications</span>
				<span class="text-xs text-muted-foreground">
					Show a system notification for new messages when zeta isn't focused.
				</span>
				{#if notificationsState.permission === 'denied'}
					<span class="text-xs text-destructive">
						Notifications are blocked in your browser. Allow them in your site settings to turn this
						on.
					</span>
				{:else if notificationsState.permission === 'unsupported'}
					<span class="text-xs text-destructive">
						Your browser doesn't support desktop notifications.
					</span>
				{/if}
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={notificationsState.desktop}
				aria-label="Desktop notifications"
				disabled={desktopDisabled}
				onclick={toggleDesktop}
				class="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 {notificationsState.desktop
					? 'bg-primary'
					: 'bg-input'}"
			>
				<span
					class="inline-block h-4 w-4 transform rounded-full bg-background transition-transform {notificationsState.desktop
						? 'translate-x-5'
						: 'translate-x-1'}"
				></span>
			</button>
		</div>

		<div class="flex items-start justify-between gap-4">
			<div class="flex flex-col gap-1">
				<span class="text-sm font-medium">Sound</span>
				<span class="text-xs text-muted-foreground">
					Play a short sound for new messages and mentions.
				</span>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={notificationsState.sound}
				aria-label="Sound"
				onclick={toggleSound}
				class="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none {notificationsState.sound
					? 'bg-primary'
					: 'bg-input'}"
			>
				<span
					class="inline-block h-4 w-4 transform rounded-full bg-background transition-transform {notificationsState.sound
						? 'translate-x-5'
						: 'translate-x-1'}"
				></span>
			</button>
		</div>
	</div>
</div>
