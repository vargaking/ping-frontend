<script lang="ts">
	import { usersState } from '$lib/states/usersState.svelte';
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import type { User } from '$lib/types/auth.types';

	const onlineUsers: User[] = $derived(
		Object.values(usersState.users).filter((u) => usersState.onlineUsers.has(u.id))
	);

	const offlineUsers: User[] = $derived(
		Object.values(usersState.users).filter((u) => !usersState.onlineUsers.has(u.id))
	);
</script>

{#snippet userItem(user: User, online: boolean)}
	<div
		class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-sidebar-accent {online ? '' : 'opacity-50'}"
	>
		<div class="relative">
			<Avatar {user} size="sm" />
			<span
				class="absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border-2 border-sidebar {online ? 'bg-green-500' : 'bg-gray-500'}"
			></span>
		</div>
		<span class="truncate text-sm">{user.username}</span>
	</div>
{/snippet}

{#snippet groupHeader(label: string, count: number)}
	<span
		class="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
	>
		{label} — {count}
	</span>
{/snippet}

<aside class="flex h-full w-60 shrink-0 flex-col border-l border-border bg-sidebar">
	<span class="block px-4 py-3 text-sm font-bold">Members</span>

	<div class="flex-1 overflow-y-auto px-2 pb-4">
		{@render groupHeader('Online', onlineUsers.length)}
		{#each onlineUsers as user (user.id)}
			{@render userItem(user, true)}
		{/each}

		{@render groupHeader('Offline', offlineUsers.length)}
		{#each offlineUsers as user (user.id)}
			{@render userItem(user, false)}
		{/each}
	</div>
</aside>
