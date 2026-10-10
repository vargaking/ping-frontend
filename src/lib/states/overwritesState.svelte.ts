import { toast } from 'svelte-sonner';
import { getOverwrites, setOverwrite } from '$lib/requests/channels/permissionOverwrites';
import { getErrorMessage } from '$lib/requests/errors';
import type {
	OverwriteFrame,
	OverwriteSubject,
	OverwriteTarget,
	Overwrites
} from '$lib/types/overwrite.types';
import { rowBits, rowOf, sameBits, withRow, type Bits } from '$lib/utils/overwrites';

type TargetKey = `${OverwriteTarget['kind']}:${number}`;
type RowKey = `${OverwriteSubject['kind']}:${number}`;
/** `intent` is the row the user asked for, `changed` the bits they touched while it was unsaved. */
type Pending = { intent: Bits; changed: bigint };
/** The rows of one target waiting for their write, oldest click first. */
type Chain = { queue: RowKey[]; running: boolean };

const targetKey = (target: OverwriteTarget): TargetKey => `${target.kind}:${target.id}`;
const rowKey = (subject: OverwriteSubject): RowKey => `${subject.kind}:${subject.id}`;

function subjectOf(key: RowKey): OverwriteSubject {
	const [kind, id] = key.split(':');
	return { kind: kind as OverwriteSubject['kind'], id: Number(id) };
}

/**
 * The permission overwrites of every channel and category a Permissions tab has opened.
 * Holds what the server last confirmed (load, write response, live frame) plus the
 * change each row is still waiting to save, so the tab shows a click at once.
 */
class OverwritesState {
	private saved: Record<TargetKey, Overwrites> = $state({});
	private pending: Record<TargetKey, Record<RowKey, Pending>> = $state({});
	private chains = new Map<TargetKey, Chain>();
	/** Clicks not yet covered by a request; the request that carries them settles them. */
	private waiters = new Map<string, ((saved: boolean) => void)[]>();
	private loads = new Map<TargetKey, { seq: number; fresh: Map<RowKey, Bits> }>();
	private loadSeq = 0;

	/** Rows as they will be once pending writes land; null until the target is loaded. */
	rows(target: OverwriteTarget): Overwrites | null {
		const key = targetKey(target);
		let rows: Overwrites | undefined = this.saved[key];
		if (!rows) return null;
		for (const [rk, p] of Object.entries(this.pending[key] ?? {})) {
			rows = withRow(rows, subjectOf(rk as RowKey), p.intent);
		}
		return rows;
	}

	/** The bits of the subject's row that were changed and are not saved yet. */
	pendingBits(target: OverwriteTarget, subject: OverwriteSubject): bigint {
		return this.pending[targetKey(target)]?.[rowKey(subject)]?.changed ?? 0n;
	}

	/** Fetch the target's rows. Only the latest call per target applies, and only it throws. */
	async load(target: OverwriteTarget): Promise<void> {
		const key = targetKey(target);
		const seq = ++this.loadSeq;
		const fresh = new Map<RowKey, Bits>();
		this.loads.set(key, { seq, fresh });
		try {
			let loaded = await getOverwrites(target);
			if (this.loads.get(key)?.seq !== seq) return;
			for (const [rk, bits] of fresh) loaded = withRow(loaded, subjectOf(rk), bits);
			this.saved[key] = loaded;
		} catch (e) {
			if (this.loads.get(key)?.seq === seq) throw e;
		} finally {
			if (this.loads.get(key)?.seq === seq) this.loads.delete(key);
		}
	}

	/**
	 * Show `next` at once and save it after the writes already waiting for this target, one at a
	 * time in click order. A row's newest click replaces its own unsent one and keeps its place.
	 * `changed` is the bits the click touched. Resolves true once saved, false when rolled back.
	 */
	save(
		target: OverwriteTarget,
		subject: OverwriteSubject,
		next: Bits,
		changed: bigint
	): Promise<boolean> {
		const key = targetKey(target);
		const rk = rowKey(subject);
		if (sameBits(rowBits(this.rows(target), subject), next)) return Promise.resolve(true);

		const previous = this.pending[key]?.[rk];
		this.pending[key] ??= {};
		this.pending[key][rk] = { intent: next, changed: (previous?.changed ?? 0n) | changed };

		const id = `${key}|${rk}`;
		const saved = new Promise<boolean>((resolve) => {
			this.waiters.set(id, [...(this.waiters.get(id) ?? []), resolve]);
		});

		let chain = this.chains.get(key);
		if (!chain) this.chains.set(key, (chain = { queue: [], running: false }));
		if (!chain.queue.includes(rk)) chain.queue.push(rk);
		if (!chain.running) void this.drain(target, chain);
		return saved;
	}

	applyFrame(frame: OverwriteFrame) {
		const target: OverwriteTarget = { kind: frame.target, id: frame.target_id };
		const subject: OverwriteSubject = {
			kind: frame.subject === 'role' ? 'roles' : 'members',
			id: frame.subject_id
		};
		this.store(target, subject, rowOf(frame.overwrite));
	}

	reset() {
		this.saved = {};
		this.pending = {};
		this.loads.clear();
	}

	private async drain(target: OverwriteTarget, chain: Chain) {
		chain.running = true;
		try {
			for (let rk = chain.queue.shift(); rk; rk = chain.queue.shift()) {
				await this.send(target, subjectOf(rk), chain);
			}
		} finally {
			chain.running = false;
			const key = targetKey(target);
			if (this.chains.get(key) === chain) this.chains.delete(key);
		}
	}

	/** Writes the row's newest intent. A failure rolls back this row only. */
	private async send(target: OverwriteTarget, subject: OverwriteSubject, chain: Chain) {
		const key = targetKey(target);
		const rk = rowKey(subject);
		const id = `${key}|${rk}`;
		const intent = this.pending[key]?.[rk]?.intent;
		if (!intent) {
			this.settle(this.takeWaiters(id), false);
			return;
		}
		if (sameBits(intent, rowBits(this.saved[key] ?? null, subject))) {
			delete this.pending[key][rk];
			this.settle(this.takeWaiters(id), true);
			return;
		}
		const covered = this.takeWaiters(id);
		try {
			this.store(
				target,
				subject,
				rowOf(await setOverwrite(target, subject, intent.allow, intent.deny))
			);
		} catch (e) {
			delete this.pending[key]?.[rk];
			chain.queue = chain.queue.filter((queued) => queued !== rk);
			this.settle(covered, false);
			this.settle(this.takeWaiters(id), false);
			toast.error(`Couldn't save permissions: ${getErrorMessage(e)}`, { id: 'overwrite-save' });
			return;
		}
		this.settle(covered, true);
		if (!chain.queue.includes(rk)) delete this.pending[key]?.[rk];
	}

	private takeWaiters(id: string) {
		const waiting = this.waiters.get(id) ?? [];
		this.waiters.delete(id);
		return waiting;
	}

	private settle(waiting: ((saved: boolean) => void)[], saved: boolean) {
		for (const resolve of waiting) resolve(saved);
	}

	/** The one place saved rows change outside a load. */
	private store(target: OverwriteTarget, subject: OverwriteSubject, bits: Bits) {
		const key = targetKey(target);
		this.loads.get(key)?.fresh.set(rowKey(subject), bits);
		if (this.saved[key]) this.saved[key] = withRow(this.saved[key], subject, bits);
	}
}

export const overwritesState = new OverwritesState();
