import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	OverwriteFrame,
	OverwriteSubject,
	OverwriteTarget,
	Overwrites,
	RoleOverwrite
} from '$lib/types/overwrite.types';

const getOverwrites = vi.hoisted(() => vi.fn());
const setOverwrite = vi.hoisted(() => vi.fn());
vi.mock('$lib/requests/channels/permissionOverwrites', () => ({ getOverwrites, setOverwrite }));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('svelte-sonner', () => ({ toast: { error: toastError } }));

import { overwritesState } from './overwritesState.svelte';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };

function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const channel: OverwriteTarget = { kind: 'channel', id: 1 };
const group: OverwriteTarget = { kind: 'group', id: 2 };
const everyone: OverwriteSubject = { kind: 'roles', id: 10 };
const mod: OverwriteSubject = { kind: 'roles', id: 11 };
const SEND = 2n;
const VIEW = 1n;

const roleRow = (id: number, allow: bigint, deny: bigint): RoleOverwrite => ({
	role_id: id,
	allow: String(allow),
	deny: String(deny)
});

const empty: Overwrites = { roles: [], members: [] };

const frame = (over: Partial<OverwriteFrame> = {}): OverwriteFrame => ({
	type: 'permission_overwrite_updated',
	server_id: 5,
	target: 'channel',
	target_id: 1,
	subject: 'role',
	subject_id: 10,
	overwrite: roleRow(10, 0n, SEND),
	...over
});

const bitsOf = (target: OverwriteTarget, subject: OverwriteSubject) => {
	const row = overwritesState.rows(target)?.roles.find((r) => r.role_id === subject.id);
	return row ? { allow: BigInt(row.allow), deny: BigInt(row.deny) } : { allow: 0n, deny: 0n };
};

async function loaded(rows: Overwrites = empty, target = channel) {
	getOverwrites.mockResolvedValueOnce(rows);
	await overwritesState.load(target);
}

beforeEach(() => {
	getOverwrites.mockReset();
	setOverwrite.mockReset();
	toastError.mockReset();
	overwritesState.reset();
});

