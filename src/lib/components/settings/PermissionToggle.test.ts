import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import PermissionToggle from './PermissionToggle.svelte';
import type { PermissionState } from '$lib/utils/roles';

const inherited = { value: 'deny' as const, text: 'Denied, from Member on this channel' };

const html = (value: PermissionState, withInherited = true) =>
	render(PermissionToggle, {
		props: {
			label: 'Send messages',
			description: 'Write in it.',
			value,
			inherited: withInherited ? inherited : undefined,
			onchange: () => {}
		}
	}).body.replace(/<!--.*?-->/g, '');

describe('inherited line', () => {
	it.each([
		{ value: 'inherit', line: inherited.text },
		{ value: 'deny', line: `Same as inherited: ${inherited.text}` },
		{ value: 'allow', line: `Overrides: ${inherited.text}` }
	] as const)('reads "$line" when the value is $value', ({ value, line }) => {
		expect(html(value)).toContain(`>${line}</span>`);
	});

	it('has no line without an inherited value', () => {
		const body = html('allow', false);
		expect(body).not.toContain('Overrides');
		expect(body).not.toContain('Same as inherited');
	});
});
