<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import type { Attachment } from '$lib/types/attachment.types';
	import { attachmentUrl } from '$lib/requests/attachments/uploadAttachment';
	import { download, mediaKind, openFullSize } from '$lib/requests/attachments/attachmentActions';
	import { ChevronLeft, ChevronRight, Download, ExternalLink, X } from 'lucide-svelte';

	let {
		items,
		index = $bindable(0),
		open = $bindable(false),
		onClose
	}: {
		items: Attachment[];
		index?: number;
		open?: boolean;
		onClose?: () => void;
	} = $props();

	const MIN_SCALE = 1;
	const MAX_SCALE = 4;
	const CLICK_ZOOM = 2;
	const TAP_SLOP = 4;
	const SWIPE_DISTANCE = 60;
	const SWIPE_CLOSE_DISTANCE = 100;

	const current = $derived(items[index]);
	const isVideo = $derived(current ? mediaKind(current) === 'video' : false);
	const hasPrev = $derived(index > 0);
	const hasNext = $derived(index < items.length - 1);

	let content = $state<HTMLElement | null>(null);
	let stage = $state<HTMLDivElement | null>(null);
	let image = $state<HTMLImageElement | null>(null);
	let scale = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let animate = $state(false);

	let pointer: {
		id: number;
		startX: number;
		startY: number;
		originPanX: number;
		originPanY: number;
		moved: boolean;
		target: 'image' | 'background' | 'other';
	} | null = null;

	function resetZoom() {
		scale = 1;
		panX = 0;
		panY = 0;
	}

	function go(step: number) {
		const next = index + step;
		if (next < 0 || next >= items.length) return;
		animate = false;
		resetZoom();
		index = next;
	}

	function close() {
		open = false;
		onClose?.();
	}

	function clampPan(x: number, y: number, s: number) {
		if (!stage || !image) return { x: 0, y: 0 };
		const limitX = Math.max(0, (image.offsetWidth * s - stage.clientWidth) / 2);
		const limitY = Math.max(0, (image.offsetHeight * s - stage.clientHeight) / 2);
		return {
			x: Math.min(limitX, Math.max(-limitX, x)),
			y: Math.min(limitY, Math.max(-limitY, y))
		};
	}

	// Keeps the image point under (clientX, clientY) fixed while scaling.
	function zoomAt(nextScale: number, clientX: number, clientY: number) {
		if (!stage) return;
		const rect = stage.getBoundingClientRect();
		const px = clientX - (rect.left + rect.width / 2);
		const py = clientY - (rect.top + rect.height / 2);
		const ratio = nextScale / scale;
		const pan = clampPan(px - (px - panX) * ratio, py - (py - panY) * ratio, nextScale);
		scale = nextScale;
		panX = pan.x;
		panY = pan.y;
	}

	function toggleZoom(clientX: number, clientY: number) {
		animate = true;
		if (scale > MIN_SCALE) resetZoom();
		else zoomAt(CLICK_ZOOM, clientX, clientY);
	}

	$effect(() => {
		if (!stage) return;
		const el = stage;
		function onWheel(e: WheelEvent) {
			if (isVideo || !image) return;
			e.preventDefault();
			animate = false;
			const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * Math.exp(-e.deltaY * 0.0015)));
			zoomAt(next, e.clientX, e.clientY);
		}
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	});

	$effect(() => {
		for (const neighbour of [items[index - 1], items[index + 1]]) {
			if (neighbour && mediaKind(neighbour) === 'image') new Image().src = attachmentUrl(neighbour);
		}
	});

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0 || pointer) return;
		pointer = {
			id: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			originPanX: panX,
			originPanY: panY,
			moved: false,
			target: e.target === image ? 'image' : e.target === stage ? 'background' : 'other'
		};
		if (!isVideo) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!pointer || e.pointerId !== pointer.id) return;
		const dx = e.clientX - pointer.startX;
		const dy = e.clientY - pointer.startY;
		if (!pointer.moved && Math.hypot(dx, dy) > TAP_SLOP) pointer.moved = true;
		if (pointer.moved && scale > MIN_SCALE) {
			animate = false;
			const pan = clampPan(pointer.originPanX + dx, pointer.originPanY + dy, scale);
			panX = pan.x;
			panY = pan.y;
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (!pointer || e.pointerId !== pointer.id) return;
		const { startX, startY, moved, target } = pointer;
		pointer = null;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;

		if (!moved) {
			if (target === 'image') toggleZoom(e.clientX, e.clientY);
			else if (target === 'background') close();
			return;
		}
		if (scale > MIN_SCALE || isVideo) return;
		if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
		else if (dy > SWIPE_CLOSE_DISTANCE && dy > Math.abs(dx)) close();
	}

	function onPointerCancel() {
		pointer = null;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLVideoElement) return;
		if (e.key === 'ArrowLeft') go(-1);
		else if (e.key === 'ArrowRight') go(1);
	}

	const barButton =
		'flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11';
	const navButton =
		'absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/90 transition-colors hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
