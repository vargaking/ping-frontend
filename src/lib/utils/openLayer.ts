/** Dialogs, menus, listboxes and popovers: while one is open, keys and touches belong to it. */
export const OPEN_LAYER =
	'[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [aria-modal="true"], [data-popover-content]';

export function hasOpenLayer(): boolean {
	return document.querySelector(OPEN_LAYER) != null;
}

/** An open layer, or something floating that closes on Escape (marked data-escape-layer). */
export function hasEscapeLayer(): boolean {
	return document.querySelector(`${OPEN_LAYER}, [data-escape-layer]`) != null;
}

export function isEditable(element: Element | null): boolean {
	return (
		element instanceof HTMLInputElement ||
		element instanceof HTMLTextAreaElement ||
		element instanceof HTMLSelectElement ||
		(element instanceof HTMLElement && element.isContentEditable)
	);
}
