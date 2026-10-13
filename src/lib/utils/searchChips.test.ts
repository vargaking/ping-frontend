import { describe, expect, it } from 'vitest';
import { insertTerm, joinChips, splitChips, unchip } from './searchChips';

const texts = (query: string) => splitChips(query).chips.map((chip) => chip.text);

describe('splitChips', () => {
	it.each<[string, string[], string]>([
		['has:image ', ['has:image'], ''],
		['has:image', [], 'has:image'],
		['from:"Old Name" x', ['from:"Old Name"'], 'x'],
		['from:"Old Name x', [], 'from:"Old Name x'],
		['from:"Old Name"x ', [], 'from:"Old Name"x '],
		['from:a from:b x', ['from:a'], 'from:b x'],
		['has:pdf ', [], 'has:pdf '],
		['before:2026-02-30 ', [], 'before:2026-02-30 '],
		['from: ', [], 'from: '],
		['  has:image  mirage', ['has:image'], 'mirage'],
		['mirage has:image', [], 'mirage has:image'],
		['mirage has:image x', ['has:image'], 'mirage x'],
		[
			'from:dani has:image after:2026-03-01 mirage',
			['from:dani', 'has:image', 'after:2026-03-01'],
			'mirage'
		]
	])('%j gives chips %j and rest %j', (query, chips, rest) => {
		const split = splitChips(query);
		expect(split.chips.map((chip) => chip.text)).toEqual(chips);
		expect(split.rest).toBe(rest);
	});

	it('names the filter of each chip', () => {
		expect(splitChips('has:image during:2026-03 ').chips.map((chip) => chip.filter)).toEqual([
			'has',
			'during'
		]);
	});

	it.each<[string, number, number]>([
		['x has:image ', 12, 2],
		['x has:image ', 1, 1],
		['has:image mirage', 16, 6],
		['has:image mirage', 5, 0],
		['has:image mirage', 0, 0],
		['a has:image b has:file c', 24, 5]
	])('%j with the caret at %i puts it at %i in the rest', (query, caret, expected) => {
		expect(splitChips(query, caret).caret).toBe(expected);
	});

	it.each([
		'has:image ',
		'from:"Old Name" x',
		'from:a from:b x',
		'  has:image  mirage',
		'mirage has:image x has:file ',
		'from:dani has:image after:2026-03-01 mirage'
	])('splitting %j again changes nothing', (query) => {
		const split = splitChips(query);
		expect(splitChips(joinChips(split.chips, split.rest))).toMatchObject({
			chips: split.chips,
			rest: split.rest
		});
	});
});

describe('unchip', () => {
	it.each<[string, number, string]>([
		['has:image mirage', 0, 'mirage has:image'],
		['has:image from:dani x', 1, 'has:image x from:dani'],
		['has:image ', 0, 'has:image']
	])('%j, chip %i: query %j', (query, index, expected) => {
		const result = unchip(splitChips(query), index);
		expect(result.query).toBe(expected);
		expect(result.caret).toBe(expected.length);
		expect(texts(result.query)).toEqual(texts(query).filter((_, i) => i !== index));
	});

	it('becomes a chip again once whitespace follows', () => {
		const { query } = unchip(splitChips('has:image mirage'), 0);
		expect(texts(query + ' ')).toEqual(['has:image']);
	});
});

describe('insertTerm', () => {
	it.each<[string, [number, number], string, string, number]>([
		['from:de', [0, 7], 'from:Dénes', 'from:Dénes ', 11],
		['from:de mirage', [0, 7], 'from:Dénes', 'from:Dénes mirage', 11],
		['x from:de', [2, 9], 'from:"Old Name"', 'x from:"Old Name" ', 18],
		['has:i', [0, 5], 'has:image', 'has:image ', 10]
	])('%j with the term at %j gives %j', (rest, [start, end], text, expected, caret) => {
		expect(insertTerm(rest, { start, end }, text)).toEqual({ rest: expected, caret });
	});

	it('lands the caret where the chip was after the next split', () => {
		const { rest, caret } = insertTerm('from:de mirage', { start: 0, end: 7 }, 'from:Dénes');
		const split = splitChips(rest, caret);
		expect(split.chips.map((chip) => chip.text)).toEqual(['from:Dénes']);
		expect(split.rest).toBe('mirage');
		expect(split.caret).toBe(0);
	});
});
