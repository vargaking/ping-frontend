import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, Permission } from '$lib/permissions';
import { ROLE_PRESETS, presetAllow, type RolePresetId } from './rolePresets';

const dangerBits = PERMISSION_GROUPS.flatMap((g) => g.permissions)
	.filter((p) => p.danger)
	.map((p) => p.bit);
const ids = ROLE_PRESETS.map((p) => p.id);

describe('presetAllow for the owner', () => {
	it.each<[RolePresetId, bigint]>([
		['empty', 0n],
		['admin', 15359n],
		['moderator', 12804n]
	])('%s ticks %i', (id, expected) => {
		expect(presetAllow(id, ALL_PERMISSIONS)).toBe(expected);
	});
});

describe('presetAllow for someone holding fewer bits', () => {
	const held = Permission.KICK_MEMBERS | Permission.MANAGE_MESSAGES | Permission.VIEW_CHANNEL;

	it.each<[RolePresetId, bigint]>([
		['empty', 0n],
		['admin', held],
		['moderator', Permission.KICK_MEMBERS | Permission.MANAGE_MESSAGES]
	])('%s is limited to the held bits', (id, expected) => {
		expect(presetAllow(id, held)).toBe(expected);
	});
});

describe('danger bits', () => {
	it('are flagged', () => {
		expect(dangerBits).toContain(Permission.DELETE_CHANNELS);
		expect(dangerBits).toContain(Permission.MANAGE_SERVER);
	});

	it.each(ids)('%s never ticks one, whatever is held', (id) => {
		const ticked = presetAllow(id, ALL_PERMISSIONS | Permission.MAP_IMPORTED_AUTHORS);
		for (const bit of dangerBits) expect(ticked & bit).toBe(0n);
		expect(ticked & Permission.MAP_IMPORTED_AUTHORS).toBe(0n);
	});
});
