export type InviteBase = {
	server_id: number;
	valid_until?: string | null;
	max_uses?: number | null;
};

export type InviteCreate = InviteBase & {
	password?: string | null;
};

export type InviteUpdate = {
	valid_until?: string | null;
	max_uses?: number | null;
	is_active?: boolean | null;
};

export type InviteResponse = InviteBase & {
	id: string;
	created_by_id: number;
	created_at: string;
	use_count: number;
	is_active: boolean;
	has_password: boolean;
};

export type InvitePublicResponse = {
	id: string;
	server_id: number;
	is_valid: boolean;
	has_password: boolean;
};

export type InviteUseRequest = {
	password?: string | null;
};

export type InviteUseResponse = {
	detail: string;
	server_id: number;
};
