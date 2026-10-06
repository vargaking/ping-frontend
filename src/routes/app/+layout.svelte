<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import TopBar from '$lib/components/ui/shell/TopBar.svelte';
	import ServerRail from '$lib/components/ui/shell/ServerRail.svelte';
	import ChannelSidebar from '$lib/components/ui/shell/ChannelSidebar.svelte';
	import DirectSidebar from '$lib/components/ui/shell/DirectSidebar.svelte';
	import Overlay from '$lib/components/ui/Overlay.svelte';
	import MicPrompt from '$lib/components/voice/MicPrompt.svelte';
	import ShareScreenDialog from '$lib/components/voice/ShareScreenDialog.svelte';
	import PushPrompt from '$lib/components/notifications/PushPrompt.svelte';
	import InstallPrompt from '$lib/components/notifications/InstallPrompt.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import { notificationsState } from '$lib/states/notificationsState.svelte';
	import { writePushPrefs } from '$lib/utils/pushPrefs';
	import { desktop } from '$lib/desktop';
	import { shareDialogState } from '$lib/states/shareDialogState.svelte';

	let { children } = $props();

	const badgeTotal = $derived(unreadState.badgeTotal);
	const title = $derived(
		badgeTotal > 0 ? `(${badgeTotal > 99 ? '99+' : badgeTotal}) zeta` : 'zeta'
	);

	onMount(() => {
		notificationsState.refreshPermission();
		notificationsState.attachPermissionListeners();
		void notificationsState.refreshPush();
	});

	onMount(() => {
		const unsubscribe = desktop?.onPickScreenSource?.((sources) =>
			shareDialogState.handleShellRequest(sources)
		);
		return () => {
			unsubscribe?.();
			shareDialogState.close();
		};
	});

	$effect(() => {
		void writePushPrefs({ sound: notificationsState.sound });
	});

	// The selected server lingers after leaving it, so pick the column by route.
	const inDirect = $derived(page.route.id?.startsWith('/app/direct') ?? false);
</script>

<svelte:head><title>{title}</title></svelte:head>

<div class="flex h-screen w-screen flex-col overflow-hidden">
	<TopBar />
	<div class="flex min-h-0 flex-1">
		<ServerRail />
		{#if inDirect}
			<DirectSidebar />
		{:else if serversState.selectedServer}
			<ChannelSidebar />
		{/if}
		<div class="min-w-0 flex-1">
			{@render children()}
		</div>
	</div>
</div>

<Overlay />
<InstallPrompt />
<PushPrompt />
<MicPrompt />
<ShareScreenDialog />
