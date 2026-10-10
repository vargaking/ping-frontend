import { vi } from 'vitest';

export class FakeWorker extends EventTarget {
	state: ServiceWorkerState = 'installing';
	postMessage = vi.fn();
	private registered = new Set<EventListenerOrEventListenerObject>();

	get listenerCount() {
		return this.registered.size;
	}

	override addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: AddEventListenerOptions | boolean
	) {
		if (listener) this.registered.add(listener);
		super.addEventListener(type, listener, options);
	}

	override removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: EventListenerOptions | boolean
	) {
		if (listener) this.registered.delete(listener);
		super.removeEventListener(type, listener, options);
	}

	setState(state: ServiceWorkerState) {
		this.state = state;
		this.dispatchEvent(new Event('statechange'));
	}
}

export class FakeRegistration extends EventTarget {
	installing: FakeWorker | null = null;
	waiting: FakeWorker | null = null;
	update = vi.fn(async () => {});
}

/** Stands in for navigator.serviceWorker's controllerchange event. */
export function controllerChanges() {
	const listeners = new Set<() => void>();
	return {
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		fire() {
			[...listeners].forEach((listener) => listener());
		},
		get count() {
			return listeners.size;
		}
	};
}
