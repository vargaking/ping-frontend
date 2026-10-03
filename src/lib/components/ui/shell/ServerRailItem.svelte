<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip/index';
	import { serverToneClass } from '$lib/utils/avatar';
	import ServerIcon from '$lib/components/ui/avatar/ServerIcon.svelte';
	import ActionContextMenu from '$lib/components/ui/context-menu/ActionContextMenu.svelte';
	import type { MenuAction } from '$lib/utils/menuActions';
	import { mergeProps } from 'bits-ui';

	type Props = {
		name: string;
		serverId: number | string;
		href: string;
		iconUrl?: string | null;
		iconText?: string | null;
		iconTone?: number | null;
		active?: boolean;
		/** Unread but no mentions — shows a dot. */
		unread?: boolean;
		/** Number of mentions — shows a numeric badge (overrides the dot). */
		mentions?: number;
		muted?: boolean;
		actions?: MenuAction[];
	};

	let {
		name,
		serverId,
		href,
		iconUrl = null,
		iconText = null,
		iconTone = null,
		active = false,
		unread = false,
		mentions = 0,
		muted = false,
		actions = []
	}: Props = $props();

	const toneClass = $derived(serverToneClass(serverId, iconText, iconTone));
	const stateClasses = $derived(
		active
			? 'bg-primary/15 text-primary'
			: muted
				? 'bg-card text-text-subtle hover:bg-accent'
				: 'bg-card text-text-label hover:bg-accent hover:text-foreground'
	);
	const label = $derived(
		`${name}${mentions > 0 ? `, ${mentions} mention${mentions === 1 ? '' : 's'}` : unread ? ', unread messages' : ''}`
	);
</script>

<Tooltip.Provider>
	<Tooltip.Root delayDuration={0}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<ActionContextMenu {actions}>
					{#snippet children(menuProps)}
						<a
							{href}
							aria-label={label}
							aria-current={active ? 'page' : undefined}
							class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-transparent text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-rail focus-visible:outline-none {iconUrl
								? stateClasses
								: `${toneClass} ${active ? 'ring-2 ring-primary' : muted ? 'opacity-60 hover:opacity-100' : 'hover:brightness-125'}`}"
							{...mergeProps(props, menuProps)}
						>
							<!-- active accent bar, flush to the rail's left edge -->
							{#if active}
								<span
									class="absolute top-1/2 -left-2.5 h-5 w-[3px] -translate-y-1/2 rounded-r-[3px] bg-primary"
								></span>
							{/if}

							<ServerIcon
								{name}
								{serverId}
								{iconUrl}
								{iconText}
								{iconTone}
								class="h-full w-full rounded-xl"
							/>

							{#if mentions > 0}
								<span
									class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-lg px-1 font-mono text-[10px] leading-none font-semibold text-primary-foreground ring-2 ring-rail"
									style="background: var(--primary)"
								>
									{mentions > 99 ? '99+' : mentions}
								</span>
							{:else if unread}
								<span
									class="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-rail"
								></span>
							{/if}
						</a>
					{/snippet}
				</ActionContextMenu>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="right" sideOffset={8}>{name}</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
