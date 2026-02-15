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

<div class={`relative rounded-full overflow-hidden bg-accent flex items-center justify-center ${sizeClasses[size]} ${className}`}>
	{#if src || user?.profile?.avatar}
		{@const imgSrc = src || user?.profile?.avatar}
		<img
			src={imgSrc?.startsWith('blob:') ? imgSrc : `${imgSrc}?v=${new Date().getTime()}`}
			alt={user?.username || 'User Avatar'}
			class="w-full h-full object-cover"
		/>
	{:else}
		<div class="w-3/5 h-3/5 text-surface-500">
			<UserSVG />
		</div>
	{/if}
</div>
