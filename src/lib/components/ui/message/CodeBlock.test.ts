import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import MessageNode from './MessageNode.svelte';

const block = (language: unknown, text = 'let a = 1;\nlet b = 2;') => ({
	type: 'codeBlock',
	attrs: { language },
	content: [{ type: 'text', text }]
});

describe('code block rendering', () => {
	it('shows the code and a copy button with the language as a label', () => {
		const { body } = render(MessageNode, { props: { node: block('js') } });
		expect(body).toContain('>js</span>');
		expect(body).toContain('aria-label="Copy code"');
		expect(body).toContain('let a = 1;\nlet b = 2;');
		expect(body).not.toContain('<br');
	});

	it('shows no label without a language', () => {
		const { body } = render(MessageNode, { props: { node: block(null) } });
		expect(body).not.toContain('text-text-subtle');
	});

	it.each(['"><img src=x onerror=alert(1)>', '" onmouseover="x', '<script>alert(1)</script>'])(
		'keeps the language %j out of the markup',
		(language) => {
			const { body } = render(MessageNode, { props: { node: block(language) } });
			const tags = body.match(/<[a-z][^>]*>/gi) ?? [];

			expect(tags.map((tag) => /^<([a-z0-9]+)/i.exec(tag)?.[1])).not.toContain('img');
			expect(tags.map((tag) => /^<([a-z0-9]+)/i.exec(tag)?.[1])).not.toContain('script');
			expect(tags.join('')).not.toMatch(/\son[a-z]+=/);
			expect(tags.join('')).not.toContain(language);
			expect(tags.join('')).not.toContain(language.replaceAll('"', '&quot;'));
			expect(body).not.toContain('<img');
			expect(body).not.toContain('<script');
			expect(body).toContain(language.replaceAll('<', '&lt;'));
		}
	);

	it('does not break on a missing or odd language', () => {
		for (const language of [undefined, 5, {}, '']) {
			expect(() => render(MessageNode, { props: { node: block(language) } })).not.toThrow();
		}
	});
});
