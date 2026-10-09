import { phoneState } from './phoneState.svelte';

/** The member list is a side panel on desktop and a full-screen sheet on a
 *  phone. Each keeps its own state, so the sheet always starts closed. */
class MembersPanelState {
	private desktopOpen = $state(true);
	private sheetOpen = $state(false);

	get open() {
		return phoneState.phone ? this.sheetOpen : this.desktopOpen;
	}

	toggle() {
		if (phoneState.phone) this.sheetOpen = !this.sheetOpen;
		else this.desktopOpen = !this.desktopOpen;
	}

	show() {
		if (phoneState.phone) this.sheetOpen = true;
		else this.desktopOpen = true;
	}

	closeSheet() {
		this.sheetOpen = false;
	}
}

export const membersPanelState = new MembersPanelState();
