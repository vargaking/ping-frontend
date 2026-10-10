import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenSource } from '$lib/desktop';

const mocks = vi.hoisted(() => ({
	desktop: undefined as Record<string, unknown> | undefined,
	startScreenShare: vi.fn(),
	toastError: vi.fn()
}));

vi.mock('$lib/desktop', () => ({
	get desktop() {
		return mocks.desktop;
	}
}));
vi.mock('./voiceState.svelte', () => ({
	voiceState: {
		sharing: false,
		startingShare: false,
		startScreenShare: mocks.startScreenShare
	}
}));
vi.mock('svelte-sonner', () => ({ toast: { error: mocks.toastError } }));

import { shareDialogState } from './shareDialogState.svelte';

const source = (id: string, kind: ScreenSource['kind'] = 'window'): ScreenSource => ({
	id,
	name: id,
	kind,
	thumbnail: 'data:,'
});

let listScreenSources: ReturnType<typeof vi.fn>;
let shareDialogClosed: ReturnType<typeof vi.fn>;

function useShell(options: { systemPicker?: boolean; listing?: ScreenSource[] } = {}) {
	listScreenSources = vi.fn(async () => options.listing ?? []);
	shareDialogClosed = vi.fn();
	mocks.desktop = {
		listScreenSources,
		shareDialogClosed,
		systemPicker: options.systemPicker
	};
}

/** What the shell does on a capture: asks the page, which answers through handleShellRequest. */
function shellAsks(sources: ScreenSource[]) {
	const answer = { id: undefined as string | null | undefined };
	mocks.startScreenShare.mockImplementation(async () => {
		answer.id = await shareDialogState.handleShellRequest(sources);
	});
	return answer;
}

async function showAndWait() {
	shareDialogState.show();
	await vi.waitFor(() => expect(shareDialogState.sources).not.toBeNull());
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.startScreenShare.mockResolvedValue(undefined);
});

afterEach(() => {
	shareDialogState.close();
	mocks.desktop = undefined;
});

