import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { User } from '$lib/types/auth.types';

vi.mock('$app/state', async () => await import('../../test/pageState.svelte'));

import { page } from '../../test/pageState.svelte';
import { serversState } from '$lib/states/serversState.svelte';
import { usersState } from '$lib/states/usersState.svelte';
import { ACCENT_TOKENS, accentTokens } from './accent';
import { watchServerAccent } from './serverAccent.svelte';

const SERVER_ROUTE = '/app/server/[serverId]/channel/[channelId]';
const user = { id: 1, username: 'a' } as User;

let style: Map<string, string>;
let stop: () => void;

const root = {
	style: {
		setProperty: (name: string, value: string) => style.set(name, value),
		removeProperty: (name: string) => style.delete(name)
	}
} as unknown as HTMLElement;

function server(id: number, accent?: string | null) {
	serversState.addServer({ id, name: `s${id}`, server_profile: accent ? { accent } : {} });
}

function open(serverId: number) {
	page.route.id = SERVER_ROUTE;
	page.params = { serverId: String(serverId), channelId: '1' };
	flushSync();
}

beforeEach(() => {
	style = new Map();
	usersState.setLoggedInUser(user);
	server(1, '#5b9cf5');
	server(2, '#e5738f');
	server(3);
	page.route.id = null;
	page.params = {};
	stop = $effect.root(() => watchServerAccent(root));
	flushSync();
});

afterEach(() => {
	stop();
	usersState.reset();
	serversState.reset();
});

describe('server accent tokens', () => {
	it('sets the six tokens for a server with an accent', () => {
		open(1);
		expect(Object.fromEntries(style)).toEqual(accentTokens('#5b9cf5'));
		expect([...style.keys()].sort()).toEqual([...ACCENT_TOKENS].sort());
		expect(style.has('--chart-1')).toBe(false);
	});

	it('sets the accent of the other server when switching', () => {
		open(1);
		open(2);
		expect(Object.fromEntries(style)).toEqual(accentTokens('#e5738f'));
	});

	it.each([
		['a server without an accent', () => open(3)],
		['a direct message', () => (page.route.id = '/app/direct/[conversationId]')],
		['the friends page', () => (page.route.id = '/app/direct/friends')],
		['a server that is not loaded', () => open(99)],
		['leaving the server routes', () => (page.route.id = '/app')],
		['logging out', () => usersState.reset()]
	])('clears them on %s', (_name, leave) => {
		open(1);
		expect(style.size).toBe(6);
		leave();
		flushSync();
		expect(style.size).toBe(0);
	});

	it('returns when coming back to the server', () => {
		open(1);
		page.route.id = '/app/direct/friends';
		flushSync();
		open(1);
		expect(Object.fromEntries(style)).toEqual(accentTokens('#5b9cf5'));
	});

	it('follows an accent that changes or is removed while the server is open', () => {
		open(1);
		serversState.patchServer(1, { server_profile: { accent: '#38b2c4' } });
		flushSync();
		expect(Object.fromEntries(style)).toEqual(accentTokens('#38b2c4'));
		serversState.patchServer(1, { server_profile: {} });
		flushSync();
		expect(style.size).toBe(0);
	});

	it('ignores a value that is not a hex colour', () => {
		serversState.patchServer(1, { server_profile: { accent: 'red' } });
		open(1);
		expect(style.size).toBe(0);
	});

	it('clears them when the component is destroyed', () => {
		open(1);
		stop();
		expect(style.size).toBe(0);
	});
});
