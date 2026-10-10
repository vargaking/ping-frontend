import type {
	AuthorMapping,
	Import,
	ImportAuthor,
	ImportLimits,
	Plan,
	PlanChannel,
	PlanTotals
} from '$lib/types/serverImport.types';

/** An import still being worked on by the server. */
export const isWorking = (status: Import['status'] | undefined): boolean =>
	status === 'unpacking' || status === 'importing';

/**
 * Fold a server_import_updated frame into what we know. The frame leaves out
 * the plan, result and authors, so those stay as they are; a changed status
 * (or an import we haven't seen) means they may be stale and need a refetch.
 */
export function mergeImportFrame(
	current: Import | null,
	incoming: Import
): { merged: Import; refetch: boolean } {
	if (!current || current.id !== incoming.id) return { merged: incoming, refetch: true };
	return {
		merged: {
			...incoming,
			plan: current.plan,
			result: current.result,
			authors: current.authors
		},
		refetch: current.status !== incoming.status
	};
}

export function percent(done: number, total: number): number {
	if (total <= 0) return 0;
	return Math.max(0, Math.min(100, Math.floor((done / total) * 100)));
}

/** Checks made before any request; returns the message to show, or null when the file can go up. */
export function fileProblem(
	file: File,
	limits: ImportLimits,
	formatSize: (bytes: number) => string
): string | null {
	if (!file.name.toLowerCase().endsWith('.zip')) return 'Choose the .zip file the exporter wrote.';
	if (file.size <= 0) return 'That file is empty.';
	if (file.size > limits.max_bytes) {
		return `That file is larger than the limit (${formatSize(limits.max_bytes)}).`;
	}
	return null;
}

const numberFormat = new Intl.NumberFormat('en');

/** "1 message", "1,204 messages". */
export const count = (n: number, one: string, many = `${one}s`) =>
	`${numberFormat.format(n)} ${n === 1 ? one : many}`;

const PLATFORMS: Record<string, string> = { discord: 'Discord' };

export function platformName(source: Import['source']): string {
	return source ? (PLATFORMS[source.platform] ?? source.platform) : '';
}

/**
 * The totals a finished import brought in. The plan covers the whole import, while the
 * result only reports the last run, which is partial after a resumed import.
 */
export function importedTotals(imp: Pick<Import, 'plan' | 'result'>): PlanTotals | null {
	return (imp.plan ?? imp.result)?.totals ?? null;
}

/** "12 messages, 3 forum posts, 40 attachments (1.2 MB)". */
export function totalsLine(totals: PlanTotals, formatSize: (bytes: number) => string): string {
	return [
		count(totals.messages, 'message'),
		count(totals.posts, 'forum post'),
		`${count(totals.attachments, 'attachment')} (${formatSize(totals.attachment_bytes)})`
	].join(', ');
}

export function existingLine(existing: number): string | null {
	if (existing <= 0) return null;
	return `${numberFormat.format(existing)} ${existing === 1 ? 'is' : 'are'} already here and will be skipped`;
}

export function channelAction(channel: PlanChannel): string {
	const prefix = channel.type === 'voice' ? '' : '#';
	const name = `${prefix}${channel.target_name ?? channel.name}`;
	if (channel.action === 'create') {
		return channel.name_taken
			? `New channel (${name} already exists, this adds a second one)`
			: 'New channel';
	}
	if (channel.action === 'existing') return `Continue in ${name}`;
	return channel.reason ? `Skipped: ${channel.reason}` : 'Skipped';
}

/** What a channel brings in, for the right-hand side of its row. */
export function channelCounts(channel: PlanChannel): string {
	if (channel.action === 'skipped' || channel.type === 'voice') return '';
	const messages = count(channel.messages, 'message');
	return channel.type === 'forum' ? `${count(channel.posts, 'post')}, ${messages}` : messages;
}

