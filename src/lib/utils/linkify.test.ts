import { describe, expect, it } from 'vitest';
import { effectiveMarks, firstLinkHref, linkLabel, linkify, safeHref } from './linkify';

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

	it('drops credentials from the address', () => {
		expect(safeHref('https://paypal.com@evil.test/x')).toBe('https://evil.test/x');
		expect(safeHref('https://user:pass@example.com/')).toBe('https://example.com/');
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

	it('rewrites top level domains in any case or depth', () => {
		const target = 'https://evil.test/';
		expect(linkLabel('paypal.com', target)).toBe(target);
		expect(linkLabel('www.paypal.com', target)).toBe(target);
		expect(linkLabel('PAYPAL.COM', target)).toBe(target);
		expect(linkLabel('pay.pal.co/login?x=1', target)).toBe(target);
		expect(linkLabel('paypal.com:8080', target)).toBe(target);
		expect(linkLabel('paypal.xn--p1ai', target)).toBe(target);
	});

	it.each([
		['Greek omicron in the TLD', 'paypal.c\u03bfm'],
		['one dot leader', 'paypal\u2024com'],
		['fullwidth full stop', 'paypal\uff0ecom'],
		['ideographic full stop', 'paypal\u3002com'],
		['halfwidth ideographic full stop', 'paypal\uff61com'],
		['fullwidth letters', '\uff50aypal.com']
	])('sees through %s', (_name, text) => {
		expect(linkLabel(text, 'https://evil.com/')).toBe('https://evil.com/');
	});

	it.each([
		'irs.gov',
		'discord.gift',
		'steam.community',
		'harvard.edu',
		'my.bank',
		'a.zip',
		'x.mov',
		'x.cloud'
	])('treats %s as an address', (text) => {
		expect(linkLabel(text, 'https://evil.com/')).toBe('https://evil.com/');
	});

	it.each([
		'package.json',
		'README.md',
		'Node.js',
		'app.css',
		'index.html',
		'App.svelte',
		'data.csv',
		'config.yaml',
		'yarn.lock'
	])('keeps the file name %s', (text) => {
		expect(linkLabel(text, 'https://evil.com/')).toBe(text);
	});

	it('treats a file extension followed by a path as an address', () => {
		expect(linkLabel('paypal.sh/login', 'https://evil.com/')).toBe('https://evil.com/');
	});

	it.each([
		['round brackets', '(paypal.com)'],
		['one closing bracket', 'paypal.com)'],
		['quotes', '"paypal.com"'],
		['angle brackets', '<paypal.com>'],
		['ellipsis', 'paypal.com\u2026'],
		['middle dot', 'paypal.com\u00b7'],
		['leading braille blank', '\u2800paypal.com'],
		['trailing braille blank', 'paypal.com\u2800'],
		['braille blank inside', 'pay\u2800pal.com'],
		['trailing combining mark', 'paypal.com\u0332'],
		['combining mark inside', 'paypal.co\u0332m'],
		['protocol relative form', '//paypal.com'],
		['single slash scheme', 'http:/paypal.com'],
		['scheme without slashes', 'https:paypal.com'],
		['backslash path', 'paypal.com\\login'],
		['backslashes after scheme', 'http:\\\\paypal.com'],
		['another scheme', 'ftp://paypal.com'],
		['emoji prefix', '\u{1f512} paypal.com']
	])('sees through %s', (_name, text) => {
		expect(linkLabel(text, 'https://evil.com/')).toBe('https://evil.com/');
	});

	it('keeps wrapped text that points at its own host', () => {
		expect(linkLabel('(paypal.com)', 'https://paypal.com/')).toBe('(paypal.com)');
		expect(linkLabel('//paypal.com', 'https://paypal.com/')).toBe('//paypal.com');
	});

	it('does not read a userinfo-prefixed target as the shown host', () => {
		const href = safeHref('https://paypal.com@evil.com') as string;
		expect(linkLabel('paypal.com', href)).toBe('https://evil.com/');
	});

	it('always treats an http(s) address as an address', () => {
		expect(linkLabel('https://Node.js', 'https://evil.test/')).toBe('https://evil.test/');
	});
});

describe('effectiveMarks', () => {
	it('keeps only the first link mark', () => {
		const marks = [
			{ type: 'bold' },
			{ type: 'link', attrs: { href: 'https://a.example' } },
			{ type: 'link', attrs: { href: 'https://b.example' } },
			{ type: 'italic' }
		];
		expect(effectiveMarks(marks)).toEqual([marks[0], marks[1], marks[3]]);
	});

	it('returns nothing for missing or malformed marks', () => {
		expect(effectiveMarks(undefined)).toEqual([]);
		expect(effectiveMarks('bold' as never)).toEqual([]);
	});
});
