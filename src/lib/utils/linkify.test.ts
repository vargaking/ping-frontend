import { describe, expect, it } from 'vitest';
import { firstLinkHref, linkLabel, linkify, safeHref } from './linkify';

describe('safeHref', () => {
	it('normalises http and https addresses', () => {
		expect(safeHref('https://example.com')).toBe('https://example.com/');
		expect(safeHref('  http://example.com/a?b=1  ')).toBe('http://example.com/a?b=1');
		expect(safeHref('http://localhost:5173/x')).toBe('http://localhost:5173/x');
	});

	it.each([
		'javascript:alert(1)',
		'data:text/html,hi',
		'ftp://example.com',
		'mailto:a@example.com',
		'//example.com',
		'example.com',
		'https://intranet',
		'',
		'not a url'
	])('rejects %j', (raw) => {
		expect(safeHref(raw)).toBeNull();
	});

	it('rejects anything that is not a string', () => {
		expect(safeHref(undefined)).toBeNull();
		expect(safeHref(null)).toBeNull();
		expect(safeHref(42)).toBeNull();
	});
});

describe('linkify', () => {
	it('splits text around addresses and leaves trailing punctuation out', () => {
		expect(linkify('see https://example.com/a, ok')).toEqual([
			{ kind: 'text', text: 'see ' },
			{ kind: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
			{ kind: 'text', text: ', ok' }
		]);
	});

	it('adds https to www addresses', () => {
		expect(firstLinkHref('go to www.example.com now')).toBe('https://www.example.com');
	});

	it('keeps a closing bracket that belongs to the address', () => {
		expect(firstLinkHref('(https://en.wikipedia.org/wiki/Foo_(bar))')).toBe(
			'https://en.wikipedia.org/wiki/Foo_(bar)'
		);
	});

	it('finds nothing in plain text', () => {
		expect(linkify('no links here')).toEqual([{ kind: 'text', text: 'no links here' }]);
		expect(firstLinkHref('javascript:alert(1)')).toBeNull();
	});
});

describe('linkLabel', () => {
	const evil = 'https://evil.test/';

	it('shows the real target when the text is another address', () => {
		expect(linkLabel('https://google.com', evil)).toBe(evil);
		expect(linkLabel('google.com', evil)).toBe(evil);
		expect(linkLabel('www.google.com/login', evil)).toBe(evil);
		expect(linkLabel('  http://google.com  ', evil)).toBe(evil);
		expect(linkLabel('https://localhost', evil)).toBe(evil);
	});

	it('treats a subdomain or lookalike host as another host', () => {
		expect(linkLabel('docs.example.com', 'https://example.com/')).toBe('https://example.com/');
		expect(linkLabel('https://exаmple.com', 'https://example.com/')).toBe('https://example.com/');
	});

	it('keeps text that is not an address', () => {
		expect(linkLabel('docs', evil)).toBe('docs');
		expect(linkLabel('click here', evil)).toBe('click here');
		expect(linkLabel('v1.2', evil)).toBe('v1.2');
		expect(linkLabel('Google.', evil)).toBe('Google.');
		expect(linkLabel('see https://google.com', evil)).toBe('see https://google.com');
	});

	it('keeps an address that points at its own host', () => {
		expect(linkLabel('https://example.com', 'https://example.com/')).toBe('https://example.com');
		expect(linkLabel('example.com/docs', 'https://example.com/other')).toBe('example.com/docs');
		expect(linkLabel('www.example.com', 'https://example.com/')).toBe('www.example.com');
		expect(linkLabel('HTTP://Example.COM', 'https://example.com/')).toBe('HTTP://Example.COM');
	});

	it.each([
		['zero width space', 'paypal.com\u200b'],
		['soft hyphen', 'pay\u00adpal.com'],
		['leading zero width space', '\u200bhttps://paypal.com'],
		['word joiner', 'paypal\u2060.com'],
		['byte order mark', '\ufeffpaypal.com'],
		['zero width joiner', 'pay\u200dpal.com'],
		['trailing dot', 'paypal.com.'],
		['trailing punctuation', 'paypal.com!?'],
		['invisible character before a trailing dot', 'paypal.com\u200b.']
	])('sees through %s', (_name, text) => {
		expect(linkLabel(text, 'https://evil.com/')).toBe('https://evil.com/');
	});

	it('still keeps an own-host address with invisible characters', () => {
		expect(linkLabel('paypal.com\u200b', 'https://paypal.com/')).toBe('paypal.com\u200b');
	});

	it.each(['Node.js', 'package.json', 'README.md', 'main.py', 'build.sh', 'main.rs', 'notes.txt'])(
		'keeps the file or product name %s',
		(text) => {
			expect(linkLabel(text, 'https://github.com/a/b')).toBe(text);
		}
	);

	it('rewrites known top level domains in any case or depth', () => {
		const target = 'https://evil.test/';
		expect(linkLabel('paypal.com', target)).toBe(target);
		expect(linkLabel('www.paypal.com', target)).toBe(target);
		expect(linkLabel('PAYPAL.COM', target)).toBe(target);
		expect(linkLabel('pay.pal.co/login?x=1', target)).toBe(target);
		expect(linkLabel('paypal.com:8080', target)).toBe(target);
		expect(linkLabel('paypal.xn--p1ai', target)).toBe(target);
	});

	it('always treats an http(s) address as an address', () => {
		expect(linkLabel('https://Node.js', 'https://evil.test/')).toBe('https://evil.test/');
	});
});
