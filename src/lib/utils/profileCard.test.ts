import { describe, expect, it, vi } from 'vitest';
import type { User } from '$lib/types/auth.types';
import type { MenuAction, MenuEntry } from '$lib/utils/menuActions';
import {
	bannerOf,
	bannerRequest,
	cardStatus,
	closingFirst,
	imageProblem,
	type Banner,
	type BannerDraft
} from './profileCard';

const user = { id: 7, username: 'ada', public_key: '', profile: {} } as User;
const file = new File(['x'], 'banner.png', { type: 'image/png' });

describe('bannerOf', () => {
	it.each([
		[null, { kind: 'default' }],
		[undefined, { kind: 'default' }],
		[{}, { kind: 'default' }],
		[{ banner_color: '#1a2b3c' }, { kind: 'color', color: '#1a2b3c' }],
		[{ banner_image: '/m/b.png' }, { kind: 'image', src: '/m/b.png' }],
		[
			{ banner_image: '/m/b.png', banner_color: '#1a2b3c' },
			{ kind: 'image', src: '/m/b.png' }
		],
		[{ banner_color: 'red' }, { kind: 'default' }],
		[{ banner_color: '#ABCDEF' }, { kind: 'default' }],
		[{ banner_color: '#abc' }, { kind: 'default' }]
	])('reads %j as %j', (profile, expected) => {
		expect(bannerOf(profile)).toEqual(expected);
	});
});

describe('imageProblem', () => {
	it.each([
		['image/png', 1024, null],
		['image/gif', 5 * 1024 * 1024, null],
		['application/pdf', 1024, 'Use a PNG, JPG, WebP or GIF image.'],
		['', 1024, 'Use a PNG, JPG, WebP or GIF image.'],
		['image/webp', 5 * 1024 * 1024 + 1, 'That image is over 5 MB.']
	])('%s of %i bytes: %s', (type, size, expected) => {
		expect(imageProblem({ type, size })).toBe(expected);
	});
});

describe('bannerRequest', () => {
	const none: Banner = { kind: 'default' };
	const red: Banner = { kind: 'color', color: '#e5484d' };
	const image: Banner = { kind: 'image', src: '/m/b.png' };

	it.each<[string, Banner, BannerDraft | null, unknown]>([
		['no draft', red, null, null],
		['default over default', none, { kind: 'default' }, null],
		['default over a colour', red, { kind: 'default' }, { kind: 'remove' }],
		['default over an image', image, { kind: 'default' }, { kind: 'remove' }],
		['the saved colour again', red, { kind: 'color', color: '#e5484d' }, null],
		[
			'another colour',
			red,
			{ kind: 'color', color: '#0090ff' },
			{ kind: 'color', color: '#0090ff' }
		],
		[
			'a colour over an image',
			image,
			{ kind: 'color', color: '#e5484d' },
			{ kind: 'color', color: '#e5484d' }
		],
		[
			'a colour over nothing',
			none,
			{ kind: 'color', color: '#e5484d' },
			{ kind: 'color', color: '#e5484d' }
		],
		['an image', red, { kind: 'image', file }, { kind: 'upload', file }]
	])('%s', (_name, saved, draft, expected) => {
		expect(bannerRequest(saved, draft)).toEqual(expected);
	});
});

describe('cardStatus', () => {
	const base = { imported: false, userId: 7, user, serverId: 1, memberIds: [7, 8] };

	it.each([
		['an imported author', { imported: true, user: undefined }, 'imported'],
		['a member', {}, 'member'],
		['someone not in the server', { memberIds: [8] }, 'left'],
		[
			'someone not in the server who is not loaded yet',
			{ memberIds: [8], user: undefined },
			'left'
		],
		['a member who is not loaded yet', { user: undefined }, 'loading'],
		['a deleted account in a server', { user: null }, 'left'],
		['a person in a DM', { serverId: null }, 'direct'],
		['a person in a DM who is not loaded yet', { serverId: null, user: undefined }, 'loading'],
		['a deleted account in a DM', { serverId: null, user: null }, 'missing'],
		['a server whose members are unknown', { memberIds: null }, 'direct'],
		[
			'a server whose members are unknown, and a stranger',
			{ memberIds: null, user: null },
			'missing'
		]
	])('%s', (_name, change, expected) => {
		expect(cardStatus({ ...base, ...change })).toBe(expected);
	});
});

describe('closingFirst', () => {
	it('closes before a plain action runs', () => {
		const calls: string[] = [];
		const action: MenuAction = {
			id: 'kick',
			label: 'Kick',
			icon: {} as MenuAction['icon'],
			run: () => void calls.push('run')
		};
		const [wrapped] = closingFirst([action], () => calls.push('close'));
		(wrapped as MenuAction).run();
		expect(calls).toEqual(['close', 'run']);
	});

	it('leaves a submenu as it was', () => {
		const submenu: MenuEntry = {
			id: 'roles',
			label: 'Roles',
			icon: {} as MenuAction['icon'],
			toggles: []
		};
		const close = vi.fn();
		expect(closingFirst([submenu], close)[0]).toBe(submenu);
		expect(close).not.toHaveBeenCalled();
	});
});
