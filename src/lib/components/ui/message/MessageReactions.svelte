<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip/index';
	import ReactionPicker from './ReactionPicker.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { toggleReaction } from '$lib/utils/reactions';
	import type { MessageType } from '$lib/types/messages.types';
	import { SmilePlus } from 'lucide-svelte';

	let { message }: { message: MessageType } = $props();

	const reactions = $derived(message.reactions ?? []);
	const meId = $derived(usersState.loggedInUser?.id);

	function reactorNames(userIds: number[]): string {
		const names = userIds.map((id) =>
			id === meId ? 'You' : (usersState.users[id]?.username ?? 'Someone')
		);
		// Keep "You" first so the sentence reads naturally.
		names.sort((a, b) => Number(b === 'You') - Number(a === 'You'));
		if (names.length <= 3) {
			return names.length > 1
				? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
				: names[0];
		}
		const others = names.length - 2;
		return `${names[0]}, ${names[1]} and ${others} others`;
	}
</script>

{#if reactions.length > 0}
	<Tooltip.Provider>
		<div class="mt-1 flex flex-wrap items-center gap-1">
			{#each reactions as reaction (reaction.emoji)}
				{@const mine = meId != null && reaction.user_ids.includes(meId)}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								aria-pressed={mine}
								onclick={() => toggleReaction(message, reaction.emoji)}
								class="flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {mine
									? 'border-primary/50 bg-primary/15 text-primary'
									: 'border-border bg-surface-input text-text-body hover:bg-accent'}"
							>
								<span class="text-[13px] leading-none">{reaction.emoji}</span>
								<span class="font-medium tabular-nums">{reaction.user_ids.length}</span>
							</button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{reactorNames(reaction.user_ids)}</Tooltip.Content>
				</Tooltip.Root>
			{/each}
			<ReactionPicker {message}>
				{#snippet trigger(props)}
					<button
						{...props}
						type="button"
						aria-label="Add reaction"
						class="flex h-6 w-7 items-center justify-center rounded-full border border-border bg-surface-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<SmilePlus size={13} strokeWidth={1.75} />
					</button>
				{/snippet}
			</ReactionPicker>
		</div>
	</Tooltip.Provider>
{/if}
