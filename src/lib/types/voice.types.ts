export type VoicePresenceParticipant = { user_id: number; muted: boolean; deafened: boolean };

export type VoicePresenceChannel = {
	channel_id: number;
	participants: VoicePresenceParticipant[];
};
