import { describe, expect, it } from 'vitest';
import type {
	Import,
	ImportAuthor,
	Plan,
	PlanChannel,
	PlanLeftOut
} from '$lib/types/serverImport.types';
import {
	channelAction,
	channelCounts,
	existingLine,
	fileProblem,
	isWorking,
	listCapped,
	mappedCount,
	mappingChanged,
	mappingOf,
	mappingPayload,
	matchAuthorsFile,
	mergeImportFrame,
	notImportedLines,
	percent,
	platformName,
	totalsLine
} from './serverImport';

const noLeftOut: PlanLeftOut = {
	private_channels: 0,
	unreadable_channels: 0,
	text_channel_threads: 0,
	messages_with_reactions: 0,
	pinned_messages: 0,
	voice_text_chat: 0,
	emoji: 0,
	avatars: 0,
	over_attachment_limit: 0,
	tags_over_limit: 0,
	empty_messages: 0,
	invalid_messages: 0
};

function plan(fields: Partial<Plan> = {}): Plan {
	return {
		channels: [],
		totals: { messages: 0, existing_messages: 0, posts: 0, attachments: 0, attachment_bytes: 0 },
		free_bytes: 0,
		over_cap: 0,
		missing: 0,
		left_out: noLeftOut,
		warnings: [],
		...fields
	};
}

function channel(fields: Partial<PlanChannel> = {}): PlanChannel {
	return {
		source_id: '1',
		name: 'general',
		type: 'text',
		action: 'create',
		target_name: null,
		reason: null,
		category: null,
		messages: 0,
		existing_messages: 0,
		posts: 0,
		existing_posts: 0,
		attachments: 0,
		attachment_bytes: 0,
		handed_over: 0,
		...fields
	};
}

function importWith(fields: Partial<Import> = {}): Import {
	return {
		id: 'imp-1',
		status: 'ready',
		filename: 'bundle.zip',
		size: 100,
		received: 100,
		source: { platform: 'discord', server_name: 'Deducks' },
		progress: null,
		failed_step: null,
		error: null,
		plan: plan(),
		result: null,
		authors: [],
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		...fields
	};
}

const authors: ImportAuthor[] = [
	{ id: '100', name: 'Alice', messages: 10, user_id: null },
	{ id: '200', name: 'Bob', messages: 5, user_id: 7 },
	{ id: '300', name: 'Cy', messages: 1, user_id: null }
];
const members = [
	{ id: 1, username: 'alice' },
	{ id: 2, username: 'Bobby' },
	{ id: 7, username: 'bob' }
];

describe('mergeImportFrame', () => {
	const known = importWith({
		status: 'importing',
		plan: plan({ over_cap: 2 }),
		result: plan({ missing: 1 }),
		authors
	});

	it('keeps the plan, result and authors the frame leaves out', () => {
		const frame = importWith({
			status: 'importing',
			progress: { phase: 'importing', done: 5, total: 10, label: 'general' },
			plan: null,
			result: null,
			authors: []
		});

		const { merged, refetch } = mergeImportFrame(known, frame);

		expect(merged.progress?.done).toBe(5);
		expect(merged.plan).toBe(known.plan);
		expect(merged.result).toBe(known.result);
		expect(merged.authors).toBe(known.authors);
		expect(refetch).toBe(false);
	});

	it('asks for a refetch when the status changed', () => {
		const frame = importWith({ status: 'done', plan: null, authors: [] });

		const { merged, refetch } = mergeImportFrame(known, frame);

		expect(merged.status).toBe('done');
		expect(merged.authors).toBe(known.authors);
		expect(refetch).toBe(true);
	});

	it('takes an import it has not seen as it is and refetches', () => {
		const frame = importWith({ id: 'imp-2', plan: null });

		expect(mergeImportFrame(known, frame)).toEqual({ merged: frame, refetch: true });
		expect(mergeImportFrame(null, frame)).toEqual({ merged: frame, refetch: true });
	});
});

describe('isWorking', () => {
	it('is true while the server unpacks or imports', () => {
		expect(['unpacking', 'importing'].map((s) => isWorking(s as Import['status']))).toEqual([
			true,
			true
		]);
		expect(
			['uploading', 'ready', 'done', 'failed', undefined].map((s) => isWorking(s as never))
		).toEqual(Array(5).fill(false));
	});
});

describe('percent', () => {
	it('rounds down and stays within 0 to 100', () => {
		expect(percent(1, 3)).toBe(33);
		expect(percent(5, 0)).toBe(0);
		expect(percent(12, 10)).toBe(100);
		expect(percent(-1, 10)).toBe(0);
	});
});

describe('fileProblem', () => {
	const limits = { max_bytes: 10, chunk_bytes: 4 };
	const size = (n: number) => `${n} B`;

	it('accepts a zip within the limit, whatever the case of its name', () => {
		expect(fileProblem(new File(['abc'], 'Export.ZIP'), limits, size)).toBeNull();
		expect(fileProblem(new File(['0123456789'], 'a.zip'), limits, size)).toBeNull();
	});

	it('rejects other names, empty files and files over the limit', () => {
		expect(fileProblem(new File(['abc'], 'a.tar'), limits, size)).toMatch(/\.zip/);
		expect(fileProblem(new File([], 'a.zip'), limits, size)).toBe('That file is empty.');
		expect(fileProblem(new File(['0123456789a'], 'a.zip'), limits, size)).toBe(
			'That file is larger than the limit (10 B).'
		);
	});
});

