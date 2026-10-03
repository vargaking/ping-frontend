<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { desktop } from '$lib/desktop';
	import { notificationsState } from '$lib/states/notificationsState.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { testPush } from '$lib/requests/push/testPush';
	import { normalizeError } from '$lib/requests/errors';
	import { describePushTestResult } from '$lib/utils/push';
	import type { PushTestResult } from '$lib/types/push.types';
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

	let testing = $state(false);
	let testResults = $state<PushTestResult[] | null>(null);
	let testError = $state<string | null>(null);

	async function sendTest() {
		testing = true;
		testResults = null;
		testError = null;
		try {
			testResults = await testPush();
		} catch (e) {
			const { status, message } = normalizeError(e);
			testError =
				status === 409
					? "Push isn't set up on this server."
					: status === 429
						? 'Too many tests. Try again in a minute.'
						: message;
		} finally {
			testing = false;
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

		{#if pushShown}
			<SettingsSwitch
				label="Notify me when zeta is closed"
				description="DMs and @mentions, even with every tab closed."
				checked={notificationsState.push === 'on'}
				disabled={pushDisabled}
				onclick={togglePush}
			>
				{#if notificationsState.push === 'disabled'}
					<span class="text-xs text-muted-foreground">
						This server doesn't have closed-tab notifications set up.
					</span>
				{:else if notificationsState.push === 'unavailable'}
					<span class="text-xs text-muted-foreground">
						Couldn't check closed-tab notifications. Try again later.
					</span>
				{:else if notificationsState.push === 'off' && notificationsState.permission === 'denied'}
					<span class="text-xs text-destructive">
						Notifications are blocked in your browser. Allow them in your site settings to turn this
						on.
					</span>
				{:else if notificationsState.push === 'off' && !notificationsState.desktop}
					<span class="text-xs text-muted-foreground">Turn on desktop notifications first.</span>
				{/if}
			</SettingsSwitch>

			{#if notificationsState.push === 'on'}
				<div class="-mt-2 flex flex-col items-start gap-2">
					<Button variant="outline" size="sm" disabled={testing} onclick={sendTest}>
						{testing ? 'Sending…' : 'Send test notification'}
					</Button>
					{#if testError}
						<span class="text-xs text-destructive">{testError}</span>
					{:else if testResults?.length === 0}
						<span class="text-xs text-destructive">
							No subscription on the server for this account. Turn push off and on.
						</span>
					{:else if testResults}
						{#each testResults as result, i (i)}
							{@const description = describePushTestResult(result)}
							<span
								class="text-xs {description === 'Delivered'
									? 'text-muted-foreground'
									: 'text-destructive'}"
							>
								{result.endpoint_host}: {description}
							</span>
						{/each}
					{/if}
				</div>
			{/if}
		{/if}

		<SettingsSwitch
			label="Sound"
			description="Play a short sound for new messages and mentions."
			checked={notificationsState.sound}
			onclick={toggleSound}
		/>

		{#if launchAtLogin !== null}
			<SettingsSwitch
				label="Open Zet when your computer starts"
				description="Starts in the tray, so you get notifications without opening it."
				checked={launchAtLogin}
				onclick={toggleLaunchAtLogin}
			/>
		{/if}
	</div>
</div>
