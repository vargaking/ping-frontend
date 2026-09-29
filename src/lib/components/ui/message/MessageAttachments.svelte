<script lang="ts">
	import type { Attachment } from '$lib/types/attachment.types';
	import { attachmentUrl, formatBytes } from '$lib/requests/attachments/uploadAttachment';
	import { Download, File as FileIcon } from 'lucide-svelte';

	let { attachments }: { attachments: Attachment[] } = $props();

	const MAX_W = 260;
	const MAX_H = 132;

	function imageBox(a: Attachment): string {
		if (!a.width || !a.height) return `max-width:${MAX_W}px;max-height:${MAX_H}px`;
		const scale = Math.min(MAX_W / a.width, MAX_H / a.height, 1);
		return `width:${Math.round(a.width * scale)}px;height:${Math.round(a.height * scale)}px`;
	}
</script>

<div class="flex flex-wrap gap-2">
	{#each attachments as a (a.id)}
		{#if a.kind === 'image'}
			<a
				href={attachmentUrl(a)}
				target="_blank"
				rel="noopener"
				class="block overflow-hidden rounded-[10px] border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				style={imageBox(a)}
			>
				<img
					src={attachmentUrl(a)}
					alt={a.filename}
					loading="lazy"
					class="h-full w-full object-cover"
				/>
			</a>
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
					aria-label="Download {a.filename}"
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<Download size={18} strokeWidth={1.75} />
				</a>
			</div>
		{/if}
	{/each}
</div>
