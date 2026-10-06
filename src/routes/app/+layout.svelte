<script lang="ts">
	import { onMount, untrack } from 'svelte';
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
	import { phoneState } from '$lib/states/phoneState.svelte';
	import { membersPanelState } from '$lib/states/membersPanelState.svelte';

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

	// Phones show the navigation or the page; a fresh load decides which.
	untrack(() => phoneState.startAt(page.url.pathname));

	// The member sheet covers the page, so it never outlives the page it was opened on.
	$effect(() => {
		void page.url.pathname;
		void phoneState.phone;
		untrack(() => membersPanelState.closeSheet());
	});

	// The shell is locked to the screen: the document itself never scrolls.
	onMount(() => {
		const root = document.documentElement;
		root.classList.add('app-shell');
		return () => root.classList.remove('app-shell');
	});

	// The shell follows the visible viewport, so the composer sits on top of the iOS
	// keyboard instead of behind it.
	$effect(() => {
		const viewport = window.visualViewport;
		if (!phoneState.touch || !viewport) return;
		const root = document.documentElement;
		const sync = () => {
			if (viewport.scale !== 1) return;
			root.style.setProperty('--app-height', `${viewport.height}px`);
			root.toggleAttribute('data-keyboard', window.innerHeight - viewport.height > 120);
			// iOS scrolls the layout viewport to reveal a focused input; put it back.
			if (viewport.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
		};
		sync();
		viewport.addEventListener('resize', sync);
		viewport.addEventListener('scroll', sync);
		return () => {
			viewport.removeEventListener('resize', sync);
			viewport.removeEventListener('scroll', sync);
			root.style.removeProperty('--app-height');
			root.removeAttribute('data-keyboard');
		};
	});
</script>

<svelte:head><title>{title}</title></svelte:head>

<div
	class="app-shell-root flex h-screen w-screen flex-col overflow-hidden bg-rail pr-[env(safe-area-inset-right,0px)] pl-[env(safe-area-inset-left,0px)]"
>
	<TopBar />
	<div class="flex min-h-0 flex-1 max-md:relative">
		<!-- On a phone the navigation slides over the page, which stays mounted underneath. -->
		<div
			class="flex min-h-0 motion-reduce:transition-none max-md:absolute max-md:inset-0 max-md:z-10 max-md:bg-background max-md:transition-transform max-md:duration-200 md:contents {phoneState.navOpen
				? ''
				: 'max-md:-translate-x-full'}"
			inert={phoneState.phone && !phoneState.navOpen}
		>
			<ServerRail />
			{#if inDirect}
				<DirectSidebar />
			{:else if serversState.selectedServer}
				<ChannelSidebar />
			{/if}
		</div>
		<div class="min-w-0 flex-1 bg-background" inert={phoneState.navCoversContent}>
			{@render children()}
		</div>
	</div>
</div>

<Overlay />
<InstallPrompt />
<PushPrompt />
<MicPrompt />
<ShareScreenDialog />
