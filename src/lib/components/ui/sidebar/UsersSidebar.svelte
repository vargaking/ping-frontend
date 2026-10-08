<script lang="ts">
	import { usersState } from '$lib/states/usersState.svelte';
	import type { User } from '$lib/types/auth.types';
	import { serversState } from '$lib/states/serversState.svelte';
	import MemberRow from '$lib/components/ui/message/MemberRow.svelte';
	import { membersPanelState } from '$lib/states/membersPanelState.svelte';
	import { X } from 'lucide-svelte';

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

<!-- A side panel on desktop, a full-screen sheet on a phone. -->
<aside
	aria-label="Members"
	class="flex h-full w-[232px] shrink-0 flex-col border-l border-border bg-sidebar max-md:fixed max-md:inset-0 max-md:z-30 max-md:h-auto max-md:w-auto max-md:border-l-0 max-md:pr-[env(safe-area-inset-right,0px)] max-md:pl-[env(safe-area-inset-left,0px)]"
>
	<header
		class="hidden h-[calc(3rem+env(safe-area-inset-top,0px))] shrink-0 items-center justify-between border-b border-border pt-[env(safe-area-inset-top,0px)] pr-1.5 pl-4 max-md:flex"
	>
		<h2 class="text-[15px] font-semibold">Members</h2>
		<button
			type="button"
			aria-label="Close members"
			onclick={() => membersPanelState.closeSheet()}
			class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<X size={18} strokeWidth={1.75} />
		</button>
	</header>
	<div
		class="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5 scrollbar-stable max-md:min-h-0 max-md:pb-[calc(1.25rem+var(--safe-bottom))]"
	>
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
