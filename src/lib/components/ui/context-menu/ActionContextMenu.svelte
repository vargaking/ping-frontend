<script lang="ts">
	import type { Snippet } from 'svelte';
	import { mergeProps } from 'bits-ui';
	import * as ContextMenu from '$lib/components/ui/context-menu/index';
	import { cn } from '$lib/utils.js';
	import { groupActions, type MenuAction } from '$lib/utils/menuActions';

	// Links, media and text fields inside the trigger keep the browser's own menu.
	const NATIVE_MENU_TARGETS =
		'a[href], img, video, audio, input, textarea, [contenteditable="true"]';

	type Props = {
		actions: MenuAction[];
		/** Spread the given props onto the element that should open the menu. */
		children: Snippet<[props: Record<string, unknown>]>;
		/** Applied to the menu itself. */
		class?: string;
	};

	let { actions, children, class: className }: Props = $props();

	let open = $state(false);
	let content = $state<HTMLElement | null>(null);
	let opener: HTMLElement | null = null;

	const groups = $derived(groupActions(actions));

	$effect(() => {
		if (!open) return;
		const close = (e: Event) => {
			if (e.target instanceof Node && content?.contains(e.target)) return;
			open = false;
		};
		window.addEventListener('scroll', close, { capture: true, passive: true });
		return () => window.removeEventListener('scroll', close, { capture: true });
	});

	function onOpenChange(next: boolean) {
		if (next)
			opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	}

	// Without this, closing the menu leaves focus on the body when the trigger isn't focusable.
	function restoreFocus(e: Event) {
		e.preventDefault();
		if (document.activeElement === document.body && opener?.isConnected) opener.focus();
	}

	function interceptContextMenu(e: MouseEvent) {
		const trigger = e.currentTarget as HTMLElement;
		const inner = e.target instanceof Element ? e.target.closest(NATIVE_MENU_TARGETS) : null;
		if (inner && inner !== trigger && trigger.contains(inner)) {
			e.stopPropagation();
			return;
		}
		// Shift+F10 and the Menu key report 0,0, which would open the menu in the page corner.
		if (e.isTrusted && e.clientX === 0 && e.clientY === 0) {
			e.preventDefault();
			e.stopPropagation();
			const rect = trigger.getBoundingClientRect();
			trigger.dispatchEvent(
				new MouseEvent('contextmenu', {
					bubbles: true,
					cancelable: true,
					clientX: Math.max(0, rect.left) + Math.min(24, rect.width / 2),
					clientY: Math.max(0, rect.top) + Math.min(16, rect.height / 2)
				})
			);
		}
	}

	// Bits makes the trigger unfocusable; the wrapped element keeps its own tabindex.
	function triggerProps(props: Record<string, unknown>) {
		const rest = { ...props };
		delete rest.tabindex;
		return mergeProps(rest, { oncontextmenucapture: interceptContextMenu });
	}
</script>

{#if actions.length === 0}
	{@render children({})}
{:else}
	<ContextMenu.Root bind:open {onOpenChange}>
		<ContextMenu.Trigger>
			{#snippet child({ props })}
				{@render children(triggerProps(props))}
			{/snippet}
		</ContextMenu.Trigger>
		<ContextMenu.Content
			bind:ref={content}
			class={cn('w-52', className)}
			onCloseAutoFocus={restoreFocus}
		>
			{#each groups as group, i (i)}
				{#if i > 0}
					<ContextMenu.Separator />
				{/if}
				{#each group as action (action.id)}
					<ContextMenu.Item
						variant={action.destructive ? 'destructive' : 'default'}
						onSelect={() => action.run()}
					>
						<action.icon size={16} strokeWidth={1.75} />
						{action.label}
					</ContextMenu.Item>
				{/each}
			{/each}
		</ContextMenu.Content>
	</ContextMenu.Root>
{/if}
