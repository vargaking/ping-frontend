import { getContext, setContext } from 'svelte';

export type ProfileCardTarget =
	| { kind: 'user'; userId: number; serverId: number | null; fallbackName?: string | null }
	| { kind: 'imported'; name: string };

export type ProfileCardPlacement = {
	side?: 'top' | 'right' | 'bottom' | 'left';
	align?: 'start' | 'center' | 'end';
};

/** The one profile card that can be open, and the element it hangs off. */
class ProfileCardState {
	target = $state<ProfileCardTarget | null>(null);
	anchor = $state.raw<HTMLElement | null>(null);
	placement = $state.raw<ProfileCardPlacement>({});

	/** Opens the card for `anchor`; clicking the anchor of the open card closes it. */
	toggle(anchor: HTMLElement, target: ProfileCardTarget, placement: ProfileCardPlacement = {}) {
		if (this.target && this.anchor === anchor) {
			this.close();
			return;
		}
		this.anchor = anchor;
		this.target = target;
		this.placement = placement;
	}

	close() {
		this.target = null;
		this.anchor = null;
		this.placement = {};
	}
}

export const profileCardState = new ProfileCardState();

const SERVER_KEY = Symbol('profile-card-server');

/** Lets mentions inside a message group open cards in the group's server. */
export function provideProfileCardServer(get: () => number | null) {
	setContext(SERVER_KEY, get);
}

export function profileCardServer(): () => number | null {
	return getContext<(() => number | null) | undefined>(SERVER_KEY) ?? (() => null);
}
