<script lang="ts">
	import './layout.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import faviconUnread from '$lib/assets/favicon-unread.svg';
	import logo from '$lib/brand/logo.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { initializeAppData } from '$lib/utils/initializeAppData';
	import { usersState } from '$lib/states/usersState.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import { installState } from '$lib/states/installState.svelte';
	import { safeNext } from '$lib/auth/session';
	import MetaTags from '$lib/components/MetaTags.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index';
	import { desktop, frameless } from '$lib/desktop';
	import DesktopTitleBar from '$lib/components/ui/shell/DesktopTitleBar.svelte';
	import { primeNotificationSound } from '$lib/utils/notificationSound';
	import { SITE_NAME } from '$lib/meta';
	import { setAppBadge } from '$lib/utils/appBadge';

	let { children } = $props();

	const icon = $derived(usersState.loggedInUser && unreadState.anyUnread ? faviconUnread : favicon);

	// The AudioContext can only be resumed from a user gesture (autoplay policy).
	onMount(() => {
		window.addEventListener('pointerdown', primeNotificationSound, { once: true });
		window.addEventListener('keydown', primeNotificationSound, { once: true });
	});

	onMount(() => {
		if (frameless) document.documentElement.dataset.frameless = '';
	});

	// The install prompt event can fire before the app shell mounts.
	onMount(() => installState.attach());

	// A push notification click asks an already-open tab to move to its thread.
	onMount(() => {
		if (!('serviceWorker' in navigator)) return;
		const onMessage = (event: MessageEvent) => {
			if (event.data?.type !== 'navigate') return;
			const url = safeNext(event.data.url);
			if (url) goto(url);
		};
		navigator.serviceWorker.addEventListener('message', onMessage);
		return () => navigator.serviceWorker.removeEventListener('message', onMessage);
	});

	// Routes a logged-out user may see. Everything else is protected. `/invite/*`
	// is public so an invite link renders instead of bouncing to /login, and
	// `/register` is public so direct navigation there stays put.
	function isPublicPath(path: string): boolean {
		const p = path.replace(/\/+$/, '') || '/';
		if (p === '/' || p === '/login' || p === '/register') return true;
		if (p === '/invite' || p.startsWith('/invite/')) return true;
		return false;
	}

	// Pages a logged-in user has no reason to sit on — send them into the app.
	function isAuthOnlyPath(path: string): boolean {
		const p = path.replace(/\/+$/, '') || '/';
		return p === '/' || p === '/login' || p === '/register';
	}

	// True once getMe() has resolved, so the guard doesn't act on an unknown
	// auth state. `loggedIn` stays reactive to logout / 401 teardown.
	let authChecked = $state(false);
	const loggedIn = $derived(!!usersState.loggedInUser);

	// Gate rendering until we've resolved auth AND the current path is allowed,
	// so a protected route never flashes its shell before the redirect lands and
	// a logged-in user never sees /login before bouncing to /app.
	let ready = $state(false);

	let unreachable = $state(false);

	const inApp = $derived(page.route.id?.startsWith('/app') ?? false);

	// When the server can't be reached, stay on the loading screen and keep trying
	// instead of treating the user as logged out.
	onMount(() => {
		const retryDelays = [2000, 4000, 8000, 10000];
		let attempt = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let running = false;
		let finished = false;

		async function load() {
			if (running || finished) return;
			running = true;
			clearTimeout(timer);
			const result = await initializeAppData();
			running = false;
			if (finished) return;
			if (result === 'ok') {
				finished = true;
				unreachable = false;
				authChecked = true;
				return;
			}
			unreachable = true;
			timer = setTimeout(load, retryDelays[Math.min(attempt++, retryDelays.length - 1)]);
		}

		window.addEventListener('online', load);
		void load();
		return () => {
			finished = true;
			clearTimeout(timer);
			window.removeEventListener('online', load);
		};
	});

	$effect(() => {
		desktop?.setUnread({
			count: loggedIn ? unreadState.badgeTotal : 0,
			unread: loggedIn && unreadState.anyUnread
		});
	});

	$effect(() => {
		if (!desktop) setAppBadge(loggedIn ? unreadState.badgeTotal : 0);
	});

	$effect(() => {
		if (!authChecked) return;

		const url = page.url;
		const path = url.pathname;

		if (loggedIn) {
			if (isAuthOnlyPath(path)) {
				const next = safeNext(url.searchParams.get('next'));
				const dest = next && !isAuthOnlyPath(next) ? next : '/app';
				ready = false;
				goto(dest, { replaceState: true });
				return;
			}
			ready = true;
			return;
		}

		if (isPublicPath(path) && !(desktop && path === '/')) {
			ready = true;
			return;
		}

		// Protected route while logged out: remember where they were headed.
		ready = false;
		const target = path === '/' ? null : safeNext(path + url.search);
		goto(target ? `/login?next=${encodeURIComponent(target)}` : '/login', { replaceState: true });
	});
</script>

<svelte:head><link rel="icon" href={icon} /></svelte:head>
{#if page.data.meta}<MetaTags meta={page.data.meta} />{/if}
<ModeWatcher defaultMode="dark" />
<Toaster position="bottom-right" />

{#snippet content()}
	{#if ready}
		{@render children()}
	{:else}
		<div class="flex h-screen w-screen items-center justify-center bg-background">
			<div class="flex flex-col items-center gap-3">
				<img src={logo} alt="" class="h-11 w-11 animate-pulse" />
				{#if unreachable}
					<span class="text-sm text-muted-foreground">Can't reach {SITE_NAME}. Reconnecting…</span>
				{:else}
					<span class="sr-only">Loading…</span>
				{/if}
			</div>
		</div>
	{/if}
{/snippet}

{#if frameless && !(ready && inApp)}
	<div class="flex h-screen w-screen flex-col">
		<DesktopTitleBar />
		<div class="desktop-page relative min-h-0 flex-1 overflow-auto">
			{@render content()}
		</div>
	</div>
{:else}
	{@render content()}
{/if}
