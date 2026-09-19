<script lang="ts">
	import { ChevronsUpDown } from 'lucide-svelte';

	type Workspace = { id: string; name: string };

	type Props = {
		workspaces?: Workspace[];
		current?: Workspace | null;
	};

	// The alpha has a single implicit workspace, so the switcher stays hidden
	// (UI spec §4). It renders only once there is more than one workspace.
	let { workspaces = [], current = null }: Props = $props();

	const hasMultiple = $derived(workspaces.length > 1);
</script>

{#if hasMultiple}
	<button
		type="button"
		class="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[13px] transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		<span class="max-w-40 truncate">{current?.name ?? 'Workspace'}</span>
		<ChevronsUpDown size={14} strokeWidth={1.75} class="text-text-subtle" />
	</button>
	<span class="h-4 w-px bg-border" aria-hidden="true"></span>
{/if}
