<script lang="ts">
	import { onMount } from 'svelte';
	import { shellViewportState } from '$lib/states/shellViewportState.svelte';
	import { describeTopEdge, findTopEdge } from '$lib/utils/shellViewport';

	let probe: HTMLElement;
	let measured = $state<[string, string][]>([]);

	const px = (value: number) => `${Math.round(value * 100) / 100}`;

	function osVersion(userAgent: string): string {
		const os = userAgent.match(/OS (\d+)[_.](\d+)/)?.[0].replace('_', '.');
		const safari = userAgent.match(/Version\/([\d.]+)/)?.[1];
		if (!os) return 'none';
		return safari ? `${os} (Version ${safari})` : os;
	}

	function measure() {
		const viewport = window.visualViewport;
		const insets = getComputedStyle(probe);
		measured = [
			['inner', `${window.innerWidth}x${window.innerHeight}`],
			['visual', viewport ? `${px(viewport.width)}x${px(viewport.height)}` : 'none'],
			['offsetTop', px(viewport?.offsetTop ?? 0)],
			['scale', px(viewport?.scale ?? 1)],
			['screen', `${screen.width}x${screen.height}`],
			[
				'safe t r b l',
				[insets.paddingTop, insets.paddingRight, insets.paddingBottom, insets.paddingLeft]
					.map((value) => parseFloat(value))
					.join(' ')
			],
			['100dvh', insets.height],
			[
				'--app-height',
				getComputedStyle(document.documentElement).getPropertyValue('--app-height').trim() ||
					'unset'
			],
			['ios', osVersion(navigator.userAgent)],
			[
				'top edge',
				describeTopEdge(findTopEdge(document, (element) => !!element.closest('[data-layout-info]')))
			]
		];
	}

	const reading = $derived(shellViewportState.reading);
	const rows = $derived<[string, string][]>([
		...measured,
		['resting', reading ? `${reading.resting}px` : 'n/a'],
		['mode', reading ? (reading.installed ? 'installed' : 'tab') : 'n/a'],
		['keyboard', reading ? (reading.keyboardOpen ? 'open' : 'closed') : 'n/a'],
		['editable focus', reading ? (reading.editableFocused ? 'yes' : 'no') : 'n/a']
	]);

	// Re-measure whenever the layout evaluated the viewport.
	$effect(() => {
		void shellViewportState.reading;
		measure();
	});

	// Dialogs and navigation change what sits along the top edge without any resize.
	onMount(() => {
		const timer = setInterval(measure, 1000);
		return () => clearInterval(timer);
	});

	// While pinch-zoomed the layout skips evaluating, but the numbers still change.
	onMount(() => {
		const viewport = window.visualViewport;
		viewport?.addEventListener('resize', measure);
		viewport?.addEventListener('scroll', measure);
		window.addEventListener('resize', measure);
		return () => {
			viewport?.removeEventListener('resize', measure);
			viewport?.removeEventListener('scroll', measure);
			window.removeEventListener('resize', measure);
		};
	});
</script>

<div
	bind:this={probe}
	aria-hidden="true"
	data-layout-info
	class="pointer-events-none invisible fixed top-0 left-0 h-dvh w-px pt-[env(safe-area-inset-top,0px)] pr-[env(safe-area-inset-right,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)]"
></div>
<div
	aria-hidden="true"
	data-layout-info
	class="pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+2.75rem+var(--call-bar)+0.25rem)] right-[calc(env(safe-area-inset-right,0px)+0.25rem)] z-40 max-w-[calc(100vw-0.5rem)] rounded bg-black/85 px-1.5 py-1 font-mono text-[10px] leading-tight text-white"
>
	{#each rows as [name, value] (name)}
		<div class="flex justify-between gap-3"><span class="opacity-60">{name}</span>{value}</div>
	{/each}
	{#if shellViewportState.trace.length}
		<div class="mt-1 border-t border-white/30 pt-1 opacity-60">ms event vv top sy app</div>
		{#each shellViewportState.trace as entry (entry.seq)}
			<div class="whitespace-pre">
				{entry.t}
				{entry.event}
				{px(entry.viewport)}
				{px(entry.offsetTop)}
				{px(entry.scrollY)}
				{px(entry.appHeight)}
			</div>
		{/each}
	{/if}
</div>
