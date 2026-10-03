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

export type AdminVoiceStatus = 'ok' | 'unconfigured' | 'unreachable';

/** A section is null when the server could not read its source. */
export type AdminStats = {
	generated_at: string;
	load: AdminLoad | null;
	voice: AdminVoice | null;
	voice_status?: AdminVoiceStatus;
	users: AdminUsers | null;
	servers: AdminServers | null;
	errors: AdminErrors | null;
};

export type AdminErrorSource = 'client' | 'server';

export type AdminErrorGroup = {
	source: AdminErrorSource;
	kind: string;
	message: string;
	method: string | null;
	path: string | null;
	count: number;
	first_at: string;
	last_at: string;
	user_id: number | null;
	request_id: string | null;
	stack: string | null;
};

export type AdminErrorList = {
	since: string;
	limit: number;
	groups: AdminErrorGroup[];
};

export type AdminHistoryRange = '1h' | '24h' | '7d' | '30d';

export type AdminHistoryMetric =
	| 'net_out_mbps'
	| 'net_in_mbps'
	| 'cpu_percent'
	| 'ram_percent'
	| 'online_users'
	| 'active_users'
	| 'voice_rooms'
	| 'voice_participants'
	| 'screenshares';

export type AdminHistorySeries = {
	avg: (number | null)[];
	max: (number | null)[];
};

export type AdminHistoryPeak = { value: number; at: string };

/** Series are aligned with `buckets`; an empty bucket is null. */
export type AdminStatsHistory = {
	range: AdminHistoryRange;
	bucket_seconds: number;
	from: string;
	to: string;
	uplink_mbps: number;
	sampling: boolean;
	buckets: string[];
	series: Record<AdminHistoryMetric, AdminHistorySeries>;
	peaks: Record<AdminHistoryMetric, AdminHistoryPeak | null>;
};
