import { createServerRequest } from '$lib/requests/serverRequests/createServerRequest';
import { getMyServerRequest } from '$lib/requests/serverRequests/getMyServerRequest';
import { withdrawServerRequest } from '$lib/requests/serverRequests/withdrawServerRequest';
import type {
	MyServerRequestState,
	ServerRequest,
	ServerRequestInput
} from '$lib/types/serverRequest.types';

class ServerRequestState {
	mine: MyServerRequestState | null = $state(null);
	loading = $state(false);
	loadFailed = $state(false);

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

	async submit(input: ServerRequestInput) {
		this.apply(await createServerRequest(input));
	}

	async withdraw() {
		await withdrawServerRequest();
		if (this.mine) this.mine = { ...this.mine, request: null };
	}

	/** Take a request the server just sent us (own submit or a decision). */
	apply(request: ServerRequest) {
		if (this.mine) this.mine = { ...this.mine, request };
	}

	reset() {
		this.mine = null;
		this.loading = false;
		this.loadFailed = false;
	}
}

export const serverRequestState = new ServerRequestState();
