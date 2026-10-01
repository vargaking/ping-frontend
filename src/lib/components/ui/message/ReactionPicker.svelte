<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Popover from '$lib/components/ui/popover/index';
	import { toggleReaction } from '$lib/utils/reactions';
	import type { MessageType } from '$lib/types/messages.types';

	const EMOJIS: [emoji: string, name: string][] = [
		['👍', 'thumbs up'],
		['👎', 'thumbs down'],
		['😂', 'laughing'],
		['❤️', 'heart'],
		['🎉', 'party popper'],
		['😮', 'surprised'],
		['😢', 'crying'],
		['😡', 'angry'],
		['🔥', 'fire'],
		['👀', 'eyes'],
		['🙏', 'folded hands'],
		['👏', 'clapping'],
		['✅', 'check mark'],
		['❌', 'cross mark'],
		['💯', 'hundred'],
		['🤔', 'thinking'],
		['😅', 'sweat smile'],
		['🥳', 'partying'],
		['😍', 'heart eyes'],
		['🙌', 'raised hands'],
		['💀', 'skull'],
		['🤝', 'handshake'],
		['⭐', 'star'],
		['🚀', 'rocket']
	];

	let {
		message,
		open = $bindable(false),
		trigger
	}: {
		message: MessageType;
		open?: boolean;
		trigger: Snippet<[props: Record<string, unknown>]>;
	} = $props();

	function pick(emoji: string) {
		open = false;
		toggleReaction(message, emoji);
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			{@render trigger(props)}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-1.5" side="top" align="end" sideOffset={6}>
		<div class="grid grid-cols-8 gap-0.5" role="group" aria-label="Pick a reaction">
			{#each EMOJIS as [emoji, name] (emoji)}
				<button
					type="button"
					aria-label={name}
					onclick={() => pick(emoji)}
					class="flex h-8 w-8 items-center justify-center rounded text-lg transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					{emoji}
				</button>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>
