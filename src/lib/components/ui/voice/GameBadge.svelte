<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip/index';
	import { Gamepad2 } from 'lucide-svelte';

	import type { PlayingAs } from '$lib/types/game.types';

	let { game }: { game: PlayingAs } = $props();
</script>

<Tooltip.Provider>
	<Tooltip.Root delayDuration={300}>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class="flex shrink-0 text-text-subtle">
					<Gamepad2 size={14} strokeWidth={1.75} aria-hidden="true" />
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>Playing {game.name} as {game.playerName}</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
