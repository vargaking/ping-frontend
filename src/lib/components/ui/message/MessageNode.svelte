<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import MessageNode from './MessageNode.svelte';

	let { node }: { node: JSONContent | string } = $props();
</script>

{#snippet renderMarks(marksRemaining: any[], currentIndex: number, text: string)}
	{#if currentIndex >= marksRemaining.length}
		{text}
	{:else}
		{@const mark = marksRemaining[currentIndex]}
		{#if mark.type === 'bold'}
			<strong>{@render renderMarks(marksRemaining, currentIndex + 1, text)}</strong>
		{:else if mark.type === 'italic'}
			<em>{@render renderMarks(marksRemaining, currentIndex + 1, text)}</em>
		{:else if mark.type === 'strike'}
			<s>{@render renderMarks(marksRemaining, currentIndex + 1, text)}</s>
		{:else if mark.type === 'code'}
			<code class="rounded bg-zinc-800 px-1 py-0.5 font-mono text-sm text-zinc-200"
				>{@render renderMarks(marksRemaining, currentIndex + 1, text)}</code
			>
		{:else}
			{@render renderMarks(marksRemaining, currentIndex + 1, text)}
		{/if}
	{/if}
{/snippet}

{#if typeof node === 'string'}
	{node}
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
	{@render renderMarks(node.marks || [], 0, node.text || '')}
{:else if node.type === 'mention'}
	<span
		class="rounded-md bg-indigo-500/20 px-1.5 py-0.5 font-semibold text-indigo-400"
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
	<pre class="my-2 overflow-x-auto rounded-md bg-zinc-800 p-3 font-mono text-sm text-zinc-100"><code
			>{#each node.content || [] as child}<MessageNode node={child} />{/each}</code
		></pre>
{:else if node.type === 'blockquote'}
	<blockquote class="my-2 border-l-4 border-zinc-600 py-1 pl-4 text-zinc-300">
		{#each node.content || [] as child}
			<MessageNode node={child} />
		{/each}
	</blockquote>
{:else if node.type === 'heading'}
	<svelte:element
		this={`h${node.attrs?.level || 1}`}
		class="font-bold text-zinc-100 {node.attrs?.level === 1
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
	<hr class="my-4 border-zinc-700" />
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
