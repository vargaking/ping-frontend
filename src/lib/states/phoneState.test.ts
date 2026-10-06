import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeNavOnPageLink, opensOnNavigation, phoneState } from './phoneState.svelte';

beforeAll(() => {
	vi.stubGlobal('Element', class {});
});

afterEach(() => {
	phoneState.phone = false;
	phoneState.touch = false;
	phoneState.navOpen = false;
});

describe('opensOnNavigation', () => {
	it('opens on the app home and the direct-message home', () => {
		for (const path of ['/app', '/app/', '/app/direct', '/app/direct/']) {
			expect(opensOnNavigation(path), path).toBe(true);
		}
	});

	it('opens on the page for anything deeper', () => {
		for (const path of [
			'/app/direct/4/',
			'/app/server/2/',
			'/app/server/2/channel/9/',
			'/app/server/2/voice/3/'
		]) {
			expect(opensOnNavigation(path), path).toBe(false);
		}
	});
});

describe('phone navigation', () => {
	it('starts on the pane the path asks for', () => {
		phoneState.startAt('/app/');
		expect(phoneState.navOpen).toBe(true);
		phoneState.startAt('/app/direct/4/');
		expect(phoneState.navOpen).toBe(false);
	});

	it('covers the page only on a phone', () => {
		phoneState.navOpen = true;
		expect(phoneState.navCoversContent).toBe(false);
		phoneState.phone = true;
		expect(phoneState.navCoversContent).toBe(true);
		phoneState.closeNav();
		expect(phoneState.navCoversContent).toBe(false);
		phoneState.openNav();
		expect(phoneState.navCoversContent).toBe(true);
	});
});

describe('closeNavOnPageLink', () => {
	function click(closest: (selector: string) => unknown) {
		let handler: (event: MouseEvent) => void = () => {};
		const node = {
			addEventListener: (_type: string, fn: (event: MouseEvent) => void) => (handler = fn),
			removeEventListener: () => {}
		} as unknown as HTMLElement;
		closeNavOnPageLink(node);
		const target = Object.assign(new Element(), { closest });
		handler({ target } as unknown as MouseEvent);
	}

	it('closes the navigation when a link into the app is followed', () => {
		phoneState.navOpen = true;
		click((selector) => (selector === 'a[href^="/app/"]' ? {} : null));
		expect(phoneState.navOpen).toBe(false);
	});

	it('keeps it open for taps that are not page links', () => {
		phoneState.navOpen = true;
		click(() => null);
		expect(phoneState.navOpen).toBe(true);
	});
});
