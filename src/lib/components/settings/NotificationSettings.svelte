<script lang="ts">
	import { onMount } from 'svelte';
	import { notificationsState } from '$lib/states/notificationsState.svelte';
	import SettingsSwitch from './SettingsSwitch.svelte';

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
	<div class="flex max-w-md flex-col gap-5">
		<SettingsSwitch
			label="Desktop notifications"
			description="Show a system notification for new messages when zeta isn't focused."
			checked={notificationsState.desktop}
			disabled={desktopDisabled}
			onclick={toggleDesktop}
		>
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
		</SettingsSwitch>

		<SettingsSwitch
			label="Sound"
			description="Play a short sound for new messages and mentions."
			checked={notificationsState.sound}
			onclick={toggleSound}
		/>
	</div>
</div>
