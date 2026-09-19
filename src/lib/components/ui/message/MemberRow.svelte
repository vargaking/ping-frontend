<script lang="ts">
	import Avatar from '$lib/components/ui/avatar/Avatar.svelte';
	import type { User } from '$lib/types/auth.types';

	type Props = {
		user: User;
		online?: boolean;
		role?: string;
	};

	let { user, online = false, role }: Props = $props();
</script>

<div class="flex h-10 items-center gap-2.5 rounded-lg px-2 hover:bg-accent">
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
</div>
