<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { initializeAppData } from '$lib/utils/initializeAppData';
	import { usersState } from '$lib/states/usersState.svelte';

	let { children } = $props();

	onMount(() => {
		initializeAppData()
			.then(() => {
				// If on login page, redirect to home
				if (usersState.loggedInUser) {
					if (page.url.pathname === '/login/' || page.url.pathname === '/') {
						console.log('Redirecting to home page', page.url.pathname);
						window.location.href = '/app';
					}
				} else {
					if (page.url.pathname !== '/login/' && page.url.pathname !== '/') {
						console.log('Redirecting to login page', page.url.pathname);
						window.location.href = '/login/';
					}
				}
			})
			.catch(() => {
				// If not on login page, redirect to login
				if (page.url.pathname !== '/login/' && page.url.pathname !== '/') {
					console.log('Redirecting to login page', page.url.pathname);
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
