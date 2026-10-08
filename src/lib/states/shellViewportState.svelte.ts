const STORAGE_KEY = 'layoutInfo';

function loadShowInfo(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) === 'on';
	} catch {
		return false;
	}
}

export type ShellViewportReading = {
	height: number;
	resting: number;
	keyboardOpen: boolean;
	editableFocused: boolean;
	installed: boolean;
};

/** What the app layout last decided about the shell height, and whether the layout
 *  readout is on, remembered per device. */
class ShellViewportState {
	reading = $state<ShellViewportReading | null>(null);
	showInfo = $state(loadShowInfo());

	record(reading: ShellViewportReading) {
		this.reading = reading;
	}

	clear() {
		this.reading = null;
	}

	toggleInfo() {
		this.showInfo = !this.showInfo;
		try {
			localStorage.setItem(STORAGE_KEY, this.showInfo ? 'on' : 'off');
		} catch {
			/* storage unavailable: the choice lasts until reload */
		}
	}
}

export const shellViewportState = new ShellViewportState();
