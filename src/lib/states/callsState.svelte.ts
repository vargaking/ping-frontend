import { untrack } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import { AxiosError } from 'axios';
import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { getActiveCalls } from '$lib/requests/calls/getActiveCalls';
import { declineCall } from '$lib/requests/calls/declineCall';
import { startCall } from '$lib/requests/calls/startCall';
import { getErrorMessage } from '$lib/requests/errors';
import type { Call, CallStatus } from '$lib/types/call.types';
import { desktop } from '$lib/desktop';
import { isOpenCall } from '$lib/utils/callText';
import { startRing } from '$lib/utils/notificationSound';
import { withTag, type NotificationData } from '$lib/utils/notificationTags';
import { describeVoiceError } from '$lib/utils/voiceErrors';
import { documentFocusState } from '$lib/utils/documentFocus.svelte';
import { notificationsState } from './notificationsState.svelte';
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

const ICON = '/icon-192.png';

/** The push for a call uses the same tag, so the two replace each other. */
export const callTag = (callId: number) => `call-${callId}`;

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
	/** The call being answered from the banner. */
	accepting: number | null = $state(null);
	private now = $state(Date.now());

	private userId: number | null = null;
	private generation = 0;
	private closed = new Set<number>();
	// Rows announced by a message whose call_state hasn't arrived yet.
	private announced = new SvelteSet<number>();
	private loadSeq = 0;
	// Calls a frame or answer described since the current load began.
	private touched = new Set<number>();
	private expiryTimer: ReturnType<typeof setTimeout> | null = null;
	private stopRing: (() => void) | null = null;
	private notified = new Set<number>();
	private shown = new Map<number, Notification>();

	/** Calls that are ringing or active. */
	get open(): Call[] {
		return Object.values(this.byConversation).filter((call) => isOpenCall(call.state));
	}

	/** Ringing calls to answer: the banner shows these. */
	get incoming(): Call[] {
		const me = usersState.loggedInUser?.id ?? null;
		return this.open.filter((call) => isIncomingRing(call, me, this.now));
	}

	/** The call the banner offers: the newest of the ringing ones. */
	get incomingCall(): Call | null {
		return this.incoming.reduce<Call | null>(
			(newest, call) => (newest && newest.id > call.id ? newest : call),
			null
		);
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
		return this.loaded && !this.isOpen(callId) && !this.announced.has(callId);
	}

	/** A new call row arrived. Its call_state follows, and until then the row is not stale. */
	noteAnnounced(callId: number): void {
		if (!this.closed.has(callId)) this.announced.add(callId);
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
		this.announced.delete(call.id);
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
		// A newer load sees everything this one would, so only the latest result counts.
		const seq = ++this.loadSeq;
		this.touched = new Set();
		const announcedBefore = [...this.announced];
		let calls: Call[];
		try {
			calls = await getActiveCalls();
		} catch (e) {
			console.warn('Failed to load active calls', e);
			return;
		}
		if (generation !== this.generation || seq !== this.loadSeq) return;

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

		for (const id of announcedBefore) this.announced.delete(id);
		this.loaded = true;
		this.scheduleExpiry();
	}

	reset(): void {
		this.generation++;
		this.byConversation = {};
		this.loaded = false;
		this.starting = null;
		this.accepting = null;
		this.closed = new Set();
		this.announced.clear();
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

	/** Joins the call's room, which answers it, and opens the call view. */
	async accept(call: Call): Promise<void> {
		if (this.accepting != null) return;
		this.accepting = call.id;
		const generation = this.generation;
		try {
			const joined = voiceState.joinCall(call);
			void goto(`/app/direct/${call.conversation_id}/call/`);
			await joined;
		} finally {
			if (generation === this.generation) this.accepting = null;
		}
	}

	/** Loads the calls for the signed-in user and again after each resync, rings and notifies
	 *  for incoming calls. Returns the stop function. */
	follow(): () => void {
		const stopEffects = $effect.root(() => {
			$effect(() => {
				const id = usersState.loggedInUser?.id ?? null;
				untrack(() => this.sync(id));
			});
			$effect(() => {
				if (resyncState.generation === 0) return;
				untrack(() => void this.load());
			});
			$effect(() => {
				const ring = this.incoming.length > 0 && this.accepting == null && notificationsState.sound;
				untrack(() => this.ring(ring));
			});
			$effect(() => {
				const wanted = documentFocusState.visible ? [] : this.incoming;
				untrack(() => this.syncNotifications(wanted));
			});
		});
		return () => {
			stopEffects();
			this.ring(false);
			this.syncNotifications([]);
		};
	}

	private ring(on: boolean) {
		if (on) this.stopRing ??= startRing();
		else {
			this.stopRing?.();
			this.stopRing = null;
		}
	}

	private syncNotifications(calls: Call[]) {
		const wanted = new Set(calls.map((call) => call.id));
		for (const id of this.notified) {
			if (wanted.has(id)) continue;
			this.notified.delete(id);
			void this.closeNotification(id);
		}
		notificationsState.refreshPermission();
		if (!notificationsState.desktop || notificationsState.permission !== 'granted') return;
		for (const call of calls) {
			if (this.notified.has(call.id)) continue;
			this.notified.add(call.id);
			void this.showNotification(call);
		}
	}

	private async showNotification(call: Call) {
		const tag = callTag(call.id);
		const url = `/app/direct/${call.conversation_id}/`;
		try {
			const caller = await usersState.getOrFetchUser(call.caller_id);
			const title = caller?.username ?? 'Someone';
			const registration = desktop ? undefined : await navigator.serviceWorker?.getRegistration();
			if (registration) {
				// A push for this call may have landed first.
				if (withTag(await registration.getNotifications(), tag).length === 0) {
					await registration.showNotification(title, {
						body: 'Incoming call',
						tag,
						icon: ICON,
						data: {
							url,
							count: 1,
							messageUuid: call.message_id,
							shownAt: Date.now()
						} satisfies NotificationData
					});
				}
			} else {
				const notification = new Notification(title, { body: 'Incoming call', tag, icon: ICON });
				notification.onclick = () => {
					desktop?.showWindow();
					window.focus();
					void goto(url);
					notification.close();
				};
				this.shown.set(call.id, notification);
			}
			// The call may have stopped ringing while the notification was being made.
			if (!this.notified.has(call.id)) await this.closeNotification(call.id);
		} catch (e) {
			console.warn('Failed to show call notification', e);
		}
	}

	private async closeNotification(callId: number) {
		try {
			this.shown.get(callId)?.close();
			this.shown.delete(callId);
			if (desktop) return;
			const registration = await navigator.serviceWorker?.getRegistration();
			const open = await registration?.getNotifications();
			if (open) withTag(open, callTag(callId)).forEach((notification) => notification.close());
		} catch (e) {
			console.debug('Failed to close call notification', e);
		}
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
