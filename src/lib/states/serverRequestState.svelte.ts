import { createServerRequest } from '$lib/requests/serverRequests/createServerRequest';
import { getMyServerRequest } from '$lib/requests/serverRequests/getMyServerRequest';
import { getMyServerRequestHistory } from '$lib/requests/serverRequests/getMyServerRequestHistory';
import { withdrawServerRequest } from '$lib/requests/serverRequests/withdrawServerRequest';
import type {
	MyServerRequestState,
	ServerRequest,
	ServerRequestInput
} from '$lib/types/serverRequest.types';
import { pastRequests, upsertRequest } from '$lib/utils/serverRequests';

export class ServerRequestState {
	mine: MyServerRequestState | null = $state(null);
	loading = $state(false);
	loadFailed = $state(false);

	history: ServerRequest[] | null = $state(null);
	historyLoading = $state(false);
	historyFailed = $state(false);

	private historyLoad: Promise<void> | null = null;
	private generation = 0;
	private changedDuringHistoryLoad: ServerRequest[] = [];

	/** Servers are approved by hand. */
	get waitlist() {
		return this.mine?.mode === 'waitlist';
	}

	/** Waitlist mode, and not a platform admin: the add-server flow is a request. */
	get mustRequest() {
		return this.mine?.mode === 'waitlist' && !this.mine.can_create;
	}

	get past(): ServerRequest[] {
		return pastRequests(this.history ?? [], this.mine?.request ?? null);
	}

	async load() {
		this.loading = true;
		this.loadFailed = false;
		try {
			this.mine = await getMyServerRequest();
		} catch (e) {
			console.warn('Failed to load server request state', e);
			this.loadFailed = true;
		} finally {
			this.loading = false;
		}
	}

	async ensureLoaded() {
		if (!this.mine && !this.loading) await this.load();
	}

	loadHistory(): Promise<void> {
		if (!this.historyLoad) {
			const load = this.fetchHistory().finally(() => {
				if (this.historyLoad === load) this.historyLoad = null;
			});
			this.historyLoad = load;
		}
		return this.historyLoad;
	}

	private async fetchHistory() {
		this.historyLoading = true;
		this.historyFailed = false;
		this.changedDuringHistoryLoad = [];
		const generation = this.generation;
		try {
			const fetched = await getMyServerRequestHistory();
			if (generation !== this.generation) return;
			// A frame can land while the response is in flight, and is newer than it.
			this.history = this.changedDuringHistoryLoad.reduce(upsertRequest, fetched);
		} catch (e) {
			console.warn('Failed to load server request history', e);
			if (generation === this.generation) this.historyFailed = true;
		} finally {
			if (generation === this.generation) {
				this.changedDuringHistoryLoad = [];
				this.historyLoading = false;
			}
		}
	}

	async submit(input: ServerRequestInput) {
		this.apply(await createServerRequest(input));
	}

	async withdraw() {
		const current = this.mine?.request;
		await withdrawServerRequest();
		if (!this.mine) return;
		this.mine = { ...this.mine, request: null };
		if (current) this.record({ ...current, status: 'withdrawn' });
	}

	/** Take a request the server just sent us (own submit or a decision). */
	apply(request: ServerRequest) {
		if (this.mine) this.mine = { ...this.mine, request };
		this.record(request);
	}

	private record(request: ServerRequest) {
		if (this.history) this.history = upsertRequest(this.history, request);
		if (this.historyLoad) this.changedDuringHistoryLoad.push(request);
	}

	reset() {
		this.generation++;
		this.historyLoad = null;
		this.mine = null;
		this.loading = false;
		this.loadFailed = false;
		this.history = null;
		this.historyLoading = false;
		this.historyFailed = false;
		this.changedDuringHistoryLoad = [];
	}
}

export const serverRequestState = new ServerRequestState();
