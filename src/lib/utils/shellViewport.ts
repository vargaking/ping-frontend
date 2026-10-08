/** Taller than a browser toolbar or the leftover iOS reports after a keyboard closes. */
export const KEYBOARD_MIN_HEIGHT = 120;

const NON_TEXT_INPUTS = new Set([
	'button',
	'checkbox',
	'color',
	'file',
	'hidden',
	'image',
	'radio',
	'range',
	'reset',
	'submit'
]);

export type RestingHeight = { width: number; height: number };

export type Orientation = 'portrait' | 'landscape';

/** Share of the resting height an iPhone keyboard takes, for before one has been measured. */
const KEYBOARD_ESTIMATE: Record<Orientation, number> = { portrait: 0.41, landscape: 0.6 };

export type ShellViewportInput = {
	/** Running as an installed app rather than in a browser tab. */
	installed: boolean;
	editableFocused: boolean;
	width: number;
	innerHeight: number;
	viewportHeight: number;
	resting: RestingHeight | null;
	/** Shell height set ahead of the keyboard, held until a real keyboard shows up. */
	anticipated?: number | null;
};

export type ShellViewport = {
	height: number;
	keyboardOpen: boolean;
	/** The height is the anticipated one; the viewport hasn't shown the keyboard yet. */
	anticipating: boolean;
	resting: RestingHeight;
};

/** Whether focus is somewhere the on-screen keyboard opens for. */
export function isTextEntry(element: Element | null): boolean {
	if (!element) return false;
	if (element instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(element.type);
	return (
		element instanceof HTMLTextAreaElement ||
		element.matches('[contenteditable]:not([contenteditable="false"]), .ProseMirror')
	);
}

/** iOS can leave `visualViewport.height` too small after the keyboard closes, so it
 *  only counts while an editable has focus and it is well below the resting height.
 *  An installed app's height only changes with the width, so the largest height seen
 *  for that width is the resting one; a tab follows the browser toolbar instead. */
export function shellViewport(input: ShellViewportInput): ShellViewport {
	const { installed, editableFocused, width, innerHeight, viewportHeight, resting } = input;
	const kept = installed && resting?.width === width ? resting.height : 0;
	const height = Math.max(kept, innerHeight, viewportHeight);
	const restingNow = { width, height };
	if (editableFocused && height - viewportHeight > KEYBOARD_MIN_HEIGHT) {
		return { height: viewportHeight, keyboardOpen: true, anticipating: false, resting: restingNow };
	}
	// A viewport that doesn't show the keyboard yet mustn't undo the anticipated height:
	// growing back mid-animation is what makes iOS pan the page.
	if (editableFocused && input.anticipated != null) {
		return {
			height: input.anticipated,
			keyboardOpen: true,
			anticipating: true,
			resting: restingNow
		};
	}
	return { height, keyboardOpen: false, anticipating: false, resting: restingNow };
}

export function orientationOf(resting: RestingHeight): Orientation {
	return resting.width > resting.height ? 'landscape' : 'portrait';
}

/** The keyboard height last measured in this orientation, or an estimate. */
export function expectedKeyboardHeight(resting: RestingHeight, stored: number | null): number {
	if (stored != null && stored > KEYBOARD_MIN_HEIGHT && stored < resting.height) return stored;
	return Math.round(resting.height * KEYBOARD_ESTIMATE[orientationOf(resting)]);
}

/** How tall the keyboard really is, once the viewport shows it. */
export function measuredKeyboardHeight(view: ShellViewport): number | null {
	if (!view.keyboardOpen || view.anticipating) return null;
	return view.resting.height - view.height;
}
