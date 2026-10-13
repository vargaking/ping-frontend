import { describe, expect, it } from 'vitest';
import type { AuthorEntry } from './searchAuthors';
import { normalizeName } from './searchFacets';
import {
	buildSuggestions,
	MAX_SUGGESTIONS,
	suggestionContext,
	type SuggestionContext
} from './searchSuggestions';

const author = (
	name: string,
	source: AuthorEntry['source'] = 'user',
	id = name.length
): AuthorEntry => ({
	key: source === 'imported' ? `name:${normalizeName(name)}` : `user:${id}`,
	name,
	norm: normalizeName(name),
	source
});

const build = (rest: string, authors: AuthorEntry[] = [], fromChip = false) => {
	const ctx = suggestionContext(rest, rest.length, fromChip);
	if (!ctx) return null;
	return buildSuggestions(ctx, { authors, now: new Date(2026, 9, 14), firstDay: 1 });
};

describe('suggestionContext', () => {
	it.each<[string, number, boolean, string | null]>([
		['from:', 5, false, 'author'],
		['from:de', 7, false, 'author'],
		['mirage from:de', 14, false, 'author'],
		['from:de', 3, false, null],
		['from:de', 4, false, null],
		['from:de', 5, false, 'author'],
		['from:de', 7, true, null],
		['from:"a"b', 8, false, null],
		['has:', 4, false, 'has'],
		['has:im', 6, false, 'has'],
		['has:image', 9, false, 'has'],
		['before:', 7, false, 'date'],
		['after:', 6, false, 'date'],
		['during:', 7, false, 'date'],
		['after:2026', 10, false, null],
		['mirage', 6, false, null],
		['foo:', 4, false, null],
		['', 0, false, null]
	])('%j with the caret at %i (chip %s) gives %s', (rest, caret, fromChip, kind) => {
		expect(suggestionContext(rest, caret, fromChip)?.kind ?? null).toBe(kind);
	});

	it('keeps the term so it can be replaced', () => {
		const ctx = suggestionContext('mirage from:de', 14, false);
		expect(ctx?.term).toMatchObject({ start: 7, end: 14, value: 'de' });
	});
});

describe('author suggestions', () => {
	const people = [
		author('Dénes', 'imported'),
		author('Dani', 'member', 1),
		author('Old Name', 'imported'),
		author('Eve', 'user', 3)
	];

	it('lists everyone for an empty value, in the order given', () => {
		expect(build('from:', people)?.map((s) => s.label)).toEqual([
			'Dénes',
			'Dani',
			'Old Name',
			'Eve'
		]);
	});

	it('matches the start of a name, ignoring accents and case', () => {
		expect(build('from:DEN', people)?.map((s) => s.label)).toEqual(['Dénes']);
		expect(build('from:dén', people)?.map((s) => s.label)).toEqual(['Dénes']);
		expect(build('from:da', people)?.map((s) => s.label)).toEqual(['Dani']);
	});

	it('quotes a name with a space and marks imported authors', () => {
		expect(build('from:old', people)).toEqual([
			{ key: 'name:old name', label: 'Old Name', detail: 'Imported', insert: 'from:"Old Name"' }
		]);
		expect(build('from:da', people)?.[0]).toMatchObject({
			key: 'user:1',
			detail: '',
			insert: 'from:Dani'
		});
	});

	it('leaves out names that contain a quote', () => {
		expect(build('from:', [author('Say "hi"'), author('Eve')])?.map((s) => s.label)).toEqual([
			'Eve'
		]);
	});

	it('shows at most eight', () => {
		const many = Array.from({ length: 12 }, (_, i) => author(`user${i}`, 'user', i));
		expect(build('from:', many)).toHaveLength(MAX_SUGGESTIONS);
	});

	it.each<[string, boolean]>([
		['from:dani', true],
		['from:danie', false],
		['from:"Old Name"', true],
		['from:"Old Name', false]
	])('for %s the list is closed: %s', (rest, closed) => {
		const found = build(rest, [author('Dani', 'member', 1), author('Daniel'), author('Old Name')]);
		expect(found?.length === 0).toBe(closed);
	});

	it('offers the closing quote for an unclosed exact name', () => {
		expect(build('from:"Old Name', [author('Old Name')])).toHaveLength(1);
	});
});

describe('has suggestions', () => {
	it.each<[string, string[]]>([
		['has:', ['file', 'image', 'video', 'link']],
		['has:im', ['image']],
		['has:IM', ['image']],
		['has:i', ['image']],
		['has:l', ['link']],
		['has:image', []],
		['has:LINK', []],
		['has:pdf', []]
	])('%s lists %j', (rest, expected) => {
		expect(build(rest)?.map((s) => s.label)).toEqual(expected);
	});

	it('inserts the filter and explains it', () => {
		expect(build('has:vid')).toEqual([
			{
				key: 'has:video',
				label: 'video',
				detail: 'Messages with a video',
				insert: 'has:video'
			}
		]);
	});
});

describe('date suggestions', () => {
	it.each(['before:', 'after:', 'during:'])('%s offers the four quick dates', (rest) => {
		const ctx = suggestionContext(rest, rest.length, false) as SuggestionContext;
		const found = buildSuggestions(ctx, {
			authors: [],
			now: new Date(2026, 9, 14),
			firstDay: 1
		});
		expect(found.map((s) => [s.label, s.insert])).toEqual([
			['Today', 'during:2026-10-14'],
			['Yesterday', 'during:2026-10-13'],
			['This week', 'after:2026-10-12'],
			['This month', 'during:2026-10']
		]);
		expect(found.every((s) => s.detail === s.insert)).toBe(true);
	});
});
