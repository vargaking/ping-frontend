<script lang="ts">
	import { usersState } from '$lib/states/usersState.svelte';
	import type { User } from '$lib/types/auth.types';
	import { serversState } from '$lib/states/serversState.svelte';
	import MemberRow from '$lib/components/ui/message/MemberRow.svelte';

	const serverMembers = $derived(
		(serversState.selectedServer?.members ?? []).map((m) => usersState.users[m.id] ?? m)
	);

	const serverId = $derived(serversState.selectedServer?.id);
	// Refetch when someone joins or leaves so new members get their roles.
	const memberCount = $derived(serversState.selectedServer?.members?.length ?? 0);

	$effect(() => {
		void memberCount;
		if (serverId != null) {
			serversState.loadRoster(serverId).catch((e) => console.error('Failed to load roles', e));
		}
	});

	function roleLabel(user: User) {
		return serverId != null ? serversState.roleNames(serverId, user.id)[0] : undefined;
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
					<MemberRow {user} online role={roleLabel(user)} />
				{/each}
			</section>
		{/if}

		{#if offlineUsers.length > 0}
			<section>
				<h2 class="mb-1 px-2 text-xs font-medium text-text-subtle">
					Offline — {offlineUsers.length}
				</h2>
				{#each offlineUsers as user (user.id)}
					<MemberRow {user} role={roleLabel(user)} />
				{/each}
			</section>
		{/if}

		{#if serverMembers.length === 0}
			<p class="px-2 text-sm text-text-subtle">No members to show.</p>
		{/if}
	</div>
</aside>
