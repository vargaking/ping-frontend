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
};

declare global {
	interface Window {
		zetDesktop?: DesktopBridge;
	}
}

/** The Electron shell's bridge; undefined in a normal browser. */
export const desktop: DesktopBridge | undefined =
	typeof window === 'undefined' ? undefined : window.zetDesktop;
