import {
	currentSubscription,
	disablePush,
	enablePush,
	getPushConfig,
	pushSupported,
	registerSubscription,
	type EnablePushResult
} from '$lib/utils/push';

const DESKTOP_KEY = 'notifications:desktop';
const SOUND_KEY = 'notifications:sound';

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

/** `disabled` means the server has push turned off. */
export type PushState = 'unsupported' | 'disabled' | 'off' | 'on';

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
 *  browser permission state (re-read on focus and on settings-tab mount) and
 *  whether this browser is subscribed to Web Push. */
class NotificationsState {
	desktop = $state(readBool(DESKTOP_KEY, false));
	sound = $state(readBool(SOUND_KEY, true));
	permission = $state<NotificationPermissionState>(readPermission());
	push = $state<PushState>('unsupported');
	/** False until refreshPush() has answered, so nothing flashes on load. */
	pushChecked = $state(false);
	pushBusy = $state(false);

	private listenerAttached = false;
	private subscriptionClaimed = false;

	setDesktop(value: boolean) {
		this.desktop = value;
		writeBool(DESKTOP_KEY, value);
		if (!value && this.push === 'on') void this.setPush(false);
	}

	setSound(value: boolean) {
		this.sound = value;
		writeBool(SOUND_KEY, value);
	}

	refreshPermission() {
		this.permission = readPermission();
	}

	async refreshPush() {
		if (!pushSupported()) {
			this.push = 'unsupported';
			this.pushChecked = true;
			return;
		}
		try {
			const config = await getPushConfig();
			if (!config.enabled) {
				this.push = 'disabled';
				return;
			}
			const subscription = await currentSubscription();
			this.push = subscription ? 'on' : 'off';
			// Another account may have used this browser since it subscribed, so
			// hand the subscription to whoever is signed in now.
			if (subscription && !this.subscriptionClaimed) {
				this.subscriptionClaimed = true;
				registerSubscription(subscription).catch(() => {
					this.subscriptionClaimed = false;
				});
			}
		} catch {
			this.push = 'disabled';
		} finally {
			this.pushChecked = true;
		}
	}

	/** Turning on must be called straight from a click, like requestPermission().
	 *  Web Push follows the desktop switch, so turning it on also turns that on. */
	async setPush(on: boolean): Promise<EnablePushResult | null> {
		if (this.pushBusy) return null;
		this.pushBusy = true;
		try {
			if (!on) {
				await disablePush();
				this.push = 'off';
				return null;
			}
			const result = await enablePush();
			this.refreshPermission();
			if (result === 'enabled') {
				this.push = 'on';
				this.subscriptionClaimed = true;
				if (!this.desktop) this.setDesktop(true);
			}
			return result;
		} finally {
			this.pushBusy = false;
		}
	}

	/** Forget push status when the session ends; the next sign-in re-checks it. */
	resetPush() {
		this.push = 'unsupported';
		this.pushChecked = false;
		this.subscriptionClaimed = false;
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
