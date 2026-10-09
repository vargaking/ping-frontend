<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { desktop } from '$lib/desktop';
	import { installState } from '$lib/states/installState.svelte';
	import { notificationsState } from '$lib/states/notificationsState.svelte';
	import { blockedHelp } from '$lib/utils/install';
	import SettingsSwitch from './SettingsSwitch.svelte';

	onMount(() => {
		notificationsState.refreshPermission();
		notificationsState.attachPermissionListeners();
		void notificationsState.refreshPush();
		void desktop?.getLaunchAtLogin().then((value) => (launchAtLogin = value));
	});

	let launchAtLogin = $state<boolean | null>(null);

	async function toggleLaunchAtLogin() {
		if (!desktop || launchAtLogin === null) return;
		launchAtLogin = await desktop.setLaunchAtLogin(!launchAtLogin);
	}

	const blockedMessage = `Notifications are blocked. ${blockedHelp(installState.platform, installState.standalone)}`;

	const desktopDisabled = $derived(
		installState.needsHomeScreenInstall ||
			notificationsState.permission === 'denied' ||
			notificationsState.permission === 'unsupported'
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

	const pushShown = $derived(notificationsState.push !== 'unsupported');
	const pushDisabled = $derived(
		notificationsState.pushBusy ||
			notificationsState.push === 'disabled' ||
			notificationsState.push === 'unavailable' ||
			(notificationsState.push === 'off' &&
				(notificationsState.permission === 'denied' || !notificationsState.desktop))
	);

	async function togglePush() {
		if (pushDisabled) return;

		if (notificationsState.push === 'on') {
			await notificationsState.setPush(false);
			return;
		}

		// Must be called straight from this click, like the permission request above.
		const result = await notificationsState.setPush(true);
		if (result === 'error') toast.error("Couldn't turn on notifications. Try again in a moment.");
	}

	function toggleSound() {
		notificationsState.setSound(!notificationsState.sound);
	}
</script>

<div class="flex flex-col gap-6">
	<div class="flex max-w-md flex-col gap-5">
		<SettingsSwitch
			label="Notifications while Zeta is open"
			description="Show a system notification for new messages when Zeta isn't in front."
			checked={notificationsState.desktop}
			disabled={desktopDisabled}
			onclick={toggleDesktop}
		>
			{#if installState.needsHomeScreenInstall}
				<span class="text-xs text-muted-foreground">
					Notifications need Zeta on your Home Screen. Tap Share, then Add to Home Screen.
				</span>
			{:else if notificationsState.permission === 'denied'}
				<span class="text-xs text-destructive">{blockedMessage}</span>
			{:else if notificationsState.permission === 'unsupported'}
				<span class="text-xs text-destructive"> This browser doesn't support notifications. </span>
			{/if}
		</SettingsSwitch>

		{#if pushShown}
			<SettingsSwitch
				label="Notify me when Zeta is closed"
				description="Only DMs and @mentions."
				checked={notificationsState.push === 'on'}
				disabled={pushDisabled}
				onclick={togglePush}
			>
				{#if notificationsState.push === 'disabled'}
					<span class="text-xs text-muted-foreground">
						This server isn't set up to notify you while Zeta is closed.
					</span>
				{:else if notificationsState.push === 'unavailable'}
					<span class="text-xs text-muted-foreground">
						Couldn't check whether this server can notify you while Zeta is closed. Try again later.
					</span>
				{:else if notificationsState.push === 'off' && notificationsState.permission === 'denied'}
					<span class="text-xs text-destructive">{blockedMessage}</span>
				{:else if notificationsState.push === 'off' && !notificationsState.desktop}
					<span class="text-xs text-muted-foreground"
						>Turn on notifications while Zeta is open first.</span
					>
				{/if}
			</SettingsSwitch>
		{/if}

		<SettingsSwitch
			label="Sound"
			description="Play a short sound for new messages and mentions."
			checked={notificationsState.sound}
			onclick={toggleSound}
		/>

		{#if launchAtLogin !== null}
			<SettingsSwitch
				label="Open Zeta when your computer starts"
				description="Starts in the tray, so you get notifications without opening it."
				checked={launchAtLogin}
				onclick={toggleLaunchAtLogin}
			/>
		{/if}
	</div>
</div>
