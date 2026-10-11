export type ImportStatus = 'uploading' | 'unpacking' | 'ready' | 'importing' | 'done' | 'failed';
export type ImportPhase = 'queued' | 'unpacking' | 'checking' | 'importing' | 'authors';
export type ImportStep = 'unpacking' | 'importing';

export type ImportLimits = {
	/** Largest accepted zip; 0 means imports are turned off. */
	max_bytes: number;
	chunk_bytes: number;
};

export type ImportProgress = {
	phase: ImportPhase;
	/** Bytes while unpacking, messages while checking, importing and updating authors. */
	done: number;
	total: number;
	label: string | null;
};

export type ImportAuthor = {
	id: string;
	name: string;
	messages: number;
	user_id: number | null;
};

export type PrivateVisibility = 'only_me' | 'everyone';

/** Source channel id to who can see the private channel it becomes. */
export type PrivateSelection = Record<string, PrivateVisibility>;

export type PlanChannel = {
	source_id: string;
	name: string;
	type: 'text' | 'voice' | 'forum';
	action: 'create' | 'existing' | 'skipped';
	/** The existing channel's name when action is "existing". */
	target_name: string | null;
	/** Why a channel is skipped. */
	reason: string | null;
	/** A create row whose name matches a channel already on the server. Absent on older servers. */
	name_taken?: boolean;
	/** Absent on plans made before private channels could be imported. */
	private?: boolean;
	/** What ticking a private channel would do; null means it can't be selected. */
	private_action?: 'create' | 'existing' | null;
	/** Set on a private channel the run created. */
	visibility?: PrivateVisibility | null;
	category: string | null;
	messages: number;
	existing_messages: number;
	posts: number;
	existing_posts: number;
	attachments: number;
	attachment_bytes: number;
	handed_over: number;
};

export type PlanTotals = {
	messages: number;
	existing_messages: number;
	posts: number;
	attachments: number;
	attachment_bytes: number;
};

export type PlanLeftOut = {
	private_channels: number;
	unreadable_channels: number;
	text_channel_threads: number;
	messages_with_reactions: number;
	pinned_messages: number;
	voice_text_chat: number;
	emoji: number;
	avatars: number;
	over_attachment_limit: number;
	tags_over_limit: number;
	empty_messages: number;
	invalid_messages: number;
};

export type Plan = {
	channels: PlanChannel[];
	totals: PlanTotals;
	free_bytes: number;
	over_cap: number;
	missing: number;
	left_out: PlanLeftOut;
	warnings: string[];
};

export type Import = {
	id: string;
	status: ImportStatus;
	filename: string;
	size: number;
	received: number;
	/** Known from "ready" on. */
	source: { platform: string; server_name: string } | null;
	progress: ImportProgress | null;
	failed_step: ImportStep | null;
	error: string | null;
	/** The dry run, from "ready" on. */
	plan: Plan | null;
	/** The finished real run, from "done" on. */
	result: Plan | null;
	/** The private channels picked at the last start. Absent on older servers. */
	private_channels?: PrivateSelection;
	authors: ImportAuthor[];
	created_at: string;
	updated_at: string;
};

export type ImportsResponse = {
	limits: ImportLimits;
	import: Import | null;
};

export type ImportPiece = {
	received: number;
	status: 'uploading' | 'unpacking';
};

/** Source author id to server member id; null or a missing id means unmatched. */
export type AuthorMapping = Record<string, number | null>;

/** Carries the import without its plan, result and authors. */
export type ServerImportUpdatedFrame = {
	type: 'server_import_updated';
	server_id: number;
	import: Import;
};

export type ServerImportFinishedFrame = {
	type: 'server_import_finished';
	server_id: number;
	/** Channels the run wrote to that we can view; absent from older servers (= every channel). */
	channel_ids?: number[];
};
