import { describe, expect, it } from 'vitest';
import { Permission } from '$lib/permissions';
import { ServersState } from './serversState.svelte';

const { VIEW_CHANNEL: VIEW, SEND_MESSAGES: SEND, CONNECT } = Permission;
const mask = (...bits: bigint[]) => String(bits.reduce((all, bit) => all | bit, 0n));

describe('canIn', () => {
	function state() {
		const servers = new ServersState();
		servers.setPermissions(
			{ '7': mask(VIEW, SEND) },
			{ '7': { '1': mask(VIEW), '2': mask(CONNECT) } }
		);
		return servers;
	}

	it.each([
		{ name: 'the server mask when no channel is given', channel: null, perm: SEND, expected: true },
		{
			name: 'the server mask when no channel is open',
			channel: undefined,
			perm: SEND,
			expected: true
		},
		{
			name: 'the server mask for a channel without its own mask',
			channel: 9,
			perm: SEND,
			expected: true
		},
		{
			name: 'the channel mask instead of the server mask',
			channel: 1,
			perm: SEND,
			expected: false
		},
		{ name: 'a bit only the channel mask holds', channel: 2, perm: CONNECT, expected: true },
		{
			name: 'a bit the channel mask lacks even if the server has it',
			channel: 2,
			perm: VIEW,
			expected: false
		},
		{
			name: 'every bit of a combined permission, channel lacks one',
			channel: 1,
			perm: VIEW | SEND,
			expected: false
		},
		{
			name: 'every bit of a combined permission, server holds both',
			channel: null,
			perm: VIEW | SEND,
			expected: true
		}
	])('reads $name', ({ channel, perm, expected }) => {
		expect(state().canIn(perm, channel, 7)).toBe(expected);
	});

	it.each([null, undefined, 8])('is false for the server %s without a mask', (serverId) => {
		expect(state().canIn(VIEW, 1, serverId)).toBe(false);
	});
});

describe('permissions_init', () => {
	it('replaces every server and channel mask', () => {
		const servers = new ServersState();
		servers.setPermissions({ '7': mask(VIEW), '8': mask(SEND) }, { '7': { '1': mask(SEND) } });

		servers.setPermissions({ '9': mask(VIEW) });

		expect(servers.canIn(VIEW, 1, 7)).toBe(false);
		expect(servers.canIn(SEND, 1, 7)).toBe(false);
		expect(servers.canIn(SEND, null, 8)).toBe(false);
		expect(servers.canIn(VIEW, 1, 9)).toBe(true);
	});

	it('reads a mask that is not a number as no permissions', () => {
		const servers = new ServersState();
		servers.setPermissions({ '7': 'garbage' });
		expect(servers.canIn(VIEW, null, 7)).toBe(false);
		expect(servers.can(VIEW, 7)).toBe(false);
	});
});

describe('permissions_updated', () => {
	function state() {
		const servers = new ServersState();
		servers.setPermissions(
			{ '7': mask(VIEW), '8': mask(VIEW) },
			{ '7': { '1': mask(SEND) }, '8': { '1': mask(SEND) } }
		);
		return servers;
	}

	it('changes one server and leaves the others', () => {
		const servers = state();
		servers.setPermission(7, mask(VIEW, CONNECT));

		expect(servers.canIn(CONNECT, null, 7)).toBe(true);
		expect(servers.canIn(CONNECT, null, 8)).toBe(false);
	});

	it('keeps the channel masks when the frame has none', () => {
		const servers = state();
		servers.setPermission(7, mask(VIEW, CONNECT));
		expect(servers.canIn(SEND, 1, 7)).toBe(true);
		expect(servers.canIn(VIEW, 1, 7)).toBe(false);
	});

	it('replaces the whole channel map of that server when the frame has one', () => {
		const servers = state();
		servers.setPermission(7, mask(VIEW), { '2': mask(CONNECT) });

		expect(servers.canIn(SEND, 1, 7)).toBe(false);
		expect(servers.canIn(VIEW, 1, 7)).toBe(true);
		expect(servers.canIn(CONNECT, 2, 7)).toBe(true);
		expect(servers.canIn(SEND, 1, 8)).toBe(true);
	});

	it('drops every channel mask of that server when the frame has an empty map', () => {
		const servers = state();
		servers.setPermission(7, mask(VIEW), {});
		expect(servers.canIn(VIEW, 1, 7)).toBe(true);
	});
});
