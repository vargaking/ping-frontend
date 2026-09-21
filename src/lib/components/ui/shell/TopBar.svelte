<script lang="ts">
	import ConnectionPill from './ConnectionPill.svelte';
	import WorkspaceSwitcher from './WorkspaceSwitcher.svelte';
</script>

<header
	class="grid h-11 shrink-0 grid-cols-3 items-center border-b border-border bg-rail px-3 select-none"
>
	<!-- Left: wordmark -->
	<a href="/app" class="justify-self-start font-mono text-sm font-medium tracking-tight lowercase">
		zeta
	</a>

	<!-- Centre: workspace switcher + connection pill -->
	<div class="flex items-center gap-2 justify-self-center">
		<WorkspaceSwitcher />
		<ConnectionPill />
	</div>

	<!-- Right: intentionally empty (future desktop drag region) -->
	<div></div>
</header>
