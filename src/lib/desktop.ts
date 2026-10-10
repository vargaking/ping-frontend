export type ScreenSource = {
	id: string;
	name: string;
	kind: 'screen' | 'window';
	/** data: URL */
	thumbnail: string;
	/** data: URL of the app icon, windows only */
	icon?: string;
};

export type DesktopBridge = {
	/** Shell version, e.g. "0.1.0". */
	version: string;
	platform: 'win32' | 'darwin' | 'linux';
	/** count = badge number (mentions + unread DMs), unread = anything unread at all. */
	setUnread(state: { count: number; unread: boolean }): void;
	/** Bring the window to the front, e.g. from a notification click while it sits in the tray. */
	showWindow(): void;
	/** null when this platform can't launch at login (Linux). */
	getLaunchAtLogin(): Promise<boolean | null>;
	setLaunchAtLogin(enabled: boolean): Promise<boolean | null>;
	/** Used by the offline page only. */
	retry(): void;
	/** True when the shell hides the native title bar and the page must draw one. */
	frameless?: boolean;
	/** Whether the shell can capture the PC's sound with a screen share. Shells before 0.3.0 don't say. */
	canShareAudio?: boolean;
	/** True when the OS shows its own chooser on every listing, as on Wayland. Shells before 0.3.1 don't say. */
	systemPicker?: boolean;
	/** Everything that can be shared, for the page's own picker. Shells before 0.3.0 lack it and ask through onPickScreenSource instead. */
	listScreenSources?(): Promise<ScreenSource[]>;
	/** Tells the shell the share dialog is closed, so it drops the sources it kept. Shells before 0.3.1 lack it. */
	shareDialogClosed?(): void;
	/** The shell calls the handler when the page asks to share its screen. Resolve with a source id, or null to cancel. Returns an unsubscribe. */
	onPickScreenSource?(handler: (sources: ScreenSource[]) => Promise<string | null>): () => void;
};

declare global {
	interface Window {
		zetDesktop?: DesktopBridge;
	}
}

/** The Electron shell's bridge; undefined in a normal browser. */
export const desktop: DesktopBridge | undefined =
	typeof window === 'undefined' ? undefined : window.zetDesktop;

export const frameless = desktop?.frameless === true;
