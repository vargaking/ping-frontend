<script lang="ts">
	import { Menu } from 'lucide-svelte';
	import Logo from '$lib/components/brand/Logo.svelte';
	import { frameless } from '$lib/desktop';
	import { phoneState } from '$lib/states/phoneState.svelte';
	import { unreadState } from '$lib/states/unreadState.svelte';
	import ConnectionPill from './ConnectionPill.svelte';
	import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';

	const showNavButton = $derived(phoneState.phone && !phoneState.navOpen);

	// An account with no conversations or servers has no row to tap, so the wordmark
	// doubles as the way out of the navigation.
	function leaveNavigation(event: MouseEvent) {
		if (!phoneState.navCoversContent) return;
		event.preventDefault();
		phoneState.closeNav();
	}
</script>

<!-- iOS only drops its blur over the top edge when a fixed or sticky bar sits there. -->
<header
	class={[
		'grid h-[calc(2.75rem+env(safe-area-inset-top,0px))] shrink-0 grid-cols-3 items-center border-b border-border bg-rail px-3 pt-[env(safe-area-inset-top,0px)] select-none max-md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] pointer-coarse:sticky pointer-coarse:top-0',
		frameless && 'app-drag'
	]}
	style={frameless
		? 'padding-left: max(0.75rem, var(--titlebar-inset-left)); padding-right: var(--titlebar-controls)'
		: undefined}
>
	<!-- Left: wordmark, or on a phone showing a page, the way back to the navigation -->
	{#if showNavButton}
		<button
			type="button"
			aria-label="Open navigation"
			onclick={() => phoneState.openNav()}
			class="relative flex h-9 w-9 items-center justify-center justify-self-start rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<Menu size={20} strokeWidth={1.75} />
			{#if unreadState.anyUnread}
				<span
					class="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary ring-2 ring-rail"
					aria-hidden="true"
				></span>
			{/if}
		</button>
	{:else}
		<a
			href="/app"
			onclick={leaveNavigation}
			class="flex items-center gap-1.5 justify-self-start font-mono text-sm font-medium tracking-tight lowercase"
		>
			<Logo />
			zeta
		</a>
	{/if}

	<!-- Centre: workspace switcher + connection pill -->
	<div class="flex items-center gap-2 justify-self-center">
		<WorkspaceSwitcher />
		<ConnectionPill />
	</div>

	<!-- Right: empty, so the desktop window can be dragged by it -->
	<div></div>
</header>
