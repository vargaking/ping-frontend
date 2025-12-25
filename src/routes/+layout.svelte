<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import deepCopy from '$lib/utils/deepCopy';
	import { PUBLIC_WS_URL } from '$env/static/public';
	import { initializeAppData } from '$lib/utils/initializeAppData';

	let { children } = $props();

	onMount(() => {
		initializeAppData()
			.then((user) => {
				if (user) {
					// If on login page, redirect to home
					if ($page.url.pathname === '/login') {
						window.location.href = '/app';
					}
				} else {
					// If not on login page, redirect to login
					if ($page.url.pathname !== '/login/' && $page.url.pathname !== '/') {
						console.log('Redirecting to login page', $page.url.pathname);
						window.location.href = '/login/';
					}
				}
			})
			.catch((error) => {
				console.error('Error initializing app:', error);
				// If not on login page, redirect to login
				if ($page.url.pathname !== '/login/' && $page.url.pathname !== '/') {
					console.log('Redirecting to login page', $page.url.pathname);
					window.location.href = '/login/';
				}
			});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher defaultMode="dark" />
{@render children()}