describe('save', () => {
	it('shows the new row at once and keeps the response as the saved row', async () => {
		await loaded();
		const put = deferred<RoleOverwrite>();
		setOverwrite.mockReturnValueOnce(put.promise);

		const saved = overwritesState.save(channel, everyone, { allow: SEND, deny: 0n }, SEND);

		expect(bitsOf(channel, everyone)).toEqual({ allow: SEND, deny: 0n });
		expect(overwritesState.pendingBits(channel, everyone)).toBe(SEND);
		expect(setOverwrite).toHaveBeenCalledTimes(1);
		expect(setOverwrite).toHaveBeenCalledWith(channel, everyone, SEND, 0n);

		put.resolve(roleRow(10, SEND, 0n));
		await expect(saved).resolves.toBe(true);
		expect(bitsOf(channel, everyone)).toEqual({ allow: SEND, deny: 0n });
		expect(overwritesState.pendingBits(channel, everyone)).toBe(0n);
	});

	it('sends the latest value once after the write in flight and settles every click', async () => {
		await loaded();
		const first = deferred<RoleOverwrite>();
		const second = deferred<RoleOverwrite | null>();
		setOverwrite.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

		const a = overwritesState.save(channel, everyone, { allow: SEND, deny: 0n }, SEND);
		const b = overwritesState.save(channel, everyone, { allow: 0n, deny: SEND }, SEND);
		const c = overwritesState.save(channel, everyone, { allow: 0n, deny: 0n }, SEND);

		expect(setOverwrite).toHaveBeenCalledTimes(1);
		expect(bitsOf(channel, everyone)).toEqual({ allow: 0n, deny: 0n });

		first.resolve(roleRow(10, SEND, 0n));
		await vi.waitFor(() => expect(setOverwrite).toHaveBeenCalledTimes(2));
		expect(setOverwrite).toHaveBeenLastCalledWith(channel, everyone, 0n, 0n);
		expect(bitsOf(channel, everyone)).toEqual({ allow: 0n, deny: 0n });

		second.resolve(null);
		await expect(Promise.all([a, b, c])).resolves.toEqual([true, true, true]);
		expect(overwritesState.rows(channel)?.roles).toEqual([]);
		expect(overwritesState.pendingBits(channel, everyone)).toBe(0n);
	});

	it('sends writes for two rows at the same time', async () => {
		await loaded();
		const a = deferred<RoleOverwrite>();
		const b = deferred<RoleOverwrite>();
		setOverwrite.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

		const first = overwritesState.save(channel, everyone, { allow: SEND, deny: 0n }, SEND);
		const second = overwritesState.save(channel, mod, { allow: VIEW, deny: 0n }, VIEW);

		expect(setOverwrite).toHaveBeenCalledTimes(2);
		expect(overwritesState.pendingBits(channel, everyone)).toBe(SEND);
		expect(overwritesState.pendingBits(channel, mod)).toBe(VIEW);

		a.resolve(roleRow(10, SEND, 0n));
		b.resolve(roleRow(11, VIEW, 0n));
		await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
	});

	it('sends nothing for the value the row already shows', async () => {
		await loaded({ roles: [roleRow(10, SEND, 0n)], members: [] });

		await expect(
			overwritesState.save(channel, everyone, { allow: SEND, deny: 0n }, SEND)
		).resolves.toBe(true);
		await expect(overwritesState.save(channel, mod, { allow: 0n, deny: 0n }, SEND)).resolves.toBe(
			true
		);
		expect(setOverwrite).not.toHaveBeenCalled();
	});

	it('rolls back, drops the queued click and toasts once when a write fails', async () => {
		await loaded({ roles: [roleRow(10, 0n, VIEW)], members: [] });
		const first = deferred<RoleOverwrite>();
		setOverwrite.mockReturnValueOnce(first.promise);

		const a = overwritesState.save(channel, everyone, { allow: SEND, deny: VIEW }, SEND);
		const b = overwritesState.save(channel, everyone, { allow: 0n, deny: VIEW | SEND }, SEND);
		expect(bitsOf(channel, everyone)).toEqual({ allow: 0n, deny: VIEW | SEND });

		first.reject(new Error('offline'));
		await expect(Promise.all([a, b])).resolves.toEqual([false, false]);

		expect(bitsOf(channel, everyone)).toEqual({ allow: 0n, deny: VIEW });
		expect(setOverwrite).toHaveBeenCalledTimes(1);
		expect(overwritesState.pendingBits(channel, everyone)).toBe(0n);
		expect(toastError).toHaveBeenCalledTimes(1);
		expect(toastError).toHaveBeenCalledWith(
			expect.stringContaining("Couldn't save permissions"),
			expect.objectContaining({ id: 'overwrite-save' })
		);
	});

	it('goes back to the earlier success when the second write fails', async () => {
		await loaded();
		const first = deferred<RoleOverwrite>();
		const second = deferred<RoleOverwrite>();
		setOverwrite.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

		const a = overwritesState.save(channel, everyone, { allow: SEND, deny: 0n }, SEND);
		const b = overwritesState.save(channel, everyone, { allow: SEND | VIEW, deny: 0n }, VIEW);

		first.resolve(roleRow(10, SEND, 0n));
		await vi.waitFor(() => expect(setOverwrite).toHaveBeenCalledTimes(2));
		second.reject(new Error('forbidden'));

		await expect(Promise.all([a, b])).resolves.toEqual([true, false]);
		expect(bitsOf(channel, everyone)).toEqual({ allow: SEND, deny: 0n });
	});

	it('removes the row when the server answers 204', async () => {
		await loaded({ roles: [roleRow(10, SEND, 0n)], members: [] });
		setOverwrite.mockResolvedValueOnce(null);

		await overwritesState.save(channel, everyone, { allow: 0n, deny: 0n }, SEND);

		expect(overwritesState.rows(channel)?.roles).toEqual([]);
	});

	it('sends plain bigints, not reactive proxies', async () => {
		await loaded();
		setOverwrite.mockResolvedValueOnce(roleRow(10, SEND, 0n));
		await overwritesState.save(channel, everyone, { allow: SEND, deny: 0n }, SEND);
		const args = setOverwrite.mock.calls[0];
		expect(typeof args[2]).toBe('bigint');
		expect(typeof args[3]).toBe('bigint');
	});
});

