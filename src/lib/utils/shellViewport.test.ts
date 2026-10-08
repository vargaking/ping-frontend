import { describe, expect, it } from 'vitest';
import {
	expectedKeyboardHeight,
	measuredKeyboardHeight,
	orientationOf,
	shellViewport,
	type RestingHeight,
	type ShellViewportInput
} from './shellViewport';

const rest = (height: number, width = 390): RestingHeight => ({ width, height });

function decide(overrides: Partial<ShellViewportInput> = {}) {
	return shellViewport({
		installed: true,
		editableFocused: false,
		width: 390,
		innerHeight: 844,
		viewportHeight: 844,
		resting: null,
		...overrides
	});
}

describe('shellViewport', () => {
	it('uses the full height when nothing is focused', () => {
		expect(decide()).toEqual({
			height: 844,
			keyboardOpen: false,
			anticipating: false,
			resting: rest(844)
		});
	});

	it('follows the visual viewport while the keyboard is up', () => {
		const result = decide({
			editableFocused: true,
			viewportHeight: 544,
			resting: rest(844)
		});
		expect(result.keyboardOpen).toBe(true);
		expect(result.height).toBe(544);
		expect(result.resting).toEqual(rest(844));
	});

	it('ignores a viewport that stays 24px short after blur', () => {
		const result = decide({ viewportHeight: 820, resting: rest(844) });
		expect(result.keyboardOpen).toBe(false);
		expect(result.height).toBe(844);
	});

	it('ignores a viewport that stays 300px short after blur', () => {
		const result = decide({ viewportHeight: 544, resting: rest(844) });
		expect(result.keyboardOpen).toBe(false);
		expect(result.height).toBe(844);
	});

	it('does not count a small shortfall as a keyboard even with focus', () => {
		const result = decide({ editableFocused: true, viewportHeight: 820, resting: rest(844) });
		expect(result.keyboardOpen).toBe(false);
		expect(result.height).toBe(844);
	});

	it('keeps the full height when a hardware keyboard shows no on-screen one', () => {
		const result = decide({ editableFocused: true, resting: rest(844) });
		expect(result.keyboardOpen).toBe(false);
		expect(result.height).toBe(844);
	});

	it('takes the largest of innerHeight and visualViewport as the installed resting height', () => {
		expect(decide({ innerHeight: 800, viewportHeight: 844 }).resting.height).toBe(844);
		expect(decide({ innerHeight: 844, viewportHeight: 800 }).resting.height).toBe(844);
	});

	it('never lowers the installed resting height at the same width', () => {
		const result = decide({ innerHeight: 600, viewportHeight: 600, resting: rest(844) });
		expect(result.resting).toEqual(rest(844));
		expect(result.height).toBe(844);
	});

	it('raises the installed resting height when a larger one shows up', () => {
		expect(
			decide({ innerHeight: 860, viewportHeight: 860, resting: rest(844) }).resting.height
		).toBe(860);
	});

	it('forgets the resting height when the width changes', () => {
		const result = decide({
			width: 844,
			innerHeight: 390,
			viewportHeight: 390,
			resting: rest(844, 390)
		});
		expect(result.resting).toEqual(rest(390, 844));
		expect(result.height).toBe(390);
	});

	it('follows the browser in a tab instead of keeping the largest height', () => {
		const result = decide({
			installed: false,
			innerHeight: 700,
			viewportHeight: 700,
			resting: rest(844)
		});
		expect(result.height).toBe(700);
		expect(result.resting.height).toBe(700);
	});

	it('uses the larger of the two in a tab when the keyboard is closed', () => {
		const result = decide({ installed: false, innerHeight: 844, viewportHeight: 820 });
		expect(result.height).toBe(844);
		expect(result.keyboardOpen).toBe(false);
	});

	it('detects the keyboard in a tab from the layout viewport height', () => {
		const result = decide({
			installed: false,
			editableFocused: true,
			innerHeight: 844,
			viewportHeight: 544
		});
		expect(result.keyboardOpen).toBe(true);
		expect(result.height).toBe(544);
	});
});

describe('anticipated keyboard height', () => {
	it('holds the anticipated height while the viewport still shows no keyboard', () => {
		const result = decide({ editableFocused: true, resting: rest(844), anticipated: 508 });
		expect(result).toMatchObject({ height: 508, keyboardOpen: true, anticipating: true });
	});

	it('switches to the real viewport once the keyboard shows', () => {
		const result = decide({
			editableFocused: true,
			viewportHeight: 520,
			resting: rest(844),
			anticipated: 508
		});
		expect(result).toMatchObject({ height: 520, keyboardOpen: true, anticipating: false });
	});

	it('is dropped as soon as nothing editable has focus', () => {
		const result = decide({ resting: rest(844), anticipated: 508 });
		expect(result).toMatchObject({ height: 844, keyboardOpen: false, anticipating: false });
	});
});

describe('keyboard height', () => {
	it('tells portrait from landscape by the resting size', () => {
		expect(orientationOf(rest(844, 390))).toBe('portrait');
		expect(orientationOf(rest(390, 844))).toBe('landscape');
	});

	it('uses the stored height when it is plausible', () => {
		expect(expectedKeyboardHeight(rest(844), 336)).toBe(336);
	});

	it('estimates when nothing usable is stored', () => {
		expect(expectedKeyboardHeight(rest(844), null)).toBe(346);
		expect(expectedKeyboardHeight(rest(390, 844), null)).toBe(234);
		expect(expectedKeyboardHeight(rest(844), 40)).toBe(346);
		expect(expectedKeyboardHeight(rest(844), 900)).toBe(346);
	});

	it('is measured only from a real keyboard reading', () => {
		const real = decide({ editableFocused: true, viewportHeight: 508, resting: rest(844) });
		expect(measuredKeyboardHeight(real)).toBe(336);

		const anticipated = decide({ editableFocused: true, resting: rest(844), anticipated: 508 });
		expect(measuredKeyboardHeight(anticipated)).toBeNull();
		expect(measuredKeyboardHeight(decide())).toBeNull();
	});
});
