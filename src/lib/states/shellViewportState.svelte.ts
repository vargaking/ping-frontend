import { untrack } from 'svelte';
import type { Orientation } from '$lib/utils/shellViewport';

const STORAGE_KEY = 'layoutInfo';
const TRACE_LENGTH = 10;

function loadShowInfo(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) === 'on';
	} catch {
		return false;
	}
}

export type ShellViewportReading = {
	height: number;
	resting: number;
	keyboardOpen: boolean;
	editableFocused: boolean;
	installed: boolean;
};

export type ShellViewportEvent = {
	event: string;
	viewport: number;
	offsetTop: number;
	scrollY: number;
	appHeight: number;
};

export type TraceEntry = ShellViewportEvent & { seq: number; t: number };

const keyboardKey = (orientation: Orientation) => `keyboardHeight:${orientation}`;

/** What the app layout last decided about the shell height, and whether the layout
 *  readout is on, remembered per device. */
class ShellViewportState {
	reading = $state<ShellViewportReading | null>(null);
	showInfo = $state(loadShowInfo());
	/** The last viewport events, oldest first, for the layout readout. */
	trace = $state<TraceEntry[]>([]);
	private traceStart: number | null = null;
	private traceSeq = 0;

	record(reading: ShellViewportReading) {
		this.reading = reading;
	}

	/** Called from the layout's effect, which mustn't come to depend on the trace. */
	note(entry: ShellViewportEvent) {
		const now = performance.now();
		this.traceStart ??= now;
		const t = Math.round(now - this.traceStart);
		const kept = untrack(() => this.trace.slice(1 - TRACE_LENGTH));
		this.trace = [...kept, { seq: this.traceSeq++, t, ...entry }];
	}

	keyboardHeight(orientation: Orientation): number | null {
		try {
			const stored = Number(localStorage.getItem(keyboardKey(orientation)));
			return stored > 0 ? stored : null;
		} catch {
			return null;
		}
	}

	rememberKeyboardHeight(orientation: Orientation, height: number) {
		try {
			localStorage.setItem(keyboardKey(orientation), String(Math.round(height)));
		} catch {
			/* storage unavailable: the next open estimates again */
		}
	}

	clear() {
		this.reading = null;
		this.trace = [];
		this.traceStart = null;
	}

	toggleInfo() {
		this.showInfo = !this.showInfo;
		try {
			localStorage.setItem(STORAGE_KEY, this.showInfo ? 'on' : 'off');
		} catch {
			/* storage unavailable: the choice lasts until reload */
		}
	}
}

export const shellViewportState = new ShellViewportState();
