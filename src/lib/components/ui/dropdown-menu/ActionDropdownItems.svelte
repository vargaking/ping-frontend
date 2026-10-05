<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
	import { groupActions, type MenuEntry } from '$lib/utils/menuActions';

	let { actions }: { actions: MenuEntry[] } = $props();
</script>

{#each groupActions(actions) as group, i (i)}
	{#if i > 0}
		<DropdownMenu.Separator />
	{/if}
	{#each group as action (action.id)}
		{#if 'toggles' in action}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					<action.icon size={16} strokeWidth={1.75} />
					{action.label}
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent class="max-h-72 w-48 overflow-y-auto">
					{#each action.toggles as toggle (toggle.id)}
						<DropdownMenu.CheckboxItem
							checked={toggle.checked}
							disabled={toggle.disabled}
							closeOnSelect={false}
							onCheckedChange={(checked) => toggle.toggle(checked)}
						>
							<span
								aria-hidden="true"
								class="h-2 w-2 shrink-0 rounded-full {toggle.color ? '' : 'bg-text-subtle'}"
								style:background-color={toggle.color}
							></span>
							<span class="truncate">{toggle.label}</span>
						</DropdownMenu.CheckboxItem>
					{/each}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		{:else}
			<DropdownMenu.Item
				variant={action.destructive ? 'destructive' : 'default'}
				onclick={() => action.run()}
			>
				<action.icon size={16} strokeWidth={1.75} />
				{action.label}
			</DropdownMenu.Item>
		{/if}
	{/each}
{/each}
