<script lang="ts">
	import Logo from '$lib/components/brand/Logo.svelte';
	import { frameless } from '$lib/desktop';
	import ConnectionPill from './ConnectionPill.svelte';
	import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';
</script>

<header
	class={[
		'grid h-11 shrink-0 grid-cols-3 items-center border-b border-border bg-rail px-3 select-none',
		frameless && 'app-drag'
	]}
	style={frameless
		? 'padding-left: max(0.75rem, var(--titlebar-inset-left)); padding-right: var(--titlebar-controls)'
		: undefined}
>
	<!-- Left: wordmark -->
	<a
		href="/app"
		class="flex items-center gap-1.5 justify-self-start font-mono text-sm font-medium tracking-tight lowercase"
	>
		<Logo />
		zeta
	</a>

	<!-- Centre: workspace switcher + connection pill -->
	<div class="flex items-center gap-2 justify-self-center">
		<WorkspaceSwitcher />
		<ConnectionPill />
	</div>

	<!-- Right: empty, so the desktop window can be dragged by it -->
	<div></div>
</header>
