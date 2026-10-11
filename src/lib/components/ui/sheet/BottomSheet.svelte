<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { LONG_PRESS_SLOP_PX } from '$lib/utils/longPress';
	import { shouldDismissSheet } from '$lib/utils/sheetSwipe';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		/** Read out by screen readers; not drawn. */
		title: string;
		children: Snippet;
	};

	let { open, onOpenChange, title, children }: Props = $props();

	let content = $state<HTMLElement | null>(null);

	type Drag = { startY: number; startTime: number; engaged: boolean };

	// Touch events rather than pointer events: the browser cancels pointer events as soon as it
	// takes the touch to scroll, while a non-passive touchmove can still stop that scroll.
	$effect(() => {
		const sheet = content;
		if (!sheet) return;
		let drag: Drag | null = null;
		let suppressClickUntil = 0;

		function onStart(event: TouchEvent) {
			drag = null;
			if (event.touches.length !== 1 || sheet!.scrollTop !== 0) return;
			drag = { startY: event.touches[0].clientY, startTime: event.timeStamp, engaged: false };
		}

		function onMove(event: TouchEvent) {
			if (!drag) return;
			if (event.touches.length !== 1) return release(false, event);
			const dy = event.touches[0].clientY - drag.startY;
			if (!drag.engaged) {
				if (dy < 0 || sheet!.scrollTop !== 0) {
					drag = null;
					return;
				}
				if (dy <= LONG_PRESS_SLOP_PX) return;
				drag.engaged = true;
				sheet!.style.transition = 'none';
			}
			event.preventDefault();
			sheet!.style.translate = `0 ${Math.max(0, dy)}px`;
		}

		function release(allowDismiss: boolean, event: TouchEvent) {
			const current = drag;
			drag = null;
			if (!current?.engaged) return;
			suppressClickUntil = event.timeStamp + 400;
			const dy = (event.changedTouches[0]?.clientY ?? current.startY) - current.startY;
			sheet!.style.transition = '';
			if (allowDismiss && shouldDismissSheet(dy, event.timeStamp - current.startTime)) {
				onOpenChange(false);
				return;
			}
			sheet!.style.translate = '';
		}

		const onEnd = (event: TouchEvent) => release(true, event);
		const onCancel = (event: TouchEvent) => release(false, event);

		function onClick(event: MouseEvent) {
			if (event.timeStamp > suppressClickUntil) return;
			event.preventDefault();
			event.stopPropagation();
		}

		sheet.addEventListener('touchstart', onStart, { passive: true });
		sheet.addEventListener('touchmove', onMove, { passive: false });
		sheet.addEventListener('touchend', onEnd);
		sheet.addEventListener('touchcancel', onCancel);
		sheet.addEventListener('click', onClick, true);
		return () => {
			sheet.removeEventListener('touchstart', onStart);
			sheet.removeEventListener('touchmove', onMove);
			sheet.removeEventListener('touchend', onEnd);
			sheet.removeEventListener('touchcancel', onCancel);
			sheet.removeEventListener('click', onClick, true);
		};
	});
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<DialogPrimitive.Content
			bind:ref={content}
			data-slot="bottom-sheet"
			class="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-input bg-popover pb-[var(--safe-bottom)] text-popover-foreground shadow-[0_-16px_40px_rgba(0,0,0,0.5)] transition-[translate] duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
		>
			<DialogPrimitive.Title class="sr-only">{title}</DialogPrimitive.Title>
			<div class="sticky top-0 z-10 flex justify-center py-2" aria-hidden="true">
				<span class="h-1 w-9 rounded-full bg-border"></span>
			</div>
			{@render children()}
		</DialogPrimitive.Content>
	</Dialog.Portal>
</Dialog.Root>
