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

export type ShellViewportInput = {
	/** Running as an installed app rather than in a browser tab. */
	installed: boolean;
	editableFocused: boolean;
	width: number;
	innerHeight: number;
	viewportHeight: number;
	resting: RestingHeight | null;
};

export type ShellViewport = {
	height: number;
	keyboardOpen: boolean;
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
	const keyboardOpen = editableFocused && height - viewportHeight > KEYBOARD_MIN_HEIGHT;
	return {
		height: keyboardOpen ? viewportHeight : height,
		keyboardOpen,
		resting: { width, height }
	};
}
