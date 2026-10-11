<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import ActionContextMenu from '$lib/components/ui/context-menu/ActionContextMenu.svelte';
	import { profileCardState } from '$lib/states/profileCardState.svelte';
	import { serversState } from '$lib/states/serversState.svelte';
	import { memberActions } from '$lib/utils/menuActions';
	import type { User } from '$lib/types/auth.types';

	type Props = {
		user: User;
		online?: boolean;
		role?: string;
		serverId?: number | null;
	};

	let { user, online = false, role, serverId = null }: Props = $props();

	let button = $state<HTMLButtonElement | null>(null);

	const color = $derived(serversState.nameColorOf(serverId, user.id));
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
	<span
		class="min-w-0 flex-1 truncate text-sm font-medium {online ? '' : 'text-text-subtle'}"
		style:color
		style:opacity={color && !online ? 0.6 : undefined}
	>
		{user.username}
	</span>
	{#if role}
		<span class="shrink-0 text-[11px] text-text-subtle">{role}</span>
	{/if}
{/snippet}

<ActionContextMenu {actions}>
	{#snippet children(menuProps)}
		<button
			{...menuProps}
			bind:this={button}
			type="button"
			aria-haspopup="dialog"
			data-state={profileCardState.anchor === button
				? 'open'
				: (menuProps['data-state'] ?? 'closed')}
			class="flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-accent pointer-coarse:h-11"
			onclick={(e) =>
				profileCardState.toggle(
					e.currentTarget,
					{ kind: 'user', userId: user.id, serverId, fallbackName: user.username },
					{ side: 'left', align: 'start' }
				)}
		>
			{@render row()}
		</button>
	{/snippet}
</ActionContextMenu>
