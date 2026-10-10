import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controllerChanges, FakeWorker } from '../../test/fakeServiceWorker';
import { activateWorker, askWorkerVersion, whenWorkerSettles } from './workerUpdate';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('whenWorkerSettles', () => {
	it.each(['installed', 'redundant'] as const)(
		'resolves when the worker becomes %s',
		async (state) => {
			const worker = new FakeWorker();
			const settled = vi.fn();
			void whenWorkerSettles(worker).then(settled);

			await vi.advanceTimersByTimeAsync(0);
			expect(settled).not.toHaveBeenCalled();

			worker.setState(state);
			await vi.advanceTimersByTimeAsync(0);
			expect(settled).toHaveBeenCalled();
		}
	);

	it('resolves at once when the worker has already installed', async () => {
		const worker = new FakeWorker();
		worker.state = 'installed';

		await expect(whenWorkerSettles(worker)).resolves.toBeUndefined();
	});

	it('resolves after the timeout when the worker never settles', async () => {
		const worker = new FakeWorker();
		const settled = vi.fn();
		void whenWorkerSettles(worker, 5000).then(settled);

		await vi.advanceTimersByTimeAsync(4999);
		expect(settled).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toHaveBeenCalled();
	});

	it('leaves no listener or timer behind', async () => {
		const settledWorker = new FakeWorker();
		const settled = whenWorkerSettles(settledWorker);
		expect(settledWorker.listenerCount).toBe(1);
		settledWorker.setState('installed');
		await settled;
		expect(settledWorker.listenerCount).toBe(0);

		const timedOutWorker = new FakeWorker();
		const timedOut = whenWorkerSettles(timedOutWorker, 1000);
		await vi.advanceTimersByTimeAsync(1000);
		await timedOut;
		expect(timedOutWorker.listenerCount).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('askWorkerVersion', () => {
	it('returns the version the worker replies with over the port', async () => {
		const worker = new FakeWorker();
		worker.postMessage.mockImplementation((message: unknown, transfer: MessagePort[]) => {
			expect(message).toEqual({ type: 'version' });
			transfer[0].postMessage({ version: 'build-7' });
		});

		await expect(askWorkerVersion(worker)).resolves.toBe('build-7');
	});

	it('returns null when the worker does not answer in time', async () => {
		const worker = new FakeWorker();
		const answer = askWorkerVersion(worker, 3000);

		await vi.advanceTimersByTimeAsync(3000);

		await expect(answer).resolves.toBeNull();
	});

	it('returns null when the reply has no version', async () => {
		const worker = new FakeWorker();
		worker.postMessage.mockImplementation((_message: unknown, transfer: MessagePort[]) => {
			transfer[0].postMessage({ version: 7 });
		});

		await expect(askWorkerVersion(worker)).resolves.toBeNull();
	});

	it('returns null when posting the message throws', async () => {
		const worker = new FakeWorker();
		worker.postMessage.mockImplementation(() => {
			throw new Error('worker is gone');
		});

		await expect(askWorkerVersion(worker)).resolves.toBeNull();
	});
});

describe('activateWorker', () => {
	it('tells the worker to take over', async () => {
		const worker = new FakeWorker();
		const changes = controllerChanges();
		const done = activateWorker(worker, changes.subscribe, 10_000);

		expect(worker.postMessage).toHaveBeenCalledWith({ type: 'skip-waiting' });

		changes.fire();
		await done;
	});

	it('resolves on controllerchange', async () => {
		const worker = new FakeWorker();
		const changes = controllerChanges();
		const settled = vi.fn();
		void activateWorker(worker, changes.subscribe, 10_000).then(settled);

		await vi.advanceTimersByTimeAsync(0);
		expect(settled).not.toHaveBeenCalled();

		changes.fire();
		await vi.advanceTimersByTimeAsync(0);
		expect(settled).toHaveBeenCalled();
	});

	it.each(['activated', 'redundant'] as const)(
		'resolves when the worker becomes %s',
		async (state) => {
			const worker = new FakeWorker();
			const changes = controllerChanges();
			const settled = vi.fn();
			void activateWorker(worker, changes.subscribe, 10_000).then(settled);

			worker.setState(state);
			await vi.advanceTimersByTimeAsync(0);

			expect(settled).toHaveBeenCalled();
		}
	);

	it('resolves at once when the worker has already activated', async () => {
		const worker = new FakeWorker();
		worker.state = 'activated';

		await expect(activateWorker(worker, controllerChanges().subscribe, 10_000)).resolves.toBe(
			undefined
		);
	});

	it('resolves after the timeout when nothing happens', async () => {
		const worker = new FakeWorker();
		const settled = vi.fn();
		void activateWorker(worker, controllerChanges().subscribe, 10_000).then(settled);

		await vi.advanceTimersByTimeAsync(9999);
		expect(settled).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toHaveBeenCalled();
	});

	it('removes its listeners and timer on the first outcome', async () => {
		const worker = new FakeWorker();
		const changes = controllerChanges();
		const done = activateWorker(worker, changes.subscribe, 10_000);
		expect(changes.count).toBe(1);
		expect(worker.listenerCount).toBe(1);

		changes.fire();
		await done;

		expect(changes.count).toBe(0);
		expect(worker.listenerCount).toBe(0);
		expect(vi.getTimerCount()).toBe(0);

		worker.setState('activated');
		await vi.advanceTimersByTimeAsync(10_000);
	});
});
