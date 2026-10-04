import type { User } from './auth.types';

export type ServerSettings = {
	/** Text channel that opening the server lands in; absent shows the welcome screen. */
	default_channel_id?: number | null;
	[key: string]: any;
};

export type ServerProfile = {
	icon?: string;
	welcome_message?: string | null;
	[key: string]: any;
};

export type Server = {
	id?: number;
	name: string;
	created_at?: string;
	server_profile?: ServerProfile;
	server_settings?: ServerSettings;
	icon_text?: string | null;
	icon_tone?: number | null;
	owner_id?: number | null;
	members?: User[];
	/** The caller's effective permission mask for this server, as a decimal string. */
	permissions?: string;
};

export type ServerMember = {
	user: User;
	joined_at: string;
	is_owner: boolean;
	role_ids: number[];
};

export type Role = {
	id: number;
	name: string;
	allow: string;
	deny: string;
	parent_id: number | null;
	is_default: boolean;
};