describe('notImportedLines', () => {
	it('lists only what is above zero, with singular and plural forms', () => {
		const lines = notImportedLines(
			plan({
				over_cap: 2,
				missing: 1,
				left_out: {
					...noLeftOut,
					private_channels: 3,
					text_channel_threads: 5,
					messages_with_reactions: 1,
					pinned_messages: 4,
					emoji: 12,
					avatars: 1
				}
			})
		);

		expect(lines).toEqual([
			'3 private channels',
			'5 threads inside text channels',
			'Reactions on 1 message',
			'Pins on 4 messages',
			'12 custom emoji',
			'1 avatar',
			'2 files over the size limit',
			'1 file missing from the export'
		]);
	});

	it('is empty when nothing was left out', () => {
		expect(notImportedLines(plan())).toEqual([]);
	});

	it('groups thousands', () => {
		const lines = notImportedLines(
			plan({ left_out: { ...noLeftOut, messages_with_reactions: 12345 } })
		);
		expect(lines).toEqual(['Reactions on 12,345 messages']);
	});
});

describe('plan formatting', () => {
	it('summarises the totals', () => {
		const totals = {
			messages: 1204,
			existing_messages: 0,
			posts: 1,
			attachments: 40,
			attachment_bytes: 2048
		};
		expect(totalsLine(totals, (n) => `${n / 1024} KB`)).toBe(
			'1,204 messages, 1 forum post, 40 attachments (2 KB)'
		);
	});

	it('mentions skipped messages only when there are some', () => {
		expect(existingLine(0)).toBeNull();
		expect(existingLine(1)).toBe('1 is already here and will be skipped');
		expect(existingLine(30)).toBe('30 are already here and will be skipped');
	});

	it('says what happens to a channel', () => {
		expect(channelAction(channel())).toBe('New channel');
		expect(channelAction(channel({ action: 'existing', target_name: 'chat' }))).toBe(
			'Into existing #chat'
		);
		expect(channelAction(channel({ action: 'skipped', reason: 'private' }))).toBe(
			'Skipped: private'
		);
	});

	it('counts what a channel brings in', () => {
		expect(channelCounts(channel({ messages: 3 }))).toBe('3 messages');
		expect(channelCounts(channel({ type: 'forum', posts: 2, messages: 9 }))).toBe(
			'2 posts, 9 messages'
		);
		expect(channelCounts(channel({ type: 'voice' }))).toBe('');
		expect(channelCounts(channel({ action: 'skipped', messages: 4 }))).toBe('');
	});

	it('names the platform', () => {
		expect(platformName({ platform: 'discord', server_name: 'x' })).toBe('Discord');
		expect(platformName({ platform: 'slack', server_name: 'x' })).toBe('slack');
		expect(platformName(null)).toBe('');
	});
});

describe('author mapping', () => {
	it('reads the saved mapping and compares picks against it', () => {
		const saved = mappingOf(authors);
		expect(saved).toEqual({ '100': null, '200': 7, '300': null });
		expect(mappedCount(authors, saved)).toBe(1);
		expect(mappingChanged(authors, saved)).toBe(false);
		expect(mappingChanged(authors, { ...saved, '100': 1 })).toBe(true);
		expect(mappingChanged(authors, { ...saved, '200': null })).toBe(true);
	});

	it('treats a missing pick like an unmatched one', () => {
		expect(mappingChanged(authors, { '200': 7 })).toBe(false);
	});

	it('sends only matched authors', () => {
		expect(mappingPayload(authors, { '100': 1, '200': null, '300': null })).toEqual({ '100': 1 });
	});
});

describe('matchAuthorsFile', () => {
	it('matches usernames case-insensitively', () => {
		const result = matchAuthorsFile('{"100": "ALICE", "300": "bobby"}', authors, members);

		expect(result).toEqual({
			ok: true,
			matched: { '100': 1, '300': 2 },
			noMember: [],
			notInExport: []
		});
	});

	it('reports usernames with no member and author ids that are not in the export', () => {
		const result = matchAuthorsFile(
			'{"100": "alice", "200": "nobody", "999": "bob", "888": "ghost"}',
			authors,
			members
		);

		expect(result).toEqual({
			ok: true,
			matched: { '100': 1 },
			noMember: ['nobody'],
			notInExport: ['888', '999']
		});
	});

	it('ignores spaces around a username', () => {
		const result = matchAuthorsFile('{"100": " alice "}', authors, members);
		expect(result).toMatchObject({ ok: true, matched: { '100': 1 } });
	});

	it('accepts an empty object', () => {
		expect(matchAuthorsFile('{}', authors, members)).toEqual({
			ok: true,
			matched: {},
			noMember: [],
			notInExport: []
		});
	});

	it('rejects invalid JSON', () => {
		expect(matchAuthorsFile('{"100": ', authors, members)).toEqual({
			ok: false,
			error: "That file isn't valid JSON."
		});
	});

	it.each(['[]', 'null', '"alice"', '42', '{"100": 1}', '{"100": null}', '{"100": ["alice"]}'])(
		'rejects the wrong shape %s',
		(text) => {
			expect(matchAuthorsFile(text, authors, members)).toEqual({
				ok: false,
				error: 'Expected an object that maps author ids to usernames.'
			});
		}
	);
});

describe('listCapped', () => {
	it('joins short lists and cuts long ones', () => {
		expect(listCapped(['a', 'b'])).toBe('a, b');
		const twelve = Array.from({ length: 12 }, (_, i) => String(i + 1));
		expect(listCapped(twelve)).toBe('1, 2, 3, 4, 5, 6, 7, 8, 9, 10 and 2 more');
		expect(listCapped(twelve.slice(0, 10))).toBe(twelve.slice(0, 10).join(', '));
	});
});
