export type VoicePresenceParticipant = {
	user_id: number;
	muted: boolean;
	deafened: boolean;
	server_muted: boolean;
};

export type VoicePresenceChannel = {
	channel_id: number;
	participants: VoicePresenceParticipant[];
};
