import { describe, expect, it } from 'vitest';
import hljs from 'highlight.js/lib/core';
import { common } from 'lowlight';
import { LANGUAGES, knownLanguage } from './languages';

describe('knownLanguage', () => {
	it('resolves names and aliases, ignoring case and spaces', () => {
		expect(knownLanguage('js')).toBe('javascript');
		expect(knownLanguage('JS')).toBe('javascript');
		expect(knownLanguage(' py ')).toBe('python');
		expect(knownLanguage('c++')).toBe('cpp');
		expect(knownLanguage('TypeScript')).toBe('typescript');
	});

	it('returns null for unknown languages', () => {
		expect(knownLanguage('notalanguage')).toBeNull();
		expect(knownLanguage('')).toBeNull();
		expect(knownLanguage('"><img src=x onerror=alert(1)>')).toBeNull();
	});

	it('does not read the prototype', () => {
		for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
			expect(knownLanguage(key)).toBeNull();
		}
	});

	it('returns null for non-strings', () => {
		for (const value of [undefined, null, 5, {}, ['js']]) expect(knownLanguage(value)).toBeNull();
	});

	it('matches what lowlight registers', () => {
		const registered: Record<string, string> = {};
		for (const [name, grammar] of Object.entries(common)) {
			registered[name] = name;
			for (const alias of grammar(hljs).aliases ?? []) registered[alias] = name;
		}
		expect(LANGUAGES).toEqual(registered);
	});
});
