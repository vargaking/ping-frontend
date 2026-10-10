import { SKIP_WAITING, VERSION_QUERY } from './workerProtocol';

export interface WorkerLike extends EventTarget {
	readonly state: ServiceWorkerState;
	postMessage(message: unknown, transfer?: Transferable[]): void;
}

export interface RegistrationLike extends EventTarget {
	readonly installing: WorkerLike | null;
	readonly waiting: WorkerLike | null;
	update(): Promise<unknown>;
}

export const INSTALL_TIMEOUT_MS = 120_000;
export const VERSION_REPLY_TIMEOUT_MS = 3_000;

const SETTLED: readonly ServiceWorkerState[] = [
	'installed',
	'activating',
	'activated',
	'redundant'
];

/** Resolves once the worker has finished installing (or failed, or the timeout passed). */
export function whenWorkerSettles(
	worker: WorkerLike,
	timeoutMs = INSTALL_TIMEOUT_MS
): Promise<void> {
	return new Promise((resolve) => {
		if (SETTLED.includes(worker.state)) {
			resolve();
			return;
		}
		const finish = () => {
			clearTimeout(timer);
			worker.removeEventListener('statechange', onStateChange);
			resolve();
		};
		const onStateChange = () => {
			if (SETTLED.includes(worker.state)) finish();
		};
		const timer = setTimeout(finish, timeoutMs);
		worker.addEventListener('statechange', onStateChange);
	});
}

/** Asks a worker which build it is. Null when it doesn't answer (older workers don't). */
export function askWorkerVersion(
	worker: WorkerLike,
	timeoutMs = VERSION_REPLY_TIMEOUT_MS
): Promise<string | null> {
	return new Promise((resolve) => {
		const { port1, port2 } = new MessageChannel();
		const finish = (version: string | null) => {
			clearTimeout(timer);
			port1.close();
			resolve(version);
		};
		const timer = setTimeout(() => finish(null), timeoutMs);
		port1.onmessage = (event) =>
			finish(typeof event.data?.version === 'string' ? event.data.version : null);
		try {
			worker.postMessage({ type: VERSION_QUERY }, [port2]);
		} catch {
			finish(null);
		}
	});
}

/**
 * Tells a waiting worker to take over and resolves once it has: on controllerchange, or the
 * worker reaching activated/redundant (an uncontrolled page gets no controllerchange), or the
 * timeout.
 */
export function activateWorker(
	worker: WorkerLike,
	onControllerChange: (listener: () => void) => () => void,
	timeoutMs: number
): Promise<void> {
	return new Promise((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			stopListening();
			worker.removeEventListener('statechange', onStateChange);
			resolve();
		};
		const onStateChange = () => {
			if (worker.state === 'activated' || worker.state === 'redundant') finish();
		};
		const stopListening = onControllerChange(finish);
		const timer = setTimeout(finish, timeoutMs);
		worker.addEventListener('statechange', onStateChange);
		try {
			worker.postMessage({ type: SKIP_WAITING });
		} catch {
			// A redundant worker refuses messages; there is nothing left to activate.
			finish();
			return;
		}
		onStateChange();
	});
}
