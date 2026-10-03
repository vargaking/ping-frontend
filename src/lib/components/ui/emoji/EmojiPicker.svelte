<script lang="ts">
	import { onMount } from 'svelte';
	import { mode } from 'mode-watcher';

	let { onpick, class: className = '' }: { onpick: (unicode: string) => void; class?: string } =
		$props();

	let dataSource = $state<string>();
	let picker = $state<HTMLElement>();

	onMount(async () => {
		const [{ Picker }, { default: url }] = await Promise.all([
			import('emoji-picker-element'),
			import('emoji-picker-element-data/en/emojibase/data.json?url')
		]);
		if (!customElements.get('emoji-picker')) customElements.define('emoji-picker', Picker);
		dataSource = url;
	});

	$effect(() => {
		const element = picker;
		if (!element) return;
		const handleClick = (event: Event) =>
			onpick((event as CustomEvent<{ unicode: string }>).detail.unicode);
		element.addEventListener('emoji-click', handleClick);
		element.shadowRoot?.querySelector('input')?.focus();
		return () => element.removeEventListener('emoji-click', handleClick);
	});
</script>

<div class="emoji-picker-host {className}">
	{#if dataSource}
		<svelte:element
			this={'emoji-picker'}
			bind:this={picker}
			data-source={dataSource}
			class={mode.current === 'light' ? 'light' : 'dark'}
		></svelte:element>
	{/if}
</div>

<style>
	.emoji-picker-host {
		width: 22rem;
		height: 22rem;
		max-width: calc(100vw - 2rem);
	}

	.emoji-picker-host :global(emoji-picker) {
		width: 100%;
		height: 100%;
		--background: var(--popover);
		--border-color: var(--border);
		--border-radius: var(--radius-xl);
		--button-hover-background: var(--accent);
		--button-active-background: var(--input);
		--category-font-color: var(--muted-foreground);
		--indicator-color: var(--primary);
		--input-border-color: var(--input);
		--input-font-color: var(--foreground);
		--input-placeholder-color: var(--text-subtle);
		--outline-color: var(--ring);
		--num-columns: 8;
	}
</style>
