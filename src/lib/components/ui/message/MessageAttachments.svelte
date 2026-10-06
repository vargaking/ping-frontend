<script lang="ts">
	import type { Attachment } from '$lib/types/attachment.types';
	import { attachmentUrl, formatBytes } from '$lib/requests/attachments/uploadAttachment';
	import {
		download,
		isPlainLeftClick,
		mediaKind
	} from '$lib/requests/attachments/attachmentActions';
	import { Download, File as FileIcon, Maximize2 } from 'lucide-svelte';
	import MediaViewer from './MediaViewer.svelte';

	let { attachments }: { attachments: Attachment[] } = $props();

	const MAX_W = 260;
	const MAX_H = 132;
	const VIDEO_W = 260;
	const VIDEO_H = 146;

	const media = $derived(attachments.filter((a) => mediaKind(a) !== null));
	let viewerOpen = $state(false);
	let viewerIndex = $state(0);
	const inlineVideos = $state<Record<string, HTMLVideoElement | undefined>>({});

	function openViewer(a: Attachment) {
		inlineVideos[a.id]?.pause();
		viewerIndex = media.indexOf(a);
		viewerOpen = true;
	}

	function openImage(e: MouseEvent, a: Attachment) {
		if (!isPlainLeftClick(e)) return;
		e.preventDefault();
		openViewer(a);
	}

	function videoBox(a: Attachment): string {
		if (!a.width || !a.height) return `width:${VIDEO_W}px;height:${VIDEO_H}px`;
		return imageBox(a);
	}

	function imageBox(a: Attachment): string {
		if (!a.width || !a.height) return `max-width:${MAX_W}px;max-height:${MAX_H}px`;
		const scale = Math.min(MAX_W / a.width, MAX_H / a.height, 1);
		return `width:${Math.round(a.width * scale)}px;height:${Math.round(a.height * scale)}px`;
	}
</script>

<div class="flex flex-wrap gap-2">
	{#each attachments as a (a.id)}
		{@const kind = mediaKind(a)}
		{#if kind === 'image'}
			<a
				href={attachmentUrl(a)}
				target="_blank"
				rel="noopener"
				onclick={(e) => openImage(e, a)}
				class="block overflow-hidden rounded-[10px] border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-md:max-w-full"
				style={imageBox(a)}
			>
				<img
					src={attachmentUrl(a)}
					alt={a.filename}
					loading="lazy"
					class="h-full w-full object-cover"
				/>
			</a>
		{:else if kind === 'video'}
			<div
				class="group relative overflow-hidden rounded-[10px] border border-border bg-black max-md:max-w-full"
				style={videoBox(a)}
			>
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					bind:this={inlineVideos[a.id]}
					controls
					preload="metadata"
					playsinline
					src={attachmentUrl(a)}
					class="h-full w-full object-contain"
				></video>
				<button
					type="button"
					aria-label="Expand {a.filename}"
					onclick={() => openViewer(a)}
					class="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:opacity-100"
				>
					<Maximize2 size={14} strokeWidth={1.75} />
				</button>
			</div>
		{:else}
			<div
				class="flex w-[300px] max-w-full items-center gap-3 rounded-[10px] border border-border bg-card px-3 py-2.5"
			>
				<FileIcon size={18} strokeWidth={1.75} class="shrink-0 text-muted-foreground" />
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm text-foreground" title={a.filename}>{a.filename}</div>
					<div class="font-mono text-[11px] text-text-subtle">{formatBytes(a.size)}</div>
				</div>
				<a
					href={attachmentUrl(a)}
					download={a.filename}
					onclick={(e) => download(e, a)}
					aria-label="Download {a.filename}"
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<Download size={18} strokeWidth={1.75} />
				</a>
			</div>
		{/if}
	{/each}
</div>

{#if media.length}
	<MediaViewer items={media} bind:index={viewerIndex} bind:open={viewerOpen} />
{/if}
