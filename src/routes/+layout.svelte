<script lang="ts">
	import './layout.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import faviconUnread from '$lib/assets/favicon-unread.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { initializeAppData } from '$lib/utils/initializeAppData';
	import { usersState } from '$lib/states/usersState.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import { safeNext } from '$lib/auth/session';
	import { Toaster } from '$lib/components/ui/sonner/index';
	import { primeNotificationSound } from '$lib/utils/notificationSound';

	let { children } = $props();

	// "(N) zeta" when there's something unread, else just "zeta".
	const badgeTotal = $derived(unreadState.badgeTotal);
	const title = $derived(
		badgeTotal > 0 ? `(${badgeTotal > 99 ? '99+' : badgeTotal}) zeta` : 'zeta'
	);
	const icon = $derived(usersState.loggedInUser && unreadState.anyUnread ? faviconUnread : favicon);

	// The AudioContext can only be resumed from a user gesture (autoplay policy).
	onMount(() => {
		window.addEventListener('pointerdown', primeNotificationSound, { once: true });
		window.addEventListener('keydown', primeNotificationSound, { once: true });
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

	onMount(() => {
		initializeAppData().finally(() => {
			authChecked = true;
		});
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

		if (isPublicPath(path)) {
			ready = true;
			return;
		}

		// Protected route while logged out: remember where they were headed.
		ready = false;
		const target = safeNext(path + url.search);
		goto(target ? `/login?next=${encodeURIComponent(target)}` : '/login', { replaceState: true });
	});
</script>

<svelte:head>
	<title>{title}</title>
	<link rel="icon" href={icon} />
</svelte:head>
<ModeWatcher defaultMode="dark" />
<Toaster position="bottom-right" />

{#if ready}
	{@render children()}
{:else}
	<div class="flex h-screen w-screen items-center justify-center bg-background">
		<div class="flex flex-col items-center gap-3">
			<div
				class="flex h-11 w-11 animate-pulse items-center justify-center rounded-xl bg-primary/15 font-mono text-lg font-semibold text-primary"
				aria-hidden="true"
			>
				z
			</div>
			<span class="sr-only">Loading…</span>
		</div>
	</div>
{/if}
