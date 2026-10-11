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

export interface SelfStateControls {
	muted: boolean;
	deafened: boolean;
	toggleMute(): Promise<void>;
	toggleDeafen(): Promise<void>;
}

/** Sets the saved mute choice the next join applies, leaving deafen as it was. */
export async function setSavedMute(voice: SelfStateControls, muted: boolean) {
	if (voice.muted === muted) return;
	// Toggling mute while deafened would undeafen, so deafen steps aside for it.
	const deafened = voice.deafened;
	if (deafened) await voice.toggleDeafen();
	await voice.toggleMute();
	if (deafened) await voice.toggleDeafen();
}
