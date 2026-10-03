<script lang="ts">
	import Logo from '$lib/components/brand/Logo.svelte';
</script>

<header
	class="app-drag flex h-11 shrink-0 items-center border-b border-border bg-rail select-none"
	style="padding-left: max(0.75rem, var(--titlebar-inset-left)); padding-right: var(--titlebar-controls)"
>
	<span class="flex items-center gap-1.5 font-mono text-sm font-medium tracking-tight lowercase">
		<Logo />
		zeta
	</span>
</header>
