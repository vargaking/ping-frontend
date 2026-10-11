<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import MessageNode from './MessageNode.svelte';
	import CodeBlock from './CodeBlock.svelte';
	import {
		effectiveMarks,
		linkLabel,
		linkRuns,
		linkify,
		maskedTargets,
		safeHref
	} from '$lib/utils/linkify';

	// A run of link nodes is judged as a whole by its parent, so its parts are not judged again.
	let { node, guarded = true }: { node: JSONContent | string; guarded?: boolean } = $props();

	function headingLevel(value: unknown): number {
		const level = Math.trunc(Number(value));
		return Number.isFinite(level) ? Math.min(6, Math.max(1, level)) : 1;
	}

	const linkClass =
		'text-primary underline decoration-primary/40 underline-offset-2 [overflow-wrap:anywhere] hover:decoration-primary';
</script>

{#snippet anchor(href: string, label: string)}
	<a {href} target="_blank" rel="noopener noreferrer nofollow" class={linkClass}>{label}</a>
{/snippet}

{#snippet inline(children: JSONContent[])}
	{#each linkRuns(children) as run, i (i)}
		{@const targets = maskedTargets(run)}
		{#if targets}
			{#each targets as target, j (j)}
				{@render anchor(target, target)}
			{/each}
		{:else}
			{#each run.nodes as child, j (j)}
				<MessageNode node={child} guarded={run.hrefs.length === 0} />
			{/each}
		{/if}
	{/each}
{/snippet}

{#snippet linked(text: string)}
	{#each linkify(text) as segment, i (i)}
		{#if segment.kind === 'link'}
			{@render anchor(segment.href, segment.text)}
		{:else}
			{segment.text}
		{/if}
	{/each}
{/snippet}

{#snippet renderMarks(marksRemaining: any[], currentIndex: number, text: string, autolink: boolean)}
	{#if currentIndex >= marksRemaining.length}
		{#if autolink}
			{@render linked(text)}
		{:else}
			{text}
		{/if}
	{:else}
		{@const mark = marksRemaining[currentIndex]}
		{#if mark.type === 'bold'}
			<strong>{@render renderMarks(marksRemaining, currentIndex + 1, text, autolink)}</strong>
		{:else if mark.type === 'italic'}
			<em>{@render renderMarks(marksRemaining, currentIndex + 1, text, autolink)}</em>
		{:else if mark.type === 'underline'}
			<u>{@render renderMarks(marksRemaining, currentIndex + 1, text, autolink)}</u>
		{:else if mark.type === 'strike'}
			<s>{@render renderMarks(marksRemaining, currentIndex + 1, text, autolink)}</s>
		{:else if mark.type === 'code'}
			<code class="rounded bg-accent px-1 py-0.5 font-mono text-sm text-foreground"
				>{@render renderMarks(marksRemaining, currentIndex + 1, text, autolink)}</code
			>
		{:else if mark.type === 'link'}
			{@const href = safeHref(mark.attrs?.href)}
			{#if href}
				<a {href} target="_blank" rel="noopener noreferrer nofollow" class={linkClass}
					>{@render renderMarks(
						marksRemaining,
						currentIndex + 1,
						guarded ? linkLabel(text, href) : text,
						autolink
					)}</a
				>
			{:else}
				{@render renderMarks(marksRemaining, currentIndex + 1, text, autolink)}
			{/if}
		{:else}
			{@render renderMarks(marksRemaining, currentIndex + 1, text, autolink)}
		{/if}
	{/if}
{/snippet}

{#if typeof node === 'string'}
	{@render linked(node)}
{:else if typeof node !== 'object' || node === null}
	{node ?? ''}
{:else if node.type === 'doc'}
	{@render inline(node.content || [])}
{:else if node.type === 'paragraph'}
	<p class="min-h-[1.5em] leading-relaxed">
		{#if node.content}
			{@render inline(node.content)}
		{:else}
			<br />
		{/if}
	</p>
{:else if node.type === 'text'}
	{@const marks = effectiveMarks(node.marks)}
	{@render renderMarks(
		marks,
		0,
		node.text || '',
		!marks.some((mark) => mark.type === 'code' || mark.type === 'link')
	)}
{:else if node.type === 'mention'}
	<span
		class="rounded-md bg-primary/15 px-1.5 py-0.5 font-semibold text-primary"
		data-user-id={node.attrs?.id}
	>
		@{node.attrs?.label || node.attrs?.id}
	</span>
{:else if node.type === 'bulletList'}
	<ul class="my-2 list-inside list-disc pl-2">
		{@render inline(node.content || [])}
	</ul>
{:else if node.type === 'orderedList'}
	<ol class="my-2 list-inside list-decimal pl-2">
		{@render inline(node.content || [])}
	</ol>
{:else if node.type === 'listItem'}
	<li class="my-1">
		{@render inline(node.content || [])}
	</li>
{:else if node.type === 'codeBlock'}
	<CodeBlock {node} />
{:else if node.type === 'blockquote'}
	<blockquote class="my-2 border-l-4 border-border py-1 pl-4 text-muted-foreground">
		{@render inline(node.content || [])}
	</blockquote>
{:else if node.type === 'heading'}
	{@const level = headingLevel(node.attrs?.level)}
	<svelte:element
		this={`h${level}`}
		class="font-bold text-foreground {level === 1
			? 'mt-4 mb-2 text-2xl'
			: level === 2
				? 'mt-3 mb-2 text-xl'
				: 'mt-2 mb-1 text-lg'}"
	>
		{@render inline(node.content || [])}
	</svelte:element>
{:else if node.type === 'hardBreak'}
	<br />
{:else if node.type === 'horizontalRule'}
	<hr class="my-4 border-border" />
{:else}
	<!-- Unknown node type fallback -->
	{#if node.content}
		{@render inline(node.content)}
	{:else}
		{node.text || ''}
	{/if}
{/if}
