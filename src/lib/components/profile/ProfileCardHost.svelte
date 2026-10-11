<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import * as Popover from '$lib/components/ui/popover/index';
	import BottomSheet from '$lib/components/ui/sheet/BottomSheet.svelte';
	import { phoneState } from '$lib/states/phoneState.svelte';
	import { profileCardState, type ProfileCardTarget } from '$lib/states/profileCardState.svelte';
	import ProfileCard from './ProfileCard.svelte';

	const target = $derived(profileCardState.target);
	const anchor = $derived(profileCardState.anchor);
	const placement = $derived(profileCardState.placement);

	// The sheet slides out after the card is closed, so it keeps showing the last card until then.
	let lastTarget = $state.raw<ProfileCardTarget | null>(null);
	$effect(() => {
		if (target) lastTarget = target;
	});
	const sheetTarget = $derived(target ?? lastTarget);

	let pathname = page.url.pathname;
	$effect(() => {
		const next = page.url.pathname;
		if (next === pathname) return;
		pathname = next;
		untrack(() => profileCardState.close());
	});

	// An anchor that leaves the page (its row was removed or moved) takes the popover with it.
	$effect(() => {
		if (phoneState.phone || !anchor) return;
		const watched = anchor;
		const observer = new MutationObserver(() => {
			if (!watched.isConnected) profileCardState.close();
		});
		observer.observe(document.body, { childList: true, subtree: true });
		return () => observer.disconnect();
	});

	let closedAnchor: HTMLElement | null = null;
	$effect(() => {
		if (anchor) closedAnchor = anchor;
	});

	// Focus goes back to what was clicked, unless something else (a dialog) has taken it.
	function restoreFocus(event: Event) {
		event.preventDefault();
		const active = document.activeElement;
		if (closedAnchor?.isConnected && (!active || active === document.body)) closedAnchor.focus();
	}

	function onOpenChange(open: boolean) {
		if (!open) profileCardState.close();
	}
</script>

{#if phoneState.phone}
	<BottomSheet open={target !== null} {onOpenChange} title="Profile">
		{#if sheetTarget}
			<ProfileCard target={sheetTarget} onclose={() => profileCardState.close()} />
		{/if}
	</BottomSheet>
{:else if target && anchor}
	<Popover.Root open {onOpenChange}>
		<Popover.Content
			customAnchor={anchor}
			side={placement.side ?? 'bottom'}
			align={placement.align ?? 'start'}
			role="dialog"
			aria-labelledby="profile-card-name"
			class="w-80 overflow-hidden p-0"
			onCloseAutoFocus={restoreFocus}
		>
			<ProfileCard {target} onclose={() => profileCardState.close()} />
		</Popover.Content>
	</Popover.Root>
{/if}
