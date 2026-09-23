<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import type { User } from '$lib/types/auth.types';

	let { user }: { user: User | null } = $props();
</script>

<header class="flex h-14 shrink-0 items-center gap-3 border-b border-border pr-4 pl-6">
	{#if user}
		<Avatar {user} size="sm" rounded="rounded-lg" className="h-7 w-7" />
		<h1 class="truncate text-[15px] font-semibold">{user.username}</h1>
	{/if}
</header>
