<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import TopBar from '$lib/components/ui/shell/TopBar.svelte';
	import ServerRail from '$lib/components/ui/shell/ServerRail.svelte';
	import ChannelSidebar from '$lib/components/ui/shell/ChannelSidebar.svelte';
	import DirectSidebar from '$lib/components/ui/shell/DirectSidebar.svelte';
	import VoiceDock from '$lib/components/ui/shell/VoiceDock.svelte';
	import Overlay from '$lib/components/ui/Overlay.svelte';
	import SearchDialog from '$lib/components/search/SearchDialog.svelte';
	import MicPrompt from '$lib/components/voice/MicPrompt.svelte';
	import ShareScreenDialog from '$lib/components/voice/ShareScreenDialog.svelte';
	import PushPrompt from '$lib/components/notifications/PushPrompt.svelte';
	import InstallPrompt from '$lib/components/notifications/InstallPrompt.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import { notificationsState } from '$lib/states/notificationsState.svelte';
	import { historySyncState } from '$lib/states/historySyncState.svelte';
	import { resyncState } from '$lib/states/resyncState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { writePushPrefs } from '$lib/utils/pushPrefs';
	import { closeReadNotifications, readThreadTags } from '$lib/utils/notificationSweep';
	import { desktop } from '$lib/desktop';
	import { shareDialogState } from '$lib/states/shareDialogState.svelte';
	import { overlayState } from '$lib/states/overlayState.svelte';
	import { phoneState } from '$lib/states/phoneState.svelte';
	import { membersPanelState } from '$lib/states/membersPanelState.svelte';
	import { shellViewportState } from '$lib/states/shellViewportState.svelte';
	import {
		expectedKeyboardHeight,
		isTextEntry,
		measuredKeyboardHeight,
		orientationOf,
		shellViewport,
		type RestingHeight
	} from '$lib/utils/shellViewport';
	import { readInstallEnv } from '$lib/utils/install';
	import { attachNavSwipe } from '$lib/utils/navSwipe';
	import LayoutInfo from '$lib/components/ui/shell/LayoutInfo.svelte';

	let { children } = $props();

	function toggleSearch(event: KeyboardEvent) {
		const modifier = event.ctrlKey || event.metaKey;
		if (event.key.toLowerCase() !== 'k' || !modifier || event.altKey || event.shiftKey) return;
		if (event.defaultPrevented || event.isComposing) return;
		event.preventDefault();
		if (overlayState.component === SearchDialog) overlayState.close();
		else if (!overlayState.isOpen) overlayState.open(SearchDialog);
	}

	/** How long a shrunk shell waits for the keyboard before giving up (hardware keyboard). */
	const ANTICIPATION_MS = 1000;

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

	const historyReady = $derived(usersState.loggedInUser != null && serversState.loaded);
	const serverIdsKey = $derived(Object.keys(serversState.servers).join(','));

	$effect(() => {
		if (!historyReady) return;
		void serverIdsKey;
		void resyncState.generation;
		untrack(() => historySyncState.request());
	});

	$effect(() => {
		void writePushPrefs({ sound: notificationsState.sound });
	});

	// A thread read anywhere (this tab, another device) no longer needs its notification.
	$effect(() => {
		void readThreadTags();
		untrack(() => void closeReadNotifications());
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

	let panes = $state<HTMLElement>();

	// Dragging sideways moves between the navigation and the page on a phone.
	$effect(() => {
		if (!panes || !phoneState.phone || !phoneState.touch) return;
		return attachNavSwipe(panes);
	});

	// The shell is locked to the screen: the document itself never scrolls.
	onMount(() => {
		const root = document.documentElement;
		root.classList.add('app-shell');
		return () => root.classList.remove('app-shell');
	});

	// The shell follows the visible viewport while the keyboard is up, so the composer sits on
	// top of it. iOS leaves the viewport short after the keyboard closes, so then it is ignored.
	$effect(() => {
		const viewport = window.visualViewport;
		if (!phoneState.touch || !viewport) return;
		const root = document.documentElement;
		const { standalone: installed, platform } = readInstallEnv();
		let resting: RestingHeight | null = null;
		let anticipated: number | null = null;
		let timers: ReturnType<typeof setTimeout>[] = [];
		let anticipationTimer: ReturnType<typeof setTimeout> | null = null;

		const stopAnticipating = () => {
			anticipated = null;
			if (anticipationTimer) clearTimeout(anticipationTimer);
			anticipationTimer = null;
		};

		const sync = (event: string, resetScroll = false) => {
			if (viewport.scale !== 1) return;
			const editableFocused = isTextEntry(document.activeElement);
			const next = shellViewport({
				installed,
				editableFocused,
				width: window.innerWidth,
				innerHeight: window.innerHeight,
				viewportHeight: viewport.height,
				resting,
				anticipated
			});
			resting = next.resting;
			const keyboard = measuredKeyboardHeight(next);
			if (keyboard != null) {
				stopAnticipating();
				shellViewportState.rememberKeyboardHeight(orientationOf(next.resting), keyboard);
			}
			root.style.setProperty('--app-height', `${next.height}px`);
			root.toggleAttribute('data-keyboard', next.keyboardOpen);
			shellViewportState.record({
				height: next.height,
				resting: next.resting.height,
				keyboardOpen: next.keyboardOpen,
				editableFocused,
				installed
			});
			shellViewportState.note({
				event,
				viewport: viewport.height,
				offsetTop: viewport.offsetTop,
				scrollY: window.scrollY,
				appHeight: next.height
			});
			// iOS scrolls the layout viewport to reveal a focused input; put it back.
			if (resetScroll || viewport.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
		};
		const onViewportResize = () => sync('vv-resize');
		const onViewportScroll = () => sync('vv-scroll');
		const onResize = () => sync('resize');
		const onOrientation = () => sync('orientation');
		const clearTimers = () => {
			timers.forEach(clearTimeout);
			timers = [];
		};
		// iOS pans the whole page to keep the focused field above the keyboard unless the
		// field is already there, so the shell shrinks before the keyboard starts to rise.
		const anticipate = (target: EventTarget | null) => {
			if (platform !== 'ios' || !resting || root.hasAttribute('data-keyboard')) return;
			if (!(target instanceof Element) || !isTextEntry(target)) return;
			const stored = shellViewportState.keyboardHeight(orientationOf(resting));
			anticipated = resting.height - expectedKeyboardHeight(resting, stored);
			anticipationTimer = setTimeout(() => {
				stopAnticipating();
				sync('timer');
			}, ANTICIPATION_MS);
		};
		const onFocusIn = (event: FocusEvent) => {
			clearTimers();
			anticipate(event.target);
			sync(anticipated == null ? 'focusin' : 'anticipate');
		};
		// iOS reports the final values late after the keyboard closes, and sometimes not at all.
		const onFocusOut = () => {
			clearTimers();
			stopAnticipating();
			sync('focusout');
			timers = [150, 400].map((delay) => setTimeout(() => sync('timer', true), delay));
		};

		sync('mount');
		viewport.addEventListener('resize', onViewportResize);
		viewport.addEventListener('scroll', onViewportScroll);
		window.addEventListener('resize', onResize);
		window.addEventListener('orientationchange', onOrientation);
		document.addEventListener('focusin', onFocusIn);
		document.addEventListener('focusout', onFocusOut);
		return () => {
			clearTimers();
			stopAnticipating();
			viewport.removeEventListener('resize', onViewportResize);
			viewport.removeEventListener('scroll', onViewportScroll);
			window.removeEventListener('resize', onResize);
			window.removeEventListener('orientationchange', onOrientation);
			document.removeEventListener('focusin', onFocusIn);
			document.removeEventListener('focusout', onFocusOut);
			root.style.removeProperty('--app-height');
			root.removeAttribute('data-keyboard');
			shellViewportState.clear();
		};
	});
</script>

<svelte:head><title>{title}</title></svelte:head>
<svelte:window onkeydown={toggleSearch} />

<div
	class="app-shell-root flex h-screen w-screen flex-col overflow-hidden bg-rail pr-[env(safe-area-inset-right,0px)] pl-[env(safe-area-inset-left,0px)]"
>
	<TopBar />
	{#if phoneState.phone}
		<VoiceDock compact />
	{/if}
	<div bind:this={panes} class="flex min-h-0 flex-1 max-md:relative">
		<!-- On a phone the navigation slides over the page, which stays mounted underneath. -->
		<div
			data-nav-pane
			class="flex min-h-0 max-md:absolute max-md:inset-0 max-md:z-10 max-md:bg-background max-md:transition-transform max-md:duration-200 max-md:motion-reduce:transition-none md:contents {phoneState.navOpen
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
		<div class="min-w-0 flex-1 bg-background" inert={phoneState.phone && phoneState.navOpen}>
			{@render children()}
		</div>
	</div>
</div>

{#if phoneState.touch && shellViewportState.showInfo}<LayoutInfo />{/if}
<Overlay />
<InstallPrompt />
<PushPrompt />
<MicPrompt />
<ShareScreenDialog />
