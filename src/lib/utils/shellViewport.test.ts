import { describe, expect, it } from 'vitest';
import {
	expectedKeyboardHeight,
	measuredKeyboardHeight,
	orientationOf,
	describeTopEdge,
	findTopEdge,
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

type Box = {
	position?: string;
	width?: number;
	background?: string;
	backdrop?: string;
	parent?: Box;
};

function documentWith(hits: Box[], innerWidth = 390): Document {
	const style = (box: Box) => ({
		position: box.position ?? 'static',
		backgroundColor: box.background ?? 'rgba(0, 0, 0, 0)',
		getPropertyValue: (name: string) => (name === 'backdrop-filter' ? (box.backdrop ?? 'none') : '')
	});
	const elements = new Map<Element, Box>();
	const element = (box: Box): Element => {
		const wrapper = {
			parentElement: box.parent ? element(box.parent) : null,
			getBoundingClientRect: () => ({ width: box.width ?? innerWidth })
		} as unknown as Element;
		elements.set(wrapper, box);
		return wrapper;
	};
	const hit = hits.map(element);
	return {
		elementsFromPoint: () => hit,
		defaultView: {
			innerWidth,
			getComputedStyle: (el: Element) => style(elements.get(el)!)
		}
	} as unknown as Document;
}

const none = () => false;

describe('findTopEdge', () => {
	it('finds a sticky bar the hit element sits in', () => {
		const bar = { position: 'sticky', background: 'rgb(13, 15, 17)' };
		const doc = documentWith([{ parent: bar }]);
		expect(findTopEdge(doc, none)).toEqual({
			position: 'sticky',
			background: 'rgb(13, 15, 17)',
			backdrop: false
		});
	});

	it('finds nothing when no ancestor is fixed or sticky', () => {
		expect(findTopEdge(documentWith([{ parent: { parent: {} } }]), none)).toBeNull();
	});

	it('ignores a fixed or sticky box narrower than 90% of the viewport', () => {
		const doc = documentWith([{ position: 'fixed', width: 300 }]);
		expect(findTopEdge(doc, none)).toBeNull();
	});

	it('walks past a narrow fixed box to a wide one above it', () => {
		const doc = documentWith([
			{ position: 'fixed', width: 100, parent: { position: 'fixed', background: 'red' } }
		]);
		expect(findTopEdge(doc, none)?.position).toBe('fixed');
		expect(findTopEdge(doc, none)?.background).toBe('red');
	});

	it('skips ignored elements and uses the next one down', () => {
		const readout = { position: 'fixed', background: 'black' };
		const bar = { position: 'sticky', background: 'white' };
		const doc = documentWith([readout, bar]);
		const hit = doc.elementsFromPoint(0, 0);
		const edge = findTopEdge(doc, (element) => element === hit[0]);
		expect(edge?.background).toBe('white');
	});

	it('flags a backdrop filter anywhere on the walk up to the match', () => {
		const bar = { position: 'sticky', background: 'white' };
		const above = { backdrop: 'blur(8px)' };
		expect(
			findTopEdge(documentWith([{ backdrop: 'blur(8px)', parent: bar }]), none)?.backdrop
		).toBe(true);
		expect(
			findTopEdge(documentWith([{ parent: { ...bar, backdrop: 'blur(4px)' } }]), none)?.backdrop
		).toBe(true);
		expect(findTopEdge(documentWith([{ parent: { ...bar, parent: above } }]), none)?.backdrop).toBe(
			false
		);
	});
});

describe('describeTopEdge', () => {
	it('prints none when nothing was found', () => {
		expect(describeTopEdge(null)).toBe('none');
	});

	it('prints the position and colour, with a marker for a backdrop filter', () => {
		const edge = { position: 'sticky', background: 'rgb(13, 15, 17)', backdrop: false } as const;
		expect(describeTopEdge(edge)).toBe('sticky rgb(13, 15, 17)');
		expect(describeTopEdge({ ...edge, position: 'fixed', backdrop: true })).toBe(
			'fixed rgb(13, 15, 17) +backdrop'
		);
	});
});
