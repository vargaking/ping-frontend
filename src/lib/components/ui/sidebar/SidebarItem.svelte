<script lang="ts">
	import type { SvelteComponent } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip/index';

	export let icon: typeof SvelteComponent | null = null;
	export let label: string;
	export let href: string;
</script>

<Tooltip.Provider>
	<Tooltip.Root delayDuration={0}>
		<Tooltip.Trigger>
			<a
				{href}
				class="sidebar-item relative flex h-12 w-12 items-center justify-center rounded-xl bg-secondary p-3.5 hover:bg-secondary/80"
			>
				{#if icon}
					<svelte:component this={icon} />
				{:else}
					<span>{label[0]}</span>
				{/if}
			</a>
		</Tooltip.Trigger>
		<Tooltip.Content side="right" class="bg-accent text-primary" arrowClasses="bg-accent">
			<p>{label}</p>
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
