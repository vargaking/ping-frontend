export type AdminLoad = {
	uplink_mbps: number;
	net_out_mbps: number | null;
	net_in_mbps: number | null;
	cpu_percent: number;
	ram_used_bytes: number;
	ram_total_bytes: number;
	disk_free_bytes: number;
	disk_total_bytes: number;
};

export type AdminVoice = {
	rooms: number;
	participants: number;
	screenshares: { width: number; height: number }[];
};

export type AdminUsers = {
	total: number;
	new_7d: number;
	active_now: number;
	online: number;
	dau: number;
	wau: number;
};

export type AdminServer = {
	id: number;
	name: string;
	members: number;
	messages_24h: number;
	messages_total: number;
	in_voice: number;
	created_at: string;
};

export type AdminServers = {
	total: number;
	pending_requests: number;
	list: AdminServer[];
};

export type AdminErrors = {
	client_24h: number;
	server_5xx_24h: number;
	since: string;
};

/** A section is null when the server could not read its source. */
export type AdminStats = {
	generated_at: string;
	load: AdminLoad | null;
	voice: AdminVoice | null;
	users: AdminUsers | null;
	servers: AdminServers | null;
	errors: AdminErrors | null;
};
