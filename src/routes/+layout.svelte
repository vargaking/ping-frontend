<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { onMount } from 'svelte';
	import { getMe } from '$lib/requests/auth/me';
	import { UserInitedStore, UserStore } from '$lib/stores/userStore';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { getUserServers } from '$lib/requests/servers/getUserServers';
	import deepCopy from '$lib/utils/deepCopy';
	import { PUBLIC_WS_URL } from '$env/static/public';

	let { children } = $props();

	onMount(() => {
		getMe()
			.then((user) => {
				console.log('Fetched user:', user);
				if (user) {
					UserStore.set(user);

					UserInitedStore.set(true);

					// If on login page, redirect to home
					if ($page.url.pathname === '/login') {
						window.location.href = '/';
					}
				}
			})
			.catch((error) => {
				console.error('Error fetching user:', error);
				UserStore.set(null);

				// If not on login page, redirect to login
				if ($page.url.pathname !== '/login/') {
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
