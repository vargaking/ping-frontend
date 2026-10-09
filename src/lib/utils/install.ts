import { desktop } from '$lib/desktop';

export type MobilePlatform = 'ios' | 'android' | null;

export type InstallEnv = {
	platform: MobilePlatform;
	/** Running as an installed app rather than in a browser tab. */
	standalone: boolean;
	/** Inside the Electron shell. */
	desktopShell: boolean;
};

export type InstallHint = 'add-to-home-screen' | 'install-prompt' | null;

/** iPadOS reports itself as a Mac, so it is told apart by its touch screen. */
export function mobilePlatform(userAgent: string, maxTouchPoints: number): MobilePlatform {
	if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
	if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
	if (/Android/.test(userAgent)) return 'android';
	return null;
}

export function isStandalone(displayModeStandalone: boolean, navigatorStandalone?: boolean) {
	return displayModeStandalone || navigatorStandalone === true;
}

/** iOS has no install prompt to trigger, so it only gets instructions; Android
 *  only gets a hint once the browser has offered the install prompt. */
export function installHint(env: InstallEnv, canPrompt: boolean): InstallHint {
	if (env.desktopShell || env.standalone) return null;
	if (env.platform === 'ios') return 'add-to-home-screen';
	if (env.platform === 'android' && canPrompt) return 'install-prompt';
	return null;
}

/** Where to unblock notifications: the phone's Settings for the installed app, the
 *  browser's site settings everywhere else. */
export function blockedHelp(platform: MobilePlatform, standalone: boolean): string {
	if (standalone && platform === 'ios')
		return 'Open Settings, then Notifications, then Zeta, and allow them.';
	if (standalone && platform === 'android')
		return "Allow notifications for Zeta in your phone's notification settings.";
	if (platform)
		return "Allow notifications for this site in your browser's site settings, then reload.";
	return 'Click the lock icon in the address bar, set Notifications to Allow, then reload.';
}

export function readInstallEnv(): InstallEnv {
	if (typeof window === 'undefined') {
		return { platform: null, standalone: false, desktopShell: false };
	}
	const standalone = isStandalone(
		window.matchMedia('(display-mode: standalone)').matches,
		(navigator as Navigator & { standalone?: boolean }).standalone
	);
	return {
		platform: mobilePlatform(navigator.userAgent, navigator.maxTouchPoints),
		standalone,
		desktopShell: !!desktop
	};
}
