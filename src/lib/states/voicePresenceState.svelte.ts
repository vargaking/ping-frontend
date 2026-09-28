import { SvelteMap } from 'svelte/reactivity';
import { getVoicePresence } from '$lib/requests/voice/getVoicePresence';
import type { VoicePresenceChannel, VoicePresenceParticipant } from '$lib/types/voice.types';

type ChannelPresence = { serverId: number; participants: VoicePresenceParticipant[] };

/**
 * Who is in each voice channel, for channels the user is not connected to.
 * Loaded when a server opens and kept current by voice_state frames.
 */
class VoicePresenceState {
	/** Keyed by channel id. Empty channels have no entry. */
	private channels = new SvelteMap<number, ChannelPresence>();

	participants(channelId: number): VoicePresenceParticipant[] {
		return this.channels.get(channelId)?.participants ?? [];
	}

	apply(serverId: number, channelId: number, participants: VoicePresenceParticipant[]) {
		if (participants.length === 0) {
			this.channels.delete(channelId);
			return;
		}
		this.channels.set(channelId, { serverId, participants });
	}

	async load(serverId: number) {
		let fetched: VoicePresenceChannel[];
		try {
			fetched = await getVoicePresence(serverId);
		} catch (error) {
			console.warn('Failed to load voice presence', error);
			return;
		}

		for (const [channelId, entry] of [...this.channels]) {
			if (entry.serverId === serverId) this.channels.delete(channelId);
		}
		for (const channel of fetched) {
			this.apply(serverId, channel.channel_id, channel.participants);
		}
	}

	forgetChannel(channelId: number) {
		this.channels.delete(channelId);
	}
}

export const voicePresenceState = new VoicePresenceState();
