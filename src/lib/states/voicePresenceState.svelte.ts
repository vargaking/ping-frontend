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
	/** One set per in-flight load: channels that got a newer live frame meanwhile. */
	private pendingLoads: Array<Set<number>> = [];

	participants(channelId: number): VoicePresenceParticipant[] {
		return this.channels.get(channelId)?.participants ?? [];
	}

	apply(serverId: number, channelId: number, participants: VoicePresenceParticipant[]) {
		for (const fresh of this.pendingLoads) fresh.add(channelId);
		this.set(serverId, channelId, participants);
	}

	private set(serverId: number, channelId: number, participants: VoicePresenceParticipant[]) {
		if (participants.length === 0) {
			this.channels.delete(channelId);
			return;
		}
		this.channels.set(channelId, { serverId, participants });
	}

	async load(serverId: number) {
		const fresh = new Set<number>();
		this.pendingLoads.push(fresh);
		let fetched: VoicePresenceChannel[];
		try {
			fetched = await getVoicePresence(serverId);
		} catch (error) {
			console.warn('Failed to load voice presence', error);
			return;
		} finally {
			this.pendingLoads = this.pendingLoads.filter((s) => s !== fresh);
		}

		for (const [channelId, entry] of [...this.channels]) {
			if (entry.serverId === serverId && !fresh.has(channelId)) this.channels.delete(channelId);
		}
		for (const channel of fetched) {
			if (!fresh.has(channel.channel_id)) {
				this.set(serverId, channel.channel_id, channel.participants);
			}
		}
	}

	forgetChannel(channelId: number) {
		this.channels.delete(channelId);
	}
}

export const voicePresenceState = new VoicePresenceState();
