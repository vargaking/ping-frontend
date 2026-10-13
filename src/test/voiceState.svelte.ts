import type { voiceState as realVoiceState } from '$lib/states/voiceState.svelte';

type Flags = Pick<typeof realVoiceState, 'connected' | 'connecting' | 'reconnecting'>;

/** A reactive stand-in for `voiceState` that skips LiveKit and the rest of its module graph. */
export const voiceState: Flags = $state({
	connected: false,
	connecting: false,
	reconnecting: false
});