/** What a plan leaves out, as plain lines; nothing for counts of zero. */
export function notImportedLines(plan: Plan): string[] {
	const out = plan.left_out;
	const lines: [number, string][] = [
		[out.private_channels, count(out.private_channels, 'private channel')],
		[
			out.unreadable_channels,
			`${count(out.unreadable_channels, 'channel')} the exporter couldn't read`
		],
		[out.text_channel_threads, `${count(out.text_channel_threads, 'thread')} inside text channels`],
		[out.messages_with_reactions, `Reactions on ${count(out.messages_with_reactions, 'message')}`],
		[out.pinned_messages, `Pins on ${count(out.pinned_messages, 'message')}`],
		[
			out.voice_text_chat,
			`${count(out.voice_text_chat, 'message')} from the text chat of voice channels`
		],
		[out.emoji, count(out.emoji, 'custom emoji', 'custom emoji')],
		[out.avatars, count(out.avatars, 'avatar')],
		[plan.over_cap, `${count(plan.over_cap, 'file')} over the size limit`],
		[plan.missing, `${count(plan.missing, 'file')} missing from the export`],
		[
			out.over_attachment_limit,
			`${count(out.over_attachment_limit, 'attachment')} beyond the per-message limit`
		],
		[
			out.tags_over_limit,
			`${count(out.tags_over_limit, 'forum tag')} beyond the per-channel limit`
		],
		[out.empty_messages, count(out.empty_messages, 'empty message')],
		[
			out.invalid_messages,
			`${count(out.invalid_messages, 'message')} whose content couldn't be stored`
		]
	];
	return lines.filter(([n]) => n > 0).map(([, text]) => text);
}

export function mappingOf(authors: ImportAuthor[]): AuthorMapping {
	return Object.fromEntries(authors.map((a) => [a.id, a.user_id]));
}

export function mappedCount(authors: ImportAuthor[], mapping: AuthorMapping): number {
	return authors.filter((a) => mapping[a.id] != null).length;
}

/** Whether the picks differ from what the server has saved. */
export function mappingChanged(authors: ImportAuthor[], mapping: AuthorMapping): boolean {
	return authors.some((a) => (mapping[a.id] ?? null) !== a.user_id);
}

/** The full mapping as the server takes it: unmatched authors are left out. */
export function mappingPayload(authors: ImportAuthor[], mapping: AuthorMapping): AuthorMapping {
	const payload: AuthorMapping = {};
	for (const author of authors) {
		const userId = mapping[author.id];
		if (userId != null) payload[author.id] = userId;
	}
	return payload;
}

export type AuthorsFileResult =
	| {
			ok: true;
			/** Source author id to member id. */
			matched: AuthorMapping;
			noMember: string[];
			notInExport: string[];
	  }
	| { ok: false; error: string };

/**
 * Read an authors.json (source author id to username) and match it against
 * this import's authors and the server's members, ignoring case.
 */
export function matchAuthorsFile(
	text: string,
	authors: ImportAuthor[],
	members: { id: number; username: string }[]
): AuthorsFileResult {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return { ok: false, error: "That file isn't valid JSON." };
	}
	const wrongShape = {
		ok: false as const,
		error: 'Expected an object that maps author ids to usernames.'
	};
	if (data === null || typeof data !== 'object' || Array.isArray(data)) return wrongShape;
	const entries = Object.entries(data as Record<string, unknown>);
	if (entries.some(([, name]) => typeof name !== 'string')) return wrongShape;

	const known = new Set(authors.map((a) => a.id));
	const byName = new Map<string, number>();
	for (const member of members) {
		const key = member.username.toLowerCase();
		if (!byName.has(key)) byName.set(key, member.id);
	}

	const matched: AuthorMapping = {};
	const noMember: string[] = [];
	const notInExport: string[] = [];
	for (const [authorId, name] of entries as [string, string][]) {
		if (!known.has(authorId)) {
			notInExport.push(authorId);
			continue;
		}
		const userId = byName.get(name.trim().toLowerCase());
		if (userId === undefined) noMember.push(name);
		else matched[authorId] = userId;
	}
	return { ok: true, matched, noMember, notInExport };
}

/** "a, b, c" for up to `max` items, then "and n more". */
export function listCapped(items: string[], max = 10): string {
	if (items.length <= max) return items.join(', ');
	return `${items.slice(0, max).join(', ')} and ${items.length - max} more`;
}
