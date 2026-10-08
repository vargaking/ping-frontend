const PHONE_QUERY = '(max-width: 767.98px)';
const TOUCH_QUERY = '(pointer: coarse)';

/** A cold start on the app's home or the direct-message home opens on the navigation. */
export function opensOnNavigation(pathname: string): boolean {
	const path = pathname.replace(/\/+$/, '');
	return path === '/app' || path === '/app/direct';
}

/** Which of the two phone panes shows, and what kind of screen this is. Styling
 *  uses the `max-md:` and `pointer-coarse:` variants; this is for behaviour. */
class PhoneState {
	/** Below Tailwind's `md` breakpoint. */
	phone = $state(false);
	/** The primary pointer is a finger. */
	touch = $state(false);
	/** Phone only: the navigation (rail and sidebar) is slid over the page. */
	navOpen = $state(false);
	/** Phone only: the navigation is being dragged, or still sliding shut after a drag. */
	navMoving = $state(false);

	/** The page is mounted underneath but nobody is looking at it. */
	get navCoversContent() {
		return this.phone && (this.navOpen || this.navMoving);
	}

	constructor() {
		if (typeof window === 'undefined') return;
		this.follow(PHONE_QUERY, (matches) => (this.phone = matches));
		this.follow(TOUCH_QUERY, (matches) => (this.touch = matches));
	}

	private follow(query: string, apply: (matches: boolean) => void) {
		const list = window.matchMedia(query);
		apply(list.matches);
		list.addEventListener('change', (event) => apply(event.matches));
	}

	openNav() {
		this.navOpen = true;
	}

	closeNav() {
		this.navOpen = false;
	}

	/** Decides the pane a freshly loaded app starts on. */
	startAt(pathname: string) {
		this.navOpen = opensOnNavigation(pathname);
	}
}

export const phoneState = new PhoneState();

/** Svelte action for the sidebars: following a link to a page closes the phone navigation. */
export function closeNavOnPageLink(node: HTMLElement) {
	const onClick = (event: MouseEvent) => {
		if (event.target instanceof Element && event.target.closest('a[href^="/app/"]')) {
			phoneState.closeNav();
		}
	};
	node.addEventListener('click', onClick);
	return { destroy: () => node.removeEventListener('click', onClick) };
}
