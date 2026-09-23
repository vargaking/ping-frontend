<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = {
		label: string;
		icon?: Snippet;
		href?: string;
		active?: boolean;
		unread?: boolean;
		/** Number of mentions — shows a numeric badge instead of the unread dot. */
		mentions?: number;
		muted?: boolean;
		dragging?: boolean;
		children?: Snippet;
	} & HTMLAttributes<HTMLElement>;

	let {
		label,
		icon,
		href,
		active = false,
		unread = false,
		mentions = 0,
		muted = false,
		dragging = false,
		children,
		...rest
	}: Props = $props();

	const rowClass = $derived(
		`group flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
			active
				? 'bg-accent font-medium text-foreground'
				: muted
					? 'text-text-subtle hover:bg-card'
					: 'text-foreground hover:bg-card'
		} ${unread && !active ? 'font-semibold' : ''} ${dragging ? 'opacity-50' : ''}`
	);

	const stateLabel = $derived(
		mentions > 0 ? `, ${mentions} mention${mentions === 1 ? '' : 's'}` : unread ? ', unread' : ''
	);
</script>

{#snippet inner()}
	{#if icon}
		<span class="shrink-0 text-text-subtle">{@render icon()}</span>
	{/if}
	<span class="min-w-0 flex-1 truncate text-left">{label}</span>
	{#if stateLabel}
		<span class="sr-only">{stateLabel}</span>
	{/if}
	{#if mentions > 0}
		<span
			class="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-lg bg-primary px-1 font-mono text-[10px] leading-none font-semibold text-primary-foreground"
			aria-hidden="true"
		>
			{mentions > 99 ? '99+' : mentions}
		</span>
	{:else if unread}
		<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
	{/if}
	{@render children?.()}
{/snippet}

{#if href}
	<a {href} class={rowClass} aria-current={active ? 'page' : undefined} {...rest}>
		{@render inner()}
	</a>
{:else}
	<button type="button" class={rowClass} {...rest}>
		{@render inner()}
	</button>
{/if}
