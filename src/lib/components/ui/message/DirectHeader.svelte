<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import { profileCardState } from '$lib/states/profileCardState.svelte';
	import type { User } from '$lib/types/auth.types';

	let { user }: { user: User | null } = $props();
</script>

<header
	class="flex h-14 shrink-0 items-center gap-3 border-b border-border pr-4 pl-6 max-md:h-12 max-md:px-3"
>
	{#if user}
		{@const person = user}
		<h1 class="min-w-0 text-[15px] font-semibold">
			<button
				type="button"
				aria-haspopup="dialog"
				class="flex max-w-full items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				onclick={(e) =>
					profileCardState.toggle(
						e.currentTarget,
						{ kind: 'user', userId: person.id, serverId: null, fallbackName: person.username },
						{ side: 'bottom', align: 'start' }
					)}
			>
				<Avatar {user} size="sm" rounded="rounded-lg" className="h-7 w-7" />
				<span class="truncate">{user.username}</span>
			</button>
		</h1>
	{/if}
</header>
