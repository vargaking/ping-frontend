export type Channel = {
	id: number;
	name: string;
	channel_settings: object;
	type: 'text' | 'voice';
	/** Message uuids, null when nothing has been read/sent yet. */
	last_read_message_id?: string | null;
	last_message_id?: string | null;
};