describe('a capture the dialog armed', () => {
	it('answers the chosen id when the shell offers it', async () => {
		useShell({ listing: [source('a'), source('b')] });
		await showAndWait();
		shareDialogState.selected = 'b';
		const answer = shellAsks([source('a'), source('b')]);

		await shareDialogState.share();

		expect(answer.id).toBe('b');
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it('takes the only source the shell offers when the chosen id is gone', async () => {
		useShell({ listing: [source('old')] });
		await showAndWait();
		shareDialogState.selected = 'old';
		const answer = shellAsks([source('new')]);

		await shareDialogState.share();

		expect(answer.id).toBe('new');
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it('does not fall back to a lone screen when the chosen window is gone', async () => {
		useShell({ listing: [source('window')] });
		await showAndWait();
		shareDialogState.selected = 'window';
		const answer = shellAsks([source('screen', 'screen')]);

		await shareDialogState.share();

		expect(answer.id).toBeNull();
		expect(mocks.toastError).toHaveBeenCalledTimes(1);
		expect(mocks.toastError.mock.calls[0][0]).toMatch(/no longer available/);
	});

	it('declines and says so when the chosen id is gone among several sources', async () => {
		useShell({ listing: [source('old')] });
		await showAndWait();
		shareDialogState.selected = 'old';
		const answer = shellAsks([source('x'), source('y')]);

		await shareDialogState.share();

		expect(answer.id).toBeNull();
		expect(mocks.toastError).toHaveBeenCalledTimes(1);
		expect(mocks.toastError.mock.calls[0][0]).toMatch(/no longer available/);
	});

	it('stays silent when the shell offers nothing', async () => {
		useShell({ listing: [source('old')] });
		await showAndWait();
		shareDialogState.selected = 'old';
		const answer = shellAsks([]);

		await shareDialogState.share();

		expect(answer.id).toBeNull();
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it('does not carry a miss over to the next share', async () => {
		useShell({ listing: [source('old')] });
		await showAndWait();
		shareDialogState.selected = 'old';
		shellAsks([source('x'), source('y')]);
		await shareDialogState.share();
		mocks.toastError.mockClear();

		await showAndWait();
		shareDialogState.selected = 'old';
		shellAsks([source('old')]);
		await shareDialogState.share();

		expect(mocks.toastError).not.toHaveBeenCalled();
	});
});

describe('a capture nothing armed', () => {
	it('opens the pick-only dialog without guessing, even for a single source', async () => {
		useShell();
		let answer: string | null | undefined;
		void shareDialogState.handleShellRequest([source('only')]).then((id) => (answer = id));

		expect(shareDialogState.open).toBe(true);
		expect(shareDialogState.pickOnly).toBe(true);
		expect(shareDialogState.sources).toEqual([source('only')]);
		await Promise.resolve();
		expect(answer).toBeUndefined();

		shareDialogState.choose('only');
		await vi.waitFor(() => expect(answer).toBe('only'));
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it('answers null when the dialog is closed', async () => {
		useShell();
		let answer: string | null | undefined;
		void shareDialogState.handleShellRequest([source('only')]).then((id) => (answer = id));

		shareDialogState.close();

		await vi.waitFor(() => expect(answer).toBeNull());
		expect(mocks.toastError).not.toHaveBeenCalled();
	});
});

describe('the system chooser', () => {
	it('is only on when the shell says so', () => {
		useShell({ systemPicker: true });
		expect(shareDialogState.systemPicker).toBe(true);
		useShell();
		expect(shareDialogState.systemPicker).toBe(false);
	});

	it('selects the one source it returns', async () => {
		useShell({ systemPicker: true, listing: [source('w1')] });

		await showAndWait();

		expect(listScreenSources).toHaveBeenCalledTimes(1);
		expect(shareDialogState.selected).toBe('w1');
	});

	it('selects nothing when the chooser was cancelled', async () => {
		useShell({ systemPicker: true, listing: [] });

		await showAndWait();

		expect(shareDialogState.sources).toEqual([]);
		expect(shareDialogState.selected).toBeNull();
	});

	it('lists again on change and replaces the selection', async () => {
		useShell({ systemPicker: true, listing: [source('w1')] });
		await showAndWait();
		listScreenSources.mockResolvedValue([source('w2')]);

		shareDialogState.change();
		expect(shareDialogState.selected).toBeNull();
		await vi.waitFor(() => expect(shareDialogState.selected).toBe('w2'));

		expect(listScreenSources).toHaveBeenCalledTimes(2);
		expect(shareDialogState.sources).toEqual([source('w2')]);
	});

	it('clears the selection when the second chooser is cancelled', async () => {
		useShell({ systemPicker: true, listing: [source('w1')] });
		await showAndWait();
		listScreenSources.mockResolvedValue([]);

		shareDialogState.change();

		await vi.waitFor(() => expect(shareDialogState.sources).toEqual([]));
		expect(shareDialogState.selected).toBeNull();
	});

	it('ignores a chooser result that arrives after the dialog closed', async () => {
		useShell({ systemPicker: true });
		let finish!: (sources: ScreenSource[]) => void;
		listScreenSources.mockReturnValue(new Promise((resolve) => (finish = resolve)));
		shareDialogState.show();

		shareDialogState.close();
		finish([source('late')]);
		await Promise.resolve();
		await Promise.resolve();

		expect(shareDialogState.selected).toBeNull();
	});
});

describe('telling the shell the dialog is closed', () => {
	it('close() tells it', () => {
		useShell({ systemPicker: true, listing: [source('w1')] });
		shareDialogState.show();

		shareDialogState.close();

		expect(shareDialogClosed).toHaveBeenCalledTimes(1);
	});

	it('share() does not, before or after the capture request', async () => {
		useShell({ systemPicker: true, listing: [source('w1')] });
		await showAndWait();
		let closedDuringCapture: number | undefined;
		mocks.startScreenShare.mockImplementation(async () => {
			await shareDialogState.handleShellRequest([source('w1')]);
			closedDuringCapture = shareDialogClosed.mock.calls.length;
		});

		await shareDialogState.share();

		expect(closedDuringCapture).toBe(0);
		expect(shareDialogClosed).not.toHaveBeenCalled();
	});

	it('does not break on a shell without the method', () => {
		mocks.desktop = { listScreenSources: vi.fn(async () => []) };
		expect(() => shareDialogState.close()).not.toThrow();
	});
});
