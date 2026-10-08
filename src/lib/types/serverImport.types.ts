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

export type PlanChannel = {
	source_id: string;
	name: string;
	type: 'text' | 'voice' | 'forum';
	action: 'create' | 'existing' | 'skipped';
	/** The existing channel's name when action is "existing". */
	target_name: string | null;
	/** Why a channel is skipped. */
	reason: string | null;
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
};
