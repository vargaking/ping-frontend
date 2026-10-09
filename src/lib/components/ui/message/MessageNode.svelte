<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import MessageNode from './MessageNode.svelte';
	import CodeBlock from './CodeBlock.svelte';
	import { linkify, safeHref } from '$lib/utils/linkify';

	let { node }: { node: JSONContent | string } = $props();

	const linkClass =
		'text-primary underline decoration-primary/40 underline-offset-2 [overflow-wrap:anywhere] hover:decoration-primary';
</script>

{#snippet anchor(href: string, label: string)}
	<a {href} target="_blank" rel="noopener noreferrer nofollow" class={linkClass}>{label}</a>
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
					>{@render renderMarks(marksRemaining, currentIndex + 1, text, autolink)}</a
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
	{#each node.content || [] as child}
		<MessageNode node={child} />
	{/each}
{:else if node.type === 'paragraph'}
	<p class="min-h-[1.5em] leading-relaxed">
		{#if node.content}
			{#each node.content as child}
				<MessageNode node={child} />
			{/each}
		{:else}
			<br />
		{/if}
	</p>
{:else if node.type === 'text'}
	{@const marks = node.marks || []}
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
		{#each node.content || [] as child}
			<MessageNode node={child} />
		{/each}
	</ul>
{:else if node.type === 'orderedList'}
	<ol class="my-2 list-inside list-decimal pl-2">
		{#each node.content || [] as child}
			<MessageNode node={child} />
		{/each}
	</ol>
{:else if node.type === 'listItem'}
	<li class="my-1">
		{#each node.content || [] as child}
			<MessageNode node={child} />
		{/each}
	</li>
{:else if node.type === 'codeBlock'}
	<CodeBlock {node} />
{:else if node.type === 'blockquote'}
	<blockquote class="my-2 border-l-4 border-border py-1 pl-4 text-muted-foreground">
		{#each node.content || [] as child}
			<MessageNode node={child} />
		{/each}
	</blockquote>
{:else if node.type === 'heading'}
	<svelte:element
		this={`h${node.attrs?.level || 1}`}
		class="font-bold text-foreground {node.attrs?.level === 1
			? 'mt-4 mb-2 text-2xl'
			: node.attrs?.level === 2
				? 'mt-3 mb-2 text-xl'
				: 'mt-2 mb-1 text-lg'}"
	>
		{#each node.content || [] as child}
			<MessageNode node={child} />
		{/each}
	</svelte:element>
{:else if node.type === 'hardBreak'}
	<br />
{:else if node.type === 'horizontalRule'}
	<hr class="my-4 border-border" />
{:else}
	<!-- Unknown node type fallback -->
	{#if node.content}
		{#each node.content as child}
			<MessageNode node={child} />
		{/each}
	{:else}
		{node.text || ''}
	{/if}
{/if}
