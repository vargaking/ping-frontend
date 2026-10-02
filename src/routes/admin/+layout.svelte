<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { usersState } from '$lib/states/usersState.svelte';
	import { ArrowLeft } from 'lucide-svelte';

	let { children } = $props();

	const isAdmin = $derived(usersState.loggedInUser?.is_platform_admin === true);

	// UX only: every admin endpoint enforces this on the server.
	$effect(() => {
		if (!isAdmin) goto('/app/', { replaceState: true });
	});

	const nav = [
		{ href: '/admin/', label: 'Overview' },
		{ href: '/admin/waitlist/', label: 'Waitlist' }
	];
</script>

<svelte:head><title>Admin · zeta</title></svelte:head>

{#if isAdmin}
	<div class="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
		<header class="flex items-center gap-4 border-b border-border px-4 py-3">
			<a
				href="/app/"
				aria-label="Back to the app"
				class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<ArrowLeft size={18} strokeWidth={1.75} />
			</a>
			<h1 class="text-base font-semibold">Admin</h1>
			<nav class="flex gap-1" aria-label="Admin sections">
				{#each nav as item (item.href)}
					<a
						href={item.href}
						aria-current={page.url.pathname === item.href ? 'page' : undefined}
						class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {page
							.url.pathname === item.href
							? 'bg-accent text-foreground'
							: 'text-text-subtle hover:text-foreground'}"
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</header>
		<main class="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
			{@render children()}
		</main>
	</div>
{/if}
