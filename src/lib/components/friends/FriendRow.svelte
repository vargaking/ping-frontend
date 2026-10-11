<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import type { User } from '$lib/types/auth.types';
	import type { FriendEntry } from '$lib/types/friend.types';
	import { acceptFriend, cancelFriend, declineFriend } from '$lib/utils/friendActions';
	import { openDirectMessage } from '$lib/utils/menuActions';

	let { entry }: { entry: FriendEntry } = $props();

	// Prefer the live user record so renames and avatar changes show up.
	const user = $derived(usersState.users[entry.user.id] ?? entry.user);
	const online = $derived(usersState.isOnline(user.id));

	let busy = $state(false);

	async function run(action: (user: User) => Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await action(user);
		} finally {
			busy = false;
		}
	}
</script>

{#if entry.state === 'friends'}
	<button
		type="button"
		aria-label="{user.username}, {online ? 'online' : 'offline'}"
		onclick={() => openDirectMessage(user.id)}
		class="group flex h-12 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-14"
	>
		<div class="relative shrink-0">
			<Avatar {user} size="sm" rounded="rounded-lg" />
			<span
				class="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-2 ring-background group-hover:ring-card {online
					? 'bg-online'
					: 'bg-offline'}"
				aria-hidden="true"
			></span>
		</div>
		<span class="min-w-0 flex-1 truncate text-sm text-foreground">{user.username}</span>
	</button>
{:else}
	<div class="flex h-12 w-full items-center gap-2.5 rounded-lg px-2 pointer-coarse:h-14">
		<Avatar {user} size="sm" rounded="rounded-lg" />
		<span class="min-w-0 flex-1 truncate text-sm text-foreground">{user.username}</span>
		<div class="flex shrink-0 items-center gap-1.5">
			{#if entry.state === 'incoming'}
				<Button
					size="sm"
					aria-label="Accept {user.username}"
					disabled={busy}
					onclick={() => run(acceptFriend)}
				>
					Accept
				</Button>
				<Button
					variant="secondary"
					size="sm"
					aria-label="Decline {user.username}"
					disabled={busy}
					onclick={() => run(declineFriend)}
				>
					Decline
				</Button>
			{:else}
				<Button
					variant="secondary"
					size="sm"
					aria-label="Cancel request to {user.username}"
					disabled={busy}
					onclick={() => run(cancelFriend)}
				>
					Cancel
				</Button>
			{/if}
		</div>
	</div>
{/if}
