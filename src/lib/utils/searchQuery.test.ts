import { describe, expect, it } from 'vitest';
import {
	FILTER_HINTS,
	hasFilters,
	parseSearchQuery,
	readTerms,
	termAt,
	type Term
} from './searchQuery';
import { tokenize } from './searchText';

const at = (y: number, m: number, d = 1) => new Date(y, m - 1, d).getTime();

describe('parseSearchQuery', () => {
	it('keeps a words-only query the same as tokenize', () => {
		const input = 'Árvíz smokes  mirage';
		expect(parseSearchQuery(input)).toEqual({
			words: tokenize(input),
			from: null,
			has: [],
			since: null,
			until: null
		});
	});

	describe('from:', () => {
		it.each([
			['from:Dani', 'dani'],
			['FROM:dani', 'dani'],
			['from:Dáni', 'dani'],
			['from:"Old  Name"', 'old name'],
			['from:"Ádám Kovács"', 'adam kovacs']
		])('%s sets the author to %j', (input, from) => {
			const query = parseSearchQuery(input);
			expect(query.from).toBe(from);
			expect(query.words).toEqual([]);
		});

		it('takes an unclosed quote to the end of the input', () => {
			const query = parseSearchQuery('mirage from:"Old Name');
			expect(query.from).toBe('old name');
			expect(query.words).toEqual(['mirage']);
		});

		it('makes a term with text glued after the quote a word', () => {
			const query = parseSearchQuery('from:"a"bc rest');
			expect(query.from).toBeNull();
			expect(query.words).toEqual(['from', 'bc', 'rest']);
		});

		it('counts only the first author', () => {
			const query = parseSearchQuery('from:dani from:alex');
			expect(query.from).toBe('dani');
			expect(query.words).toEqual(['from', 'alex']);
		});

		it.each(['from: ', 'from:""', 'from:" "'])('turns %j into a word', (input) => {
			const query = parseSearchQuery(input);
			expect(query.from).toBeNull();
			expect(query.words).toEqual(['from']);
		});

		it.each(['from:', 'mirage before:'])('ignores %j while its value is being typed', (input) => {
			const query = parseSearchQuery(input);
			expect(query.words).toEqual(input.startsWith('mirage') ? ['mirage'] : []);
			expect([query.from, query.since, query.until]).toEqual([null, null, null]);
		});
	});

	describe('has:', () => {
		it.each(['file', 'image', 'video', 'link'] as const)('accepts %s', (kind) => {
			expect(parseSearchQuery(`has:${kind.toUpperCase()}`).has).toEqual([kind]);
		});

		it('combines repeated filters once each, in typed order', () => {
			expect(parseSearchQuery('has:link has:image has:link').has).toEqual(['link', 'image']);
		});

		it('turns an unknown kind into words', () => {
			const query = parseSearchQuery('has:pdf');
			expect(query.has).toEqual([]);
			expect(query.words).toEqual(['has', 'pdf']);
		});
	});

	describe('dates', () => {
		it('reads after: as inclusive and before: as exclusive local midnight', () => {
			const query = parseSearchQuery('after:2026-03-01 before:2026-04-01');
			expect(query.since).toBe(at(2026, 3, 1));
			expect(query.until).toBe(at(2026, 4, 1));
		});

		it('reads during: a day as that day', () => {
			const query = parseSearchQuery('during:2026-03-31');
			expect(query.since).toBe(at(2026, 3, 31));
			expect(query.until).toBe(at(2026, 4, 1));
		});

		it('reads during: a month as the whole month', () => {
			const query = parseSearchQuery('during:2026-12');
			expect(query.since).toBe(at(2026, 12, 1));
			expect(query.until).toBe(at(2027, 1, 1));
		});

		it('gives the same window for after+before and during a month', () => {
			const range = parseSearchQuery('after:2026-03-01 before:2026-04-01');
			const month = parseSearchQuery('during:2026-03');
			expect([range.since, range.until]).toEqual([month.since, month.until]);
		});

		it('intersects repeated dates', () => {
			const query = parseSearchQuery(
				'after:2026-01-01 after:2026-03-01 before:2026-06-01 before:2026-05-01 during:2026-03 during:2026-02-20'
			);
			expect(query.since).toBe(at(2026, 3, 1));
			expect(query.until).toBe(at(2026, 2, 21));
		});

		it('keeps an empty window as it is', () => {
			const query = parseSearchQuery('after:2026-05-01 before:2026-04-01');
			expect(query.since).toBeGreaterThan(query.until!);
		});

		it.each([
			'before:2026-02-30',
			'before:2026-03',
			'after:2026-3-1',
			'during:2026-13',
			'during:2026-00-10',
			'after:0999-01-01',
			'before:notadate',
			'after: x'
		])('turns %s into words', (input) => {
			const query = parseSearchQuery(input);
			expect(query.since).toBeNull();
			expect(query.until).toBeNull();
			expect(query.words.length).toBeGreaterThan(0);
		});
	});

	it('combines filters with words', () => {
		const query = parseSearchQuery('mirage from:dani has:image during:2026-03 smokes');
		expect(query).toEqual({
			words: ['mirage', 'smokes'],
			from: 'dani',
			has: ['image'],
			since: at(2026, 3, 1),
			until: at(2026, 4, 1)
		});
	});

	it.each(['foo:bar', 'in:general', 'http://example.com'])('keeps %s as words', (input) => {
		const query = parseSearchQuery(input);
		expect(hasFilters(query)).toBe(false);
		expect(query.words).toEqual(tokenize(input));
	});
});

