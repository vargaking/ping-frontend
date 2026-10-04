<script lang="ts">
	import { usersState } from '$lib/states/usersState.svelte';
	import type { User } from '$lib/types/auth.types';
	import { serversState } from '$lib/states/serversState.svelte';
	import MemberRow from '$lib/components/ui/message/MemberRow.svelte';

	const serverMembers = $derived(
		(serversState.selectedServer?.members ?? []).map((m) => usersState.users[m.id] ?? m)
	);

	const serverId = $derived(serversState.selectedServer?.id);

	function roleLabel(user: User) {
		if (serverId == null) return undefined;
		if (serversState.selectedServer?.owner_id === user.id) return 'Owner';
		return serversState.rolesOf(serverId, user.id)[0]?.name;
	}

	const onlineUsers: User[] = $derived(
		serverMembers.filter((u) => usersState.onlineUsers.has(u.id))
	);
	const offlineUsers: User[] = $derived(
		serverMembers.filter((u) => !usersState.onlineUsers.has(u.id))
	);
</script>

<aside
	aria-label="Members"
	class="flex h-full w-[232px] shrink-0 flex-col border-l border-border bg-sidebar"
>
	<div class="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5 scrollbar-stable">
		{#if onlineUsers.length > 0}
			<section>
				<h2 class="mb-1 px-2 text-xs font-medium text-text-subtle">
					Online — {onlineUsers.length}
				</h2>
				{#each onlineUsers as user (user.id)}
					<MemberRow {user} online role={roleLabel(user)} {serverId} />
				{/each}
			</section>
		{/if}

		{#if offlineUsers.length > 0}
			<section>
				<h2 class="mb-1 px-2 text-xs font-medium text-text-subtle">
					Offline — {offlineUsers.length}
				</h2>
				{#each offlineUsers as user (user.id)}
					<MemberRow {user} role={roleLabel(user)} {serverId} />
				{/each}
			</section>
		{/if}

		{#if serverMembers.length === 0}
			<p class="px-2 text-sm text-text-subtle">No members to show.</p>
		{/if}
	</div>
</aside>
