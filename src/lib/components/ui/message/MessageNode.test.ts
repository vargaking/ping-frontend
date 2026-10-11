import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import MessageNode from './MessageNode.svelte';

const text = (value: string, ...marks: object[]) => ({
	type: 'text',
	text: value,
	marks
});
const linkMark = (href: string) => ({ type: 'link', attrs: { href } });

const html = (node: object) =>
	render(MessageNode, { props: { node } }).body.replace(/<!--.*?-->/g, '');

describe('mark rendering', () => {
	it('underlines text', () => {
		expect(html(text('hello', { type: 'underline' }))).toContain('<u>hello</u>');
	});

	it('combines underline with other marks', () => {
		const body = html(text('hi', { type: 'bold' }, { type: 'underline' }));
		expect(body).toContain('<strong>');
		expect(body).toContain('<u>');
		expect(body).toContain('hi');
	});

	it('leaves plain text unmarked', () => {
		expect(html(text('plain'))).not.toContain('<u>');
	});
});

describe('link rendering', () => {
	it('shows text that differs from its target', () => {
		const body = html(text('docs', linkMark('https://example.com')));
		expect(body).toContain('href="https://example.com/"');
		expect(body).toContain('>docs</a>');
	});

	it('shows the target when the text is an address on another host', () => {
		const body = html(text('https://google.com', linkMark('https://evil.test')));
		expect(body).toContain('href="https://evil.test/"');
		expect(body).toContain('>https://evil.test/</a>');
		expect(body).not.toContain('google.com');
	});

	it('keeps an address that points at its own host', () => {
		const body = html(text('example.com', linkMark('https://example.com/docs')));
		expect(body).toContain('>example.com</a>');
	});

	it('renders a link with an unsafe target as plain text', () => {
		const body = html(text('click', linkMark('javascript:alert(1)')));
		expect(body).not.toContain('<a');
		expect(body).toContain('click');
	});

	it('shows the target when one masked address is split over several nodes', () => {
		const target = linkMark('https://evil.example');
		const body = html({
			type: 'paragraph',
			content: [text('paypal', target), text('.com', target, { type: 'underline' })]
		});
		expect(body).toContain('href="https://evil.example/"');
		expect(body).toContain('>https://evil.example/</a>');
		expect(body).not.toContain('paypal');
		expect(body.match(/<a /g)).toHaveLength(1);
	});

	it('shows the target for a split address in a heading', () => {
		const target = linkMark('https://evil.example');
		const body = html({
			type: 'heading',
			attrs: { level: 2 },
			content: [text('https://pay', target), text('pal.com', target, { type: 'bold' })]
		});
		expect(body).toContain('>https://evil.example/</a>');
		expect(body).not.toContain('paypal');
	});

	it('keeps a split address that points at its own host', () => {
		const target = linkMark('https://paypal.com/login');
		const body = html({
			type: 'paragraph',
			content: [text('paypal', target), text('.com', target)]
		});
		expect(body).toContain('>paypal</a>');
		expect(body).toContain('>.com</a>');
	});

	it('does not judge the parts of an own-host split address on their own', () => {
		const target = linkMark('https://example.com/');
		const body = html({
			type: 'paragraph',
			content: [text('https://example', target), text('.com', target)]
		});
		expect(body).toContain('>https://example</a>');
		expect(body).toContain('>.com</a>');
	});

	it('judges different links separately', () => {
		const body = html({
			type: 'paragraph',
			content: [
				text('paypal', linkMark('https://a.example')),
				text('.com', linkMark('https://b.example'))
			]
		});
		expect(body).toContain('>paypal</a>');
		expect(body).toContain('>.com</a>');
	});

	it('keeps a file name as the link text', () => {
		const body = html(text('package.json', linkMark('https://github.com/a/b/package.json')));
		expect(body).toContain('>package.json</a>');
	});

	it('sees through invisible characters in the text', () => {
		const body = html(text('paypal.com\u200b', linkMark('https://evil.test')));
		expect(body).toContain('>https://evil.test/</a>');
	});
});