describe('hasFilters', () => {
	it.each([
		['from:dani', true],
		['has:link', true],
		['before:2026-01-01', true],
		['plain words', false],
		['has:nothing', false]
	])('%s is %s', (input, expected) => {
		expect(hasFilters(parseSearchQuery(input))).toBe(expected);
	});
});

describe('FILTER_HINTS', () => {
	it.each(FILTER_HINTS)('$insert starts the example $example', ({ insert, example }) => {
		expect(example.startsWith(insert)).toBe(true);
	});

	it.each(FILTER_HINTS.map((hint) => hint.example))(
		'the example %s is a valid filter',
		(example) => {
			expect(hasFilters(parseSearchQuery(example))).toBe(true);
		}
	);
});

describe('readTerms', () => {
	type Expected = Partial<Term> & Pick<Term, 'raw' | 'start' | 'end'>;

	it.each<[string, string, Expected[]]>([
		[
			'words',
			'mirage  smokes',
			[
				{ raw: 'mirage', start: 0, end: 6, filter: null, value: null },
				{ raw: 'smokes', start: 8, end: 14, filter: null, value: null }
			]
		],
		[
			'a filter, any case',
			'FROM:Dani',
			[{ raw: 'FROM:Dani', start: 0, end: 9, filter: 'from', value: 'Dani', applied: true }]
		],
		[
			'a quoted value',
			'x from:"Old Name" y',
			[
				{ raw: 'x', start: 0, end: 1 },
				{
					raw: 'from:"Old Name"',
					start: 2,
					end: 17,
					filter: 'from',
					value: 'Old Name',
					quoted: true,
					closed: true,
					applied: true
				},
				{ raw: 'y', start: 18, end: 19 }
			]
		],
		[
			'an unclosed quote',
			'from:"Old Name',
			[
				{
					raw: 'from:"Old Name',
					start: 0,
					end: 14,
					value: 'Old Name',
					quoted: true,
					closed: false,
					applied: true
				}
			]
		],
		[
			'text glued after the quote',
			'from:"a"b c',
			[
				{ raw: 'from:"a"b', start: 0, end: 9, filter: 'from', value: null, applied: false },
				{ raw: 'c', start: 10, end: 11 }
			]
		],
		[
			'a second from:',
			'from:a from:b',
			[
				{ raw: 'from:a', start: 0, end: 6, applied: true },
				{ raw: 'from:b', start: 7, end: 13, filter: 'from', value: 'b', applied: false }
			]
		],
		[
			'an unknown kind',
			'has:pdf',
			[{ raw: 'has:pdf', start: 0, end: 7, filter: 'has', applied: false }]
		],
		[
			'a bad date',
			'before:2026-02-30',
			[{ raw: 'before:2026-02-30', start: 0, end: 17, applied: false }]
		],
		[
			'a filter being typed',
			'from:',
			[{ raw: 'from:', start: 0, end: 5, filter: 'from', value: '', applied: false }]
		],
		[
			'an unknown filter name',
			'in:general',
			[{ raw: 'in:general', start: 0, end: 10, filter: null }]
		]
	])('reads %s', (_name, input, expected) => {
		const terms = readTerms(input);
		expect(terms).toHaveLength(expected.length);
		expected.forEach((want, i) => expect(terms[i]).toMatchObject(want));
	});
});

describe('termAt', () => {
	it.each<[string, number, string | null]>([
		['has:image mirage', 9, 'has:image'],
		['has:image mirage', 16, 'mirage'],
		['has:image mirage', 4, 'has:image'],
		['has:image mirage', 0, null],
		['has:image mirage', 9, 'has:image'],
		['has:image mirage', 10, null],
		['has:image   mirage', 11, null],
		['', 0, null]
	])('in %j with the caret at %i finds %j', (input, caret, raw) => {
		expect(termAt(input, caret)?.raw ?? null).toBe(raw);
	});
});
