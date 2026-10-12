import { describe, expect, it } from 'vitest';
import {
	ACCENT_PRESETS,
	ACCENT_TOKENS,
	DARK_SURFACE,
	accentTokens,
	contrastRatio,
	parseAccent,
	readableAccent
} from './accent';

describe('parseAccent', () => {
	it.each([
		['#1a2b3c', '#1a2b3c'],
		['#1A2B3C', '#1a2b3c'],
		['  #FFFF00 ', '#ffff00']
	])('accepts %j as %j', (input, expected) => {
		expect(parseAccent(input)).toBe(expected);
	});

	it.each(['', 'red', '#fff', '1a2b3c', '#12345g', '#1a2b3c4', '#nope'])('rejects %j', (input) => {
		expect(parseAccent(input)).toBeNull();
	});
});

describe('contrastRatio', () => {
	it.each([
		['#000000', '#ffffff', 21],
		['#ffffff', '#ffffff', 1]
	])('%s against %s is %d', (a, b, expected) => {
		expect(contrastRatio(a, b)).toBeCloseTo(expected, 5);
		expect(contrastRatio(b, a)).toBeCloseTo(expected, 5);
	});
});

describe('readableAccent', () => {
	it('keeps a colour that already stands out from the surface', () => {
		expect(readableAccent('#5b9cf5')).toEqual({
			color: '#5b9cf5',
			foreground: '#000000',
			adjusted: false
		});
	});

	it('keeps a very light colour and puts black text on it', () => {
		expect(readableAccent('#ffff00')).toEqual({
			color: '#ffff00',
			foreground: '#000000',
			adjusted: false
		});
	});

	it.each(['#101010', '#000000', '#1a2b3c', '#2a0a5e'])(
		'lightens the dark colour %s until it stands out from the surface',
		(accent) => {
			const result = readableAccent(accent);
			expect(result.adjusted).toBe(true);
			expect(result.color).not.toBe(accent);
			expect(contrastRatio(result.color, DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
		}
	);

	it('keeps the hue of the pick when it adjusts it', () => {
		const [r, g, b] = [1, 3, 5].map((i) =>
			parseInt(readableAccent('#1a2b3c').color.slice(i, i + 2), 16)
		);
		expect(b).toBeGreaterThan(g);
		expect(g).toBeGreaterThan(r);
	});

	it.each(['#ffff00', '#101010', '#808080', '#ff0000', '#00ff00', '#0000ff', '#767676'])(
		'gives %s readable text and the same answer twice',
		(accent) => {
			const result = readableAccent(accent);
			expect(contrastRatio(result.color, result.foreground)).toBeGreaterThanOrEqual(4.5);
			expect(readableAccent(accent)).toEqual(result);
			expect(readableAccent(result.color)).toEqual({ ...result, adjusted: false });
		}
	);

	it('darkens against a light surface', () => {
		const result = readableAccent('#ffff00', '#ffffff');
		expect(result.adjusted).toBe(true);
		expect(contrastRatio(result.color, '#ffffff')).toBeGreaterThanOrEqual(4.5);
	});

	it.each(ACCENT_PRESETS.map((preset) => preset.value))(
		'shows the preset %s unchanged',
		(value) => {
			expect(readableAccent(value).adjusted).toBe(false);
		}
	);
});

describe('accentTokens', () => {
	it('sets exactly the six tokens, never the chart colour', () => {
		const tokens = accentTokens('#5b9cf5');
		expect(Object.keys(tokens).sort()).toEqual([...ACCENT_TOKENS].sort());
		expect(ACCENT_TOKENS).toHaveLength(6);
		expect(tokens).not.toHaveProperty('--chart-1');
	});

	it('uses the adjusted colour and its readable foreground', () => {
		expect(accentTokens('#101010')).toMatchObject({
			'--primary': readableAccent('#101010').color,
			'--primary-foreground': '#000000'
		});
	});
});
