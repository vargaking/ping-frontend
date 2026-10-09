import { describe, expect, it } from 'vitest';
import { messageWords, normalizeText, tokenize } from './searchText';

const doc = (...paragraphs: unknown[]) => ({ type: 'doc', content: paragraphs }) as never;
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string) => ({ type: 'text', text: value });

describe('normalizeText', () => {
	it('lowercases and drops accents', () => {
		expect(normalizeText('Árvíztűrő TÜKÖRFÚRÓGÉP')).toBe('arvizturo tukorfurogep');
	});
});

describe('tokenize', () => {
	it('folds Hungarian accents', () => {
		expect(tokenize('árvíztűrő tükörfúrógép')).toEqual(['arvizturo', 'tukorfurogep']);
	});

	it('ignores case and splits on punctuation and emoji', () => {
		expect(tokenize('Hello, WORLD!! foo_bar 🎉party🎉 a.b')).toEqual([
			'hello',
			'world',
			'foo',
			'bar',
			'party'
		]);
	});

	it('keeps digits', () => {
		expect(tokenize('v2 build 404')).toEqual(['v2', 'build', '404']);
	});

	it('keeps tokens of 2 to 32 characters', () => {
		const long = 'x'.repeat(33);
		const edge = 'y'.repeat(32);
		expect(tokenize(`a bb ${long} ${edge}`)).toEqual(['bb', edge]);
	});

	it('returns each token once', () => {
		expect(tokenize('Foo foo FOO fóó')).toEqual(['foo']);
	});

	it('stops at 256 tokens', () => {
		const many = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
		const tokens = tokenize(many);
		expect(tokens).toHaveLength(256);
		expect(tokens[255]).toBe('word255');
	});

	it('handles empty text', () => {
		expect(tokenize('')).toEqual([]);
	});
});

describe('messageWords', () => {
	it('reads the text of the message', () => {
		expect(messageWords({ content: doc(paragraph(text('Szép napot!'))) })).toEqual([
			'szep',
			'napot'
		]);
	});

	it('includes mentions by their label', () => {
		const content = doc(
			paragraph(text('hi '), { type: 'mention', attrs: { id: '7', label: 'Béla' } })
		);
		expect(messageWords({ content })).toEqual(['hi', 'bela']);
	});

	it('includes attachment file names', () => {
		const attachment = {
			id: 'a',
			filename: 'Éves_jelentés-2025.pdf',
			content_type: 'application/pdf',
			size: 1,
			kind: 'file' as const,
			width: null,
			height: null,
			url: '/x'
		};
		expect(
			messageWords({ content: doc(paragraph(text('see'))), attachments: [attachment] })
		).toEqual(['see', 'eves', 'jelentes', '2025', 'pdf']);
	});

	it('reads legacy string content', () => {
		expect(messageWords({ content: 'plain Text' as never })).toEqual(['plain', 'text']);
	});
});
