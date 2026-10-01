<script lang="ts">
	import UserSVG from '$lib/components/icons/UserSVG.svelte';
	import type { User } from '$lib/types/auth.types';
	import { avatarToneClass, initials } from '$lib/utils/avatar';

	type Props = {
		user?: User | null;
		src?: string | null;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		/** Tailwind rounding utility, e.g. 'rounded-full', 'rounded-[10px]'. */
		rounded?: string;
		className?: string;
	};

	let {
		user = null,
		src = null,
		size = 'md',
		rounded = 'rounded-full',
		className = ''
	}: Props = $props();

	const sizeClasses = {
		sm: 'w-8 h-8',
		md: 'w-10 h-10',
		lg: 'w-12 h-12',
		xl: 'w-24 h-24'
	};

	const textClasses = {
		sm: 'text-xs',
		md: 'text-sm',
		lg: 'text-base',
		xl: 'text-3xl'
	};

	const imgSrc = $derived(src || user?.profile?.avatar);
	const toneClass = $derived(user && !imgSrc ? avatarToneClass(user.id) : 'bg-accent');
</script>

<div
	class={`relative flex items-center justify-center overflow-hidden ${toneClass} ${rounded} ${sizeClasses[size]} ${className}`}
>
	{#if imgSrc}
		<img src={imgSrc} alt={user?.username || 'User avatar'} class="h-full w-full object-cover" />
	{:else if user}
		<span class="font-semibold select-none {textClasses[size]}">{initials(user.username)}</span>
	{:else}
		<div class="h-3/5 w-3/5 text-text-subtle">
			<UserSVG />
		</div>
	{/if}
</div>
