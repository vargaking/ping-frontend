<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import NewTagForm from '$lib/components/forum/NewTagForm.svelte';
	import { TAGS_PER_CHANNEL_MAX } from '$lib/types/forum.types';
	import { Plus } from 'lucide-svelte';

	let { channelId, disabled = false }: { channelId: number; disabled?: boolean } = $props();

	let open = $state(false);
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		aria-label="New tag"
		{disabled}
		title={disabled ? `A forum can have up to ${TAGS_PER_CHANNEL_MAX} tags.` : undefined}
		class="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground pointer-coarse:h-8"
	>
		<Plus size={12} strokeWidth={1.75} />
		Tag
	</Popover.Trigger>
	<Popover.Content align="start" class="w-[min(320px,90vw)] p-3">
		<NewTagForm {channelId} onadded={() => (open = false)} />
	</Popover.Content>
</Popover.Root>
