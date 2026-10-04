export type Channel = {
	id: number;
	name: string;
	channel_settings: object;
	type: 'text' | 'voice';
	topic?: string | null;
	/** The category the channel sits in; null when it is ungrouped. */
	group_id: number | null;
	position: number;
	/** Message uuids, null when nothing has been read/sent yet. */
	last_read_message_id?: string | null;
	last_message_id?: string | null;
};

export type ChannelGroup = {
	id: number;
	server_id: number;
	name: string;
	position: number;
};

export type ChannelLayout = {
	ungrouped: number[];
	groups: { id: number; channel_ids: number[] }[];
};

export type ChannelSnapshot = {
	groups: ChannelGroup[];
	channels: Channel[];
};
