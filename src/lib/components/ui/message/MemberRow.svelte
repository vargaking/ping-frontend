<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import ActionContextMenu from '$lib/components/ui/context-menu/ActionContextMenu.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index';
	import ActionDropdownItems from '$lib/components/ui/dropdown-menu/ActionDropdownItems.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { memberActions } from '$lib/utils/menuActions';
	import type { User } from '$lib/types/auth.types';

	type Props = {
		user: User;
		online?: boolean;
		role?: string;
	};

	let { user, online = false, role }: Props = $props();

	const isMe = $derived(usersState.loggedInUser?.id === user.id);
	const actions = $derived(memberActions(serversState.selectedServerId, user));
</script>

{#snippet row()}
	<div class="relative shrink-0">
		<Avatar {user} size="sm" rounded="rounded-lg" className="h-7 w-7" />
		<span
			class="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-2 ring-background {online
				? 'bg-online'
				: 'bg-offline'}"
			aria-hidden="true"
		></span>
	</div>
	<span class="min-w-0 flex-1 truncate text-sm font-medium {online ? '' : 'text-text-subtle'}">
		{user.username}
	</span>
	{#if role}
		<span class="shrink-0 text-[11px] text-text-subtle">{role}</span>
	{/if}
{/snippet}

<ActionContextMenu {actions}>
	{#snippet children(menuProps)}
		{#if isMe}
			<div {...menuProps} class="flex h-10 items-center gap-2.5 rounded-lg px-2 hover:bg-accent">
				{@render row()}
			</div>
		{:else}
			<div {...menuProps}>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-accent"
					>
						{@render row()}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content side="left" align="start" class="w-48">
						<ActionDropdownItems {actions} />
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/if}
	{/snippet}
</ActionContextMenu>
