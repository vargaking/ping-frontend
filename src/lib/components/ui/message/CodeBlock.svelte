<script lang="ts">
	import type { JSONContent } from '@tiptap/core';
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { knownLanguage } from '$lib/highlight/languages';
	import { loadHighlighter, type TokenKind } from '$lib/highlight/highlighter';

	let { node }: { node: JSONContent } = $props();

	const MAX_HIGHLIGHTED_LENGTH = 20_000;
	const COPIED_MS = 1500;

	const TOKEN_CLASS: Record<TokenKind, string> = {
		keyword: 'tok-keyword',
		string: 'tok-string',
		number: 'tok-number',
		comment: 'tok-comment',
		function: 'tok-function',
		type: 'tok-type',
		variable: 'tok-variable',
		meta: 'tok-meta',
		punctuation: 'tok-punctuation'
	};

	const code = $derived((node.content ?? []).map((child) => child.text ?? '').join(''));
	const rawLanguage = $derived(node.attrs?.language);
	const label = $derived(typeof rawLanguage === 'string' ? rawLanguage.trim() : '');
	const language = $derived(
		code.length <= MAX_HIGHLIGHTED_LENGTH ? knownLanguage(rawLanguage) : null
	);

	let block = $state<HTMLElement>();
	let highlight = $state.raw<Awaited<ReturnType<typeof loadHighlighter>>>();
	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	const tokens = $derived.by(() => {
		if (!highlight || !language) return null;
		try {
			return highlight(code, language);
		} catch {
			return null;
		}
	});

	// The highlighter is a separate download, so it loads only once a block is about to be seen.
	$effect(() => {
		if (!block || !language || highlight) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				loadHighlighter()
					.then((loaded) => (highlight = loaded))
					.catch(() => {});
			},
			{ rootMargin: '200px' }
		);
		observer.observe(block);
		return () => observer.disconnect();
	});

	onDestroy(() => clearTimeout(copiedTimer));

	async function copy() {
		try {
			await navigator.clipboard.writeText(code);
		} catch {
			toast.error('Could not copy the code');
			return;
		}
		copied = true;
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copied = false), COPIED_MS);
	}
</script>

<!-- not-prose and whitespace-normal: the message text's typography styles and pre-wrap would add margins and blank lines here. -->
<div
	bind:this={block}
	class="group/code not-prose my-2 max-w-full rounded-md bg-accent whitespace-normal text-foreground"
>
	<!-- The copy button sits left because the row's hover toolbar covers the top right. -->
	<div class="flex h-8 items-center gap-1 pr-3 pl-1 select-none pointer-coarse:h-10">
		<button
			type="button"
			aria-label="Copy code"
			onclick={copy}
			class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-focus-within/code:opacity-100 group-hover/code:opacity-100 hover:bg-card hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:h-9 pointer-coarse:w-9 pointer-coarse:opacity-100"
		>
			{#if copied}
				<CheckIcon size={15} strokeWidth={1.75} />
			{:else}
				<CopyIcon size={15} strokeWidth={1.75} />
			{/if}
		</button>
		{#if label}
			<span class="min-w-0 truncate font-mono text-[11px] text-text-subtle">{label}</span>
		{/if}
		<span class="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
	</div>
	<pre class="overflow-x-auto overscroll-x-contain px-3 pt-0 pb-3 font-mono text-sm"><code
			>{#if tokens}{#each tokens as token, i (i)}<span
						class={token.kind ? TOKEN_CLASS[token.kind] : undefined}>{token.text}</span
					>{/each}{:else}{code}{/if}</code
		></pre>
</div>

<style>
	.tok-keyword {
		color: var(--code-keyword);
	}
	.tok-string {
		color: var(--code-string);
	}
	.tok-number {
		color: var(--code-number);
	}
	.tok-comment {
		color: var(--code-comment);
	}
	.tok-function {
		color: var(--code-function);
	}
	.tok-type {
		color: var(--code-type);
	}
	.tok-variable {
		color: var(--code-variable);
	}
	.tok-meta {
		color: var(--code-meta);
	}
	.tok-punctuation {
		color: var(--code-punctuation);
	}
</style>
