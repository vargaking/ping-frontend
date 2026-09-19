<script lang="ts">
	import UserSVG from '$lib/components/icons/UserSVG.svelte';
	import type { User } from '$lib/types/auth.types';

	export let user: User | null = null;
	export let src: string | null = null;
	export let size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
	export let className: string = '';

	const sizeClasses = {
		sm: 'w-8 h-8',
		md: 'w-10 h-10',
		lg: 'w-12 h-12',
		xl: 'w-24 h-24'
	};
</script>

<div
	class={`relative flex items-center justify-center overflow-hidden rounded-full bg-accent ${sizeClasses[size]} ${className}`}
>
	{#if src || user?.profile?.avatar}
		{@const imgSrc = src || user?.profile?.avatar}
		<img src={imgSrc} alt={user?.username || 'User Avatar'} class="h-full w-full object-cover" />
	{:else}
		<div class="text-surface-500 h-3/5 w-3/5">
			<UserSVG />
		</div>
	{/if}
</div>