describe('applyFrame', () => {
	it('adds, replaces and removes a row, and a repeated frame changes nothing', async () => {
		await loaded();

		overwritesState.applyFrame(frame());
		expect(bitsOf(channel, everyone)).toEqual({ allow: 0n, deny: SEND });
		overwritesState.applyFrame(frame());
		expect(overwritesState.rows(channel)?.roles).toEqual([roleRow(10, 0n, SEND)]);

		overwritesState.applyFrame(frame({ overwrite: roleRow(10, VIEW, 0n) }));
		expect(overwritesState.rows(channel)?.roles).toEqual([roleRow(10, VIEW, 0n)]);

		overwritesState.applyFrame(frame({ overwrite: null }));
		expect(overwritesState.rows(channel)?.roles).toEqual([]);
	});

	it('applies member rows to the right target', async () => {
		await loaded(empty, group);
		overwritesState.applyFrame(
			frame({
				target: 'group',
				target_id: 2,
				subject: 'member',
				subject_id: 9,
				overwrite: { user_id: 9, allow: '1', deny: '0' }
			})
		);
		expect(overwritesState.rows(group)?.members).toEqual([{ user_id: 9, allow: '1', deny: '0' }]);
	});

	it('ignores a target that is not loaded', () => {
		overwritesState.applyFrame(frame());
		expect(overwritesState.rows(channel)).toBeNull();
	});

	it('does not change what a pending write shows, and falls back to the frame after a failure', async () => {
		await loaded();
		const put = deferred<RoleOverwrite>();
		setOverwrite.mockReturnValueOnce(put.promise);

		const saved = overwritesState.save(channel, everyone, { allow: VIEW, deny: 0n }, VIEW);
		overwritesState.applyFrame(frame({ overwrite: roleRow(10, 0n, SEND) }));
		expect(bitsOf(channel, everyone)).toEqual({ allow: VIEW, deny: 0n });

		put.reject(new Error('nope'));
		await saved;
		expect(bitsOf(channel, everyone)).toEqual({ allow: 0n, deny: SEND });
	});
});

describe('load', () => {
	it('is null until the first load returns', async () => {
		expect(overwritesState.rows(channel)).toBeNull();
		await loaded({ roles: [roleRow(10, 0n, VIEW)], members: [] });
		expect(overwritesState.rows(channel)?.roles).toEqual([roleRow(10, 0n, VIEW)]);
	});

	it('applies the latest of two overlapping loads even when the earlier one returns last', async () => {
		const early = deferred<Overwrites>();
		const late = deferred<Overwrites>();
		getOverwrites.mockReturnValueOnce(early.promise).mockReturnValueOnce(late.promise);

		const first = overwritesState.load(channel);
		const second = overwritesState.load(channel);
		late.resolve({ roles: [roleRow(10, VIEW, 0n)], members: [] });
		await second;
		early.resolve({ roles: [roleRow(10, 0n, SEND)], members: [] });
		await first;

		expect(overwritesState.rows(channel)?.roles).toEqual([roleRow(10, VIEW, 0n)]);
	});

	it('prefers a frame that arrives during the load over the snapshot', async () => {
		const get = deferred<Overwrites>();
		getOverwrites.mockReturnValueOnce(get.promise);

		const loading = overwritesState.load(channel);
		overwritesState.applyFrame(frame({ overwrite: roleRow(10, VIEW, 0n) }));
		get.resolve({ roles: [roleRow(10, 0n, SEND)], members: [] });
		await loading;

		expect(overwritesState.rows(channel)?.roles).toEqual([roleRow(10, VIEW, 0n)]);
	});

	it('prefers a write response that arrives during the load over the snapshot', async () => {
		await loaded();
		const get = deferred<Overwrites>();
		getOverwrites.mockReturnValueOnce(get.promise);
		setOverwrite.mockResolvedValueOnce(roleRow(11, VIEW, 0n));

		const loading = overwritesState.load(channel);
		await overwritesState.save(channel, mod, { allow: VIEW, deny: 0n }, VIEW);
		get.resolve({ roles: [], members: [] });
		await loading;

		expect(overwritesState.rows(channel)?.roles).toEqual([roleRow(11, VIEW, 0n)]);
	});

	it('does not throw for the error of a load that was replaced', async () => {
		const early = deferred<Overwrites>();
		getOverwrites.mockReturnValueOnce(early.promise);
		const first = overwritesState.load(channel);
		await loaded({ roles: [roleRow(10, VIEW, 0n)], members: [] });

		early.reject(new Error('stale'));
		await expect(first).resolves.toBeUndefined();
		expect(overwritesState.rows(channel)?.roles).toEqual([roleRow(10, VIEW, 0n)]);
	});

	it('throws the error of the latest load', async () => {
		getOverwrites.mockRejectedValueOnce(new Error('offline'));
		await expect(overwritesState.load(channel)).rejects.toThrow('offline');
		expect(overwritesState.rows(channel)).toBeNull();
	});
});
