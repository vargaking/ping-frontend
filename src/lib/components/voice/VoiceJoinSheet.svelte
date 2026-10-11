<script lang="ts">
	import BottomSheet from '$lib/components/ui/sheet/BottomSheet.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { usersState } from '$lib/states/usersState.svelte';
	import { voiceRoster } from '$lib/states/voiceRoster.svelte';
	import { voiceState } from '$lib/states/voiceState.svelte';
	import type { Channel } from '$lib/types/channel.types';
	import { avatarToneClass, initials } from '$lib/utils/avatar';
	import { movingNotice } from '$lib/utils/voiceJoin';
	import { Volume2 } from 'lucide-svelte';

	type Props = {
		/** The channel being asked about; null while the sheet is closed. */
		channel: Channel | null;
		onjoin: (muted: boolean) => void;
		oncancel: () => void;
	};

	let { channel, onjoin, oncancel }: Props = $props();

	// The sheet slides out after `channel` is cleared, so it keeps showing the last one until then.
	let shown = $state.raw<Channel | null>(null);
	$effect(() => {
		if (channel) shown = channel;
	});

	const roster = $derived(shown ? voiceRoster(shown.id) : []);
	const notice = $derived(shown ? movingNotice(voiceState, shown.id) : null);

	$effect(() => {
		for (const member of roster) usersState.getOrFetchUser(member.userId);
	});

	function nameOf(member: { userId: number; fallbackName?: string }) {
		return usersState.users[member.userId]?.username ?? member.fallbackName ?? '…';
	}
</script>

<BottomSheet
	open={channel !== null}
	onOpenChange={(open) => {
		if (!open) oncancel();
	}}
	title="Join {shown?.name ?? 'voice channel'}"
>
	{#if shown}
		<div class="flex flex-col gap-4 px-4 pb-4">
			<div class="flex items-center gap-2">
				<Volume2
					size={18}
					strokeWidth={1.75}
					class="shrink-0 text-text-subtle"
					aria-hidden="true"
				/>
				<span class="min-w-0 truncate text-base font-semibold">{shown.name}</span>
			</div>

			{#if roster.length === 0}
				<p class="text-sm text-text-subtle">No one's here yet</p>
			{:else}
				<ul aria-label="In {shown.name}" class="flex flex-col gap-1">
					{#each roster as member (member.userId)}
						{@const user = usersState.users[member.userId]}
						<li class="flex h-9 items-center gap-2.5">
							<span
								class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold {user
									?.profile?.avatar
									? 'bg-accent'
									: avatarToneClass(member.userId)}"
							>
								{#if user?.profile?.avatar}
									<img src={user.profile.avatar} alt="" class="h-full w-full object-cover" />
								{:else}
									{initials(nameOf(member))}
								{/if}
							</span>
							<span class="min-w-0 flex-1 truncate text-sm">{nameOf(member)}</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if notice}
				<p class="text-sm text-text-subtle">{notice}</p>
			{/if}

			<div class="flex flex-col gap-2">
				<Button onclick={() => onjoin(false)}>Join</Button>
				<Button variant="secondary" onclick={() => onjoin(true)}>Join muted</Button>
				<Button variant="ghost" onclick={oncancel}>Cancel</Button>
			</div>
		</div>
	{/if}
</BottomSheet>
