/** Hold time before a touch opens a context menu. */
export const LONG_PRESS_MS = 375;
/** A finger that moves further than this is scrolling, not holding. */
export const LONG_PRESS_SLOP_PX = 10;

/** Dispatched on a held element by a gesture that has claimed the touch, so the hold gives up. */
export const HOLD_CANCEL_EVENT = 'holdcancel';

export type Point = { x: number; y: number };

/** Tracks one finger on one element and fires once it has been held still long enough. */
export class LongPress {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private origin: Point | null = null;

	constructor(
		private readonly onHold: (at: Point) => void,
		private readonly onHoldingChange: (holding: boolean) => void
	) {}

	start(at: Point) {
		this.cancel();
		this.origin = at;
		this.onHoldingChange(true);
		this.timer = setTimeout(() => {
			this.timer = null;
			this.origin = null;
			this.onHold(at);
		}, LONG_PRESS_MS);
	}

	move(to: Point) {
		if (!this.origin) return;
		const dx = to.x - this.origin.x;
		const dy = to.y - this.origin.y;
		if (dx * dx + dy * dy > LONG_PRESS_SLOP_PX * LONG_PRESS_SLOP_PX) this.cancel();
	}

	/** The finger lifted or the browser took over (scrolling). Does nothing after the hold fired. */
	cancel() {
		if (!this.origin) return;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.origin = null;
		this.onHoldingChange(false);
	}
}
