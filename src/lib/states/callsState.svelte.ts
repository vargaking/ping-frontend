import { untrack } from 'svelte';
import { AxiosError } from 'axios';
import { toast } from 'svelte-sonner';
import { getActiveCalls } from '$lib/requests/calls/getActiveCalls';
import { declineCall } from '$lib/requests/calls/declineCall';
import { startCall } from '$lib/requests/calls/startCall';
import { getErrorMessage } from '$lib/requests/errors';
import type { Call, CallStatus } from '$lib/types/call.types';
import { isOpenCall } from '$lib/utils/callText';
import { describeVoiceError } from '$lib/utils/voiceErrors';
import { resyncState } from './resyncState.svelte';
import { usersState } from './usersState.svelte';
import { voiceState } from './voiceState.svelte';

const RANK: Record<CallStatus, number> = {
	ringing: 0,
	active: 1,
	ended: 2,
	missed: 2,
	declined: 2
};

/** A call someone else started, still ringing, that the viewer hasn't answered. */
export function isIncomingRing(call: Call, me: number | null, now: number): boolean {
	return (
		call.state === 'ringing' && call.caller_id !== me && now < Date.parse(call.ring_expires_at)
	);
}

export function describeStartError(err: unknown): string {
	if (err instanceof AxiosError) {
		const status = err.response?.status;
		if (status === 429) {
			const seconds = Number(err.response?.headers?.['retry-after']);
			if (!Number.isFinite(seconds) || seconds <= 0) return "You've called a lot. Try again later.";
			const wait = seconds < 90 ? `${Math.ceil(seconds)}s` : `${Math.ceil(seconds / 60)} min`;
			return `You've called a lot without an answer. Try again in ${wait}.`;
		}
		if (status === 404) return "This conversation isn't available.";
	}
	return describeVoiceError(err, 'call');
}

/** The newest call of each conversation, fed by `call_state` frames and the active-calls list. */
class CallsState {
	byConversation: Record<number, Call> = $state({});
	/** The active calls have loaded for this user. */
	loaded = $state(false);
	/** A call is being started in this conversation. */
	starting: number | null = $state(null);
	private now = $state(Date.now());

	private userId: number | null = null;
	private generation = 0;
	private closed = new Set<number>();
	// Calls a frame or answer described since the current load began.
	private touched = new Set<number>();
	private expiryTimer: ReturnType<typeof setTimeout> | null = null;

	/** Calls that are ringing or active. */
	get open(): Call[] {
		return Object.values(this.byConversation).filter((call) => isOpenCall(call.state));
	}

	/** Ringing calls to answer: the banner shows these. */
	get incoming(): Call[] {
		const me = usersState.loggedInUser?.id ?? null;
		return this.open.filter((call) => isIncomingRing(call, me, this.now));
	}

	forConversation(conversationId: number): Call | null {
		const call = this.byConversation[conversationId];
		return call && isOpenCall(call.state) ? call : null;
	}

	isOpen(callId: number): boolean {
		return this.open.some((call) => call.id === callId);
	}

	/** A cached row still says ringing or active, but the server no longer lists that call. */
	isStale(callId: number): boolean {
		return this.loaded && !this.isOpen(callId);
	}

	/** Takes in a description of a call unless a newer one is already held. */
	apply(call: Call): boolean {
		const held = this.byConversation[call.conversation_id];
		if (held) {
			if (held.id > call.id) return false;
			if (held.id === call.id && RANK[call.state] < RANK[held.state]) return false;
		}
		if (this.closed.has(call.id) && isOpenCall(call.state)) return false;

		this.touched.add(call.id);
		this.byConversation[call.conversation_id] = call;
		if (!isOpenCall(call.state)) {
			this.closed.add(call.id);
			void voiceState.endCall(call.id);
		}
		this.scheduleExpiry();
		return true;
	}

	/** Follows the signed-in user; a different user starts from nothing. */
	sync(userId: number | null): void {
		if (userId === this.userId) return;
		this.userId = userId;
		this.reset();
		if (userId != null) void this.load();
	}

	/** Reads the open calls again and drops the ones that ended while frames were missed. */
	async load(): Promise<void> {
		if (this.userId == null) return;
		const generation = this.generation;
		this.touched = new Set();
		let calls: Call[];
		try {
			calls = await getActiveCalls();
		} catch (e) {
			console.warn('Failed to load active calls', e);
			return;
		}
		if (generation !== this.generation) return;

		const framed = this.touched;
		const listed = new Set(calls.map((call) => call.id));
		for (const call of calls) this.apply(call);

		for (const held of this.open) {
			if (listed.has(held.id) || framed.has(held.id)) continue;
			this.closed.add(held.id);
			delete this.byConversation[held.conversation_id];
		}
		const joined = voiceState.callId;
		if (joined != null && !listed.has(joined) && !framed.has(joined))
			void voiceState.endCall(joined);

		this.loaded = true;
		this.scheduleExpiry();
	}

	reset(): void {
		this.generation++;
		this.byConversation = {};
		this.loaded = false;
		this.starting = null;
		this.closed = new Set();
		this.touched = new Set();
		this.scheduleExpiry();
	}

	/** Calls the person in this DM and joins the room. */
	async start(conversationId: number): Promise<void> {
		if (this.starting != null) return;
		this.starting = conversationId;
		const generation = this.generation;
		try {
			const call = await startCall(conversationId);
			if (generation !== this.generation) return;
			this.apply(call);
			await voiceState.joinCall(call);
		} catch (err) {
			toast.error(describeStartError(err));
		} finally {
			if (generation === this.generation) this.starting = null;
		}
	}

	async decline(callId: number): Promise<void> {
		const generation = this.generation;
		try {
			const call = await declineCall(callId);
			if (generation === this.generation) this.apply(call);
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	/** Loads the calls for the signed-in user and again after each resync. Returns the stop function. */
	follow(): () => void {
		return $effect.root(() => {
			$effect(() => {
				const id = usersState.loggedInUser?.id ?? null;
				untrack(() => this.sync(id));
			});
			$effect(() => {
				if (resyncState.generation === 0) return;
				untrack(() => void this.load());
			});
		});
	}

	// The banner and the "ringing" rows end on their own when the ring runs out.
	private scheduleExpiry() {
		if (this.expiryTimer) clearTimeout(this.expiryTimer);
		this.expiryTimer = null;
		const now = Date.now();
		this.now = now;
		const expiries = this.open
			.filter((call) => call.state === 'ringing')
			.map((call) => Date.parse(call.ring_expires_at))
			.filter((at) => at > now);
		if (expiries.length === 0) return;
		this.expiryTimer = setTimeout(
			() => {
				this.now = Date.now();
				this.scheduleExpiry();
			},
			Math.min(...expiries) - now + 20
		);
	}
}

export const callsState = new CallsState();
