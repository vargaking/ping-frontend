export type VoiceTapOutcome = 'sheet' | 'join' | 'view';

/** What tapping a voice channel in the sidebar does. */
export function decideVoiceTap(state: {
	phone: boolean;
	inChannel: boolean;
	canConnect: boolean;
}): VoiceTapOutcome {
	if (state.inChannel || !state.canConnect) return 'view';
	return state.phone ? 'sheet' : 'join';
}

/** The sheet's note for someone already in a call, or null when joining moves nobody. */
export function movingNotice(
	current: { channelId: number | null; channelName: string | null },
	targetId: number
): string | null {
	if (current.channelId == null || current.channelId === targetId) return null;
	return current.channelName
		? `Joining will move you from ${current.channelName}.`
		: 'Joining will move you from your current voice channel.';
}
