import { describe, expect, it } from 'vitest';
import { DANGER_ZONE_LABEL, PERMISSION_GROUPS, editorGroups } from './permissions';

describe('editorGroups', () => {
	const groups = editorGroups();
	const last = groups[groups.length - 1];
	const flagged = PERMISSION_GROUPS.flatMap((g) => g.permissions).filter((p) => p.danger);

	it('collects every flagged permission in a last group and nowhere else', () => {
		expect(last.label).toBe(DANGER_ZONE_LABEL);
		expect(last.permissions.map((p) => p.bit)).toEqual(flagged.map((p) => p.bit));
		for (const g of groups.slice(0, -1)) expect(g.permissions.some((p) => p.danger)).toBe(false);
	});

	it('lists every permission once', () => {
		const all = PERMISSION_GROUPS.flatMap((g) => g.permissions).length;
		expect(groups.flatMap((g) => g.permissions)).toHaveLength(all);
	});
});
