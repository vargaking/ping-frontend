<script lang="ts">
	import { voiceState, type ScreenStream } from '$lib/states/voiceState.svelte';
	import { voiceStreamAudioState } from '$lib/states/voicePeerAudioState.svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import { Volume2, VolumeOff, VolumeX } from 'lucide-svelte';

	type Props = {
		stream: ScreenStream;
		class?: string;
	};

	let { stream, class: className }: Props = $props();

	const userId = $derived(Number(stream.identity));
	const audio = $derived(voiceStreamAudioState.get(userId));
	const percent = $derived(Math.round(audio.volume * 100));
	const silenced = $derived(voiceStreamAudioState.level(userId) === 0);
	const label = $derived(`Stream volume for ${stream.username}`);

	const overlay = 'rounded-md bg-background/80 text-foreground';
</script>

<div class={cn('flex max-w-[calc(100%-4rem)]', className)}>
	{#if stream.local}
		{#if voiceState.shareSound}
			{@const { on, text } = voiceState.shareSound}
			<span
				class="{overlay} flex min-w-0 items-start gap-1.5 px-2 py-1 text-xs"
				role="status"
				title={text}
			>
				{#if on}
					<Volume2 size={14} strokeWidth={1.75} class="mt-px shrink-0" />
				{:else}
					<VolumeOff size={14} strokeWidth={1.75} class="mt-px shrink-0" />
				{/if}
				<span class="line-clamp-2 min-w-0">{text}</span>
			</span>
		{/if}
	{:else if !stream.sound}
		<span
			class="{overlay} flex h-7 w-7 items-center justify-center text-muted-foreground"
			title="No sound"
			role="img"
			aria-label="No sound"
		>
			<VolumeOff size={14} strokeWidth={1.75} aria-hidden="true" />
			<span class="sr-only">{stream.username}'s stream has no sound</span>
		</span>
	{:else}
		<Popover.Root>
			<Popover.Trigger
				aria-label={label}
				title={label}
				class="{overlay} flex h-7 w-7 items-center justify-center transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				{#if silenced}
					<VolumeX size={14} strokeWidth={1.75} />
				{:else}
					<Volume2 size={14} strokeWidth={1.75} />
				{/if}
			</Popover.Trigger>
			<Popover.Content align="start" class="w-[min(300px,90vw)] p-4">
				<div class="flex flex-col gap-3">
					<div class="flex items-center justify-between gap-2">
						<span class="min-w-0 truncate text-sm font-medium text-foreground">{label}</span>
						<button
							type="button"
							aria-label={audio.muted ? 'Unmute stream' : 'Mute stream'}
							title={audio.muted ? 'Unmute stream' : 'Mute stream'}
							onclick={() => voiceState.setStreamMuted(userId, !audio.muted)}
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {audio.muted
								? 'text-destructive'
								: ''}"
						>
							{#if audio.muted}
								<VolumeX size={16} strokeWidth={1.75} />
							{:else}
								<Volume2 size={16} strokeWidth={1.75} />
							{/if}
						</button>
					</div>
					<div class="flex items-center gap-3">
						<input
							type="range"
							min="0"
							max="100"
							step="5"
							value={percent}
							aria-label={label}
							oninput={(e) =>
								voiceState.setStreamVolume(userId, e.currentTarget.valueAsNumber / 100)}
							class="h-2 min-w-0 flex-1 cursor-pointer accent-primary"
						/>
						<span class="w-10 shrink-0 text-right text-sm text-foreground tabular-nums">
							{percent}%
						</span>
					</div>
				</div>
			</Popover.Content>
		</Popover.Root>
	{/if}
</div>
