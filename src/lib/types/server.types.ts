export type ServerSettings = {
	channel_order: number[];
	[key: string]: any;
};

export type Server = {
	id: number;
	name: string;
	created_at: string;
	server_profile: Record<string, any>;
	server_settings: ServerSettings;
};
