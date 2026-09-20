<script lang="ts">
	import './layout.css';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { initializeAppData } from '$lib/utils/initializeAppData';
	import { usersState } from '$lib/states/usersState.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index';

	let { children } = $props();

	// Gate rendering until we know who the user is, so a protected route never
	// flashes its (empty) shell before the redirect to /login lands, and a
	// logged-in user doesn't see /login before bouncing to /app.
	let ready = $state(false);
	let redirecting = $state(false);

	const isPublic = (path: string) => path === '/' || path === '/login/';

	function resolveAuth(loggedIn: boolean) {
		const path = page.url.pathname;
		if (loggedIn && (path === '/' || path === '/login/')) {
			redirecting = true;
			window.location.href = '/app';
			return;
		}
		if (!loggedIn && !isPublic(path)) {
			redirecting = true;
			window.location.href = '/login/';
			return;
		}
		ready = true;
	}

	onMount(() => {
		initializeAppData()
			.then(() => resolveAuth(!!usersState.loggedInUser))
			.catch(() => resolveAuth(false));
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher defaultMode="dark" />
<Toaster position="bottom-right" />

{#if ready && !redirecting}
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
