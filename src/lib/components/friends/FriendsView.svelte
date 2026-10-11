<script lang="ts">
	import ErrorState from '$lib/components/ui/feedback/ErrorState.svelte';
	import LoadingList from '$lib/components/ui/feedback/LoadingList.svelte';
	import { friendsState } from '$lib/states/friendsState.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { newestFirst, sortFriends } from '$lib/utils/friends';
	import AddFriendForm from './AddFriendForm.svelte';
	import FriendRow from './FriendRow.svelte';

	const friends = $derived(
		sortFriends(
			friendsState.friends.map((entry) => ({
				...entry,
				user: usersState.users[entry.user.id] ?? entry.user
			})),
			(id) => usersState.isOnline(id)
		)
	);
	const incoming = $derived(newestFirst(friendsState.incoming));
	const outgoing = $derived(newestFirst(friendsState.outgoing));
</script>

<div class="flex h-full min-h-0 flex-col">
	<header
		class="flex h-14 shrink-0 items-center border-b border-border px-6 max-md:h-12 max-md:px-3"
	>
		<h1 class="text-[15px] font-semibold">Friends</h1>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto scrollbar-stable">
		<div class="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-6 max-md:px-3 max-md:py-4">
			<AddFriendForm />

			{#if !friendsState.loaded && !friendsState.loadFailed}
				<LoadingList rows={4} avatar />
			{:else if !friendsState.loaded}
				<ErrorState
					title="Couldn’t load friends"
					description="There was a problem reading your friends list."
					onRetry={() => friendsState.fetch()}
				/>
			{:else}
				{#if incoming.length > 0}
					<section aria-labelledby="incoming-requests" class="flex flex-col gap-1">
						<h2 id="incoming-requests" class="px-2 text-[13px] font-medium text-text-label">
							Incoming requests
						</h2>
						{#each incoming as entry (entry.user.id)}
							<FriendRow {entry} />
						{/each}
					</section>
				{/if}

				{#if outgoing.length > 0}
					<section aria-labelledby="outgoing-requests" class="flex flex-col gap-1">
						<h2 id="outgoing-requests" class="px-2 text-[13px] font-medium text-text-label">
							Outgoing requests
						</h2>
						{#each outgoing as entry (entry.user.id)}
							<FriendRow {entry} />
						{/each}
					</section>
				{/if}

				<section aria-labelledby="friends-list" class="flex flex-col gap-1">
					<h2 id="friends-list" class="px-2 text-[13px] font-medium text-text-label">Friends</h2>
					{#each friends as entry (entry.user.id)}
						<FriendRow {entry} />
					{:else}
						<p class="px-2 py-1 text-xs text-text-subtle">
							No friends yet. Add someone by username, or from their profile card.
						</p>
					{/each}
				</section>
			{/if}
		</div>
	</div>
</div>
