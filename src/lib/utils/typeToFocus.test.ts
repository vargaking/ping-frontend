import { describe, expect, it } from 'vitest';
import { isTypingKey } from './typeToFocus';

type Init = {
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	isComposing?: boolean;
	defaultPrevented?: boolean;
	altGraph?: boolean;
};

function key(name: string, { altGraph = false, ...init }: Init = {}) {
	return {
		key: name,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		isComposing: false,
		defaultPrevented: false,
		getModifierState: (state: string) => state === 'AltGraph' && altGraph,
		...init
	};
}

describe('isTypingKey', () => {
	it.each([
		['a', key('a')],
		['shifted letter', key('A')],
		['digit', key('7')],
		['punctuation', key('?')],
		['AltGr on Windows', key('@', { ctrlKey: true, altKey: true, altGraph: true })],
		['AltGr on Linux', key('@', { altGraph: true })],
		['Ctrl+V', key('v', { ctrlKey: true })],
		['Meta+V', key('v', { metaKey: true })],
		['Ctrl+Shift+V', key('V', { ctrlKey: true })]
	])('accepts %s', (_, event) => {
		expect(isTypingKey(event)).toBe(true);
	});

	it.each([
		['Space', key(' ')],
		['Enter', key('Enter')],
		['Tab', key('Tab')],
		['Escape', key('Escape')],
		['ArrowUp', key('ArrowUp')],
		['F5', key('F5')],
		['Backspace', key('Backspace')],
		['dead key', key('Dead')],
		['Ctrl+C', key('c', { ctrlKey: true })],
		['Meta+K', key('k', { metaKey: true })],
		['Alt+Shift+M', key('M', { altKey: true })],
		['composing', key('a', { isComposing: true })],
		['already handled', key('a', { defaultPrevented: true })],
		['already handled paste', key('v', { ctrlKey: true, defaultPrevented: true })]
	])('ignores %s', (_, event) => {
		expect(isTypingKey(event)).toBe(false);
	});
});
