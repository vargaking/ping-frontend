import type { User } from './auth.types';

export type ServerSettings = {
	channel_order: number[];
	[key: string]: any;
};

export type Server = {
	id?: number;
	name: string;
	created_at?: string;
	server_profile?: Record<string, any>;
	server_settings?: ServerSettings;
	owner_id?: number | null;
	members?: User[];
};

export type ServerMember = {
	user: User;
	joined_at: string;
	is_owner: boolean;
};
