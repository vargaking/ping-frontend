const DESKTOP_KEY = 'notifications:desktop';
const SOUND_KEY = 'notifications:sound';

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

function readBool(key: string, fallback: boolean): boolean {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? fallback : raw === 'true';
	} catch {
		return fallback;
	}
}

function writeBool(key: string, value: boolean) {
	try {
		localStorage.setItem(key, String(value));
	} catch {
		// Storage unavailable: the preference just won't survive a reload.
	}
}

function readPermission(): NotificationPermissionState {
	if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
	try {
		return Notification.permission;
	} catch {
		return 'unsupported';
	}
}

/** Desktop/sound notification prefs, persisted in localStorage, plus the live
 *  browser permission state (re-read on focus and on settings-tab mount). */
class NotificationsState {
	desktop = $state(readBool(DESKTOP_KEY, false));
	sound = $state(readBool(SOUND_KEY, true));
	permission = $state<NotificationPermissionState>(readPermission());

	private listenerAttached = false;

	setDesktop(value: boolean) {
		this.desktop = value;
		writeBool(DESKTOP_KEY, value);
	}

	setSound(value: boolean) {
		this.sound = value;
		writeBool(SOUND_KEY, value);
	}

	refreshPermission() {
		this.permission = readPermission();
	}

	/** Must be called from a click handler — browsers reject requestPermission()
	 *  calls that don't originate from a user gesture. */
	async requestPermission(): Promise<NotificationPermissionState> {
		if (typeof window === 'undefined' || !('Notification' in window)) {
			this.permission = 'unsupported';
			return this.permission;
		}
		try {
			const result = await Notification.requestPermission();
			this.permission = result;
			return result;
		} catch {
			this.permission = readPermission();
			return this.permission;
		}
	}

	/** Wire up passive permission refresh: window focus, and the Permissions API
	 *  change event where supported. Safe to call more than once. */
	attachPermissionListeners() {
		if (this.listenerAttached || typeof window === 'undefined') return;
		this.listenerAttached = true;

		window.addEventListener('focus', () => this.refreshPermission());

		if ('permissions' in navigator) {
			navigator.permissions
				?.query({ name: 'notifications' as PermissionName })
				.then((status) => {
					status.onchange = () => this.refreshPermission();
				})
				.catch(() => {
					// Some browsers don't support querying the 'notifications' permission.
				});
		}
	}
}

export const notificationsState = new NotificationsState();