</script>

<DialogPrimitive.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) onClose?.();
	}}
>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Content
			bind:ref={content}
			class="fixed inset-0 z-50 flex flex-col bg-black/95 text-white outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
			onkeydown={onKeydown}
			onOpenAutoFocus={(e) => {
				e.preventDefault();
				content?.focus();
			}}
		>
			{#if current}
				<div
					class="flex shrink-0 items-center gap-2 px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] sm:px-4"
				>
					<DialogPrimitive.Title class="min-w-0 flex-1 truncate text-sm font-medium">
						{current.filename}
					</DialogPrimitive.Title>
					<DialogPrimitive.Description class="sr-only">
						{isVideo ? 'Video' : 'Image'} preview
					</DialogPrimitive.Description>
					{#if items.length > 1}
						<span class="shrink-0 font-mono text-xs text-white/70">
							{index + 1} / {items.length}
						</span>
					{/if}
					<a
						href={attachmentUrl(current)}
						download={current.filename}
						onclick={(e) => download(e, current)}
						aria-label="Download {current.filename}"
						title="Download"
						class={barButton}
					>
						<Download size={18} strokeWidth={1.75} />
					</a>
					<a
						href={attachmentUrl(current)}
						target="_blank"
						rel="noopener"
						onclick={(e) => openFullSize(e, current)}
						aria-label="Open original in a new tab"
						title="Open original"
						class={barButton}
					>
						<ExternalLink size={18} strokeWidth={1.75} />
					</a>
					<DialogPrimitive.Close aria-label="Close" title="Close" class={barButton}>
						<X size={20} strokeWidth={1.75} />
					</DialogPrimitive.Close>
				</div>

				<div class="relative min-h-0 flex-1">
					<div
						bind:this={stage}
						role="presentation"
						class="absolute inset-0 flex items-center justify-center overflow-hidden p-2 max-md:pb-[calc(0.5rem+var(--safe-bottom))] sm:p-6"
						onpointerdown={onPointerDown}
						onpointermove={onPointerMove}
						onpointerup={onPointerUp}
						onpointercancel={onPointerCancel}
					>
						{#key current.id}
							{#if isVideo}
								<!-- svelte-ignore a11y_media_has_caption -->
								<video
									controls
									autoplay
									playsinline
									src={attachmentUrl(current)}
									class="max-h-full max-w-full rounded-md bg-black"
								></video>
							{:else}
								<img
									bind:this={image}
									src={attachmentUrl(current)}
									alt={current.filename}
									draggable="false"
									class="max-h-full max-w-full touch-none select-none {scale > MIN_SCALE
										? 'cursor-grab active:cursor-grabbing'
										: 'cursor-zoom-in'} {animate ? 'transition-transform duration-150' : ''}"
									style="transform: translate({panX}px, {panY}px) scale({scale})"
								/>
							{/if}
						{/key}
					</div>

					{#if items.length > 1}
						{#if hasPrev}
							<button
								type="button"
								aria-label="Previous"
								class="{navButton} left-2 sm:left-4"
								onclick={() => go(-1)}
							>
								<ChevronLeft size={22} strokeWidth={1.75} />
							</button>
						{/if}
						{#if hasNext}
							<button
								type="button"
								aria-label="Next"
								class="{navButton} right-2 sm:right-4"
								onclick={() => go(1)}
							>
								<ChevronRight size={22} strokeWidth={1.75} />
							</button>
						{/if}
					{/if}
				</div>
			{/if}
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
