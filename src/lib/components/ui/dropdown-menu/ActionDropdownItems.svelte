<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
	import { groupActions, type MenuAction } from '$lib/utils/menuActions';

	let { actions }: { actions: MenuAction[] } = $props();
</script>

{#each groupActions(actions) as group, i (i)}
	{#if i > 0}
		<DropdownMenu.Separator />
	{/if}
	{#each group as action (action.id)}
		<DropdownMenu.Item
			variant={action.destructive ? 'destructive' : 'default'}
			onclick={() => action.run()}
		>
			<action.icon size={16} strokeWidth={1.75} />
			{action.label}
		</DropdownMenu.Item>
	{/each}
{/each}
