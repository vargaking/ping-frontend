class MembersPanelState {
	open = $state(true);

	toggle() {
		this.open = !this.open;
	}
}

export const membersPanelState = new MembersPanelState();
