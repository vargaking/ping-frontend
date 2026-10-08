import { desktop } from '$lib/desktop';

export type BrowserKind = 'chromium' | 'firefox' | 'safari' | 'other';
export type Platform = 'windows' | 'mac' | 'linux' | 'other';
export type Surface = 'browser' | 'window' | 'monitor';

export type SoundEnv = {
	browser: { kind: BrowserKind; name: string };
	platform: Platform;
	/** Set inside the desktop app; the shell says whether it can capture sound. */
	desktop: { canShareAudio: boolean } | null;
};

export const SURFACES: Surface[] = ['browser', 'window', 'monitor'];

const OS_NAMES: Record<Platform, string> = {
	windows: 'Windows',
	mac: 'macOS',
	linux: 'Linux',
	other: 'this system'
};

export function detectBrowser(ua: string): SoundEnv['browser'] {
	if (/Edg\//.test(ua)) return { kind: 'chromium', name: 'Edge' };
	if (/OPR\//.test(ua)) return { kind: 'chromium', name: 'Opera' };
	if (/Firefox|FxiOS/.test(ua)) return { kind: 'firefox', name: 'Firefox' };
	if (/Chrome|Chromium|CriOS/.test(ua)) return { kind: 'chromium', name: 'Chrome' };
	if (/Safari/.test(ua)) return { kind: 'safari', name: 'Safari' };
	return { kind: 'other', name: 'Your browser' };
}

export function detectPlatform(ua: string): Platform {
	if (/Windows/.test(ua)) return 'windows';
	if (/Android/.test(ua)) return 'other';
	if (/iPhone|iPad/.test(ua)) return 'other';
	if (/Mac OS X|Macintosh/.test(ua)) return 'mac';
	if (/Linux|X11/.test(ua)) return 'linux';
	return 'other';
}

export function soundEnv(): SoundEnv {
	if (desktop) {
		const platform: Platform =
			desktop.platform === 'win32' ? 'windows' : desktop.platform === 'darwin' ? 'mac' : 'linux';
		return {
			browser: { kind: 'chromium', name: 'Zet' },
			platform,
			// Shells before 0.3.0 don't report it, and only capture sound on Windows.
			desktop: { canShareAudio: desktop.canShareAudio ?? desktop.platform === 'win32' }
		};
	}
	const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
	return { browser: detectBrowser(ua), platform: detectPlatform(ua), desktop: null };
}

export function soundOption(env: SoundEnv, surface: Surface): { available: boolean; note: string } {
	const { browser, platform } = env;
	if (env.desktop?.canShareAudio) {
		return { available: true, note: 'Includes everything this PC plays, not only what you pick.' };
	}
	if (env.desktop) {
		return { available: false, note: `Sound isn't available on ${OS_NAMES[platform]} yet.` };
	}
	if (browser.kind === 'firefox' || browser.kind === 'safari') {
		return { available: false, note: `${browser.name} can't share sound.` };
	}
	if (browser.kind === 'chromium') {
		if (surface === 'browser') {
			return {
				available: true,
				note: `Plays the tab's sound. Leave "Also share tab audio" ticked in ${browser.name}'s picker.`
			};
		}
		if (surface === 'window') {
			return {
				available: false,
				note: `${browser.name} only shares sound from a tab or the entire screen.`
			};
		}
		if (platform === 'windows') {
			return {
				available: true,
				note: `Shares everything this PC plays. Leave "Also share system audio" ticked in ${browser.name}'s picker.`
			};
		}
		return {
			available: false,
			note: `${browser.name} only shares the entire screen's sound on Windows. Pick a tab to share its sound.`
		};
	}
	return { available: true, note: 'Your browser may not share sound.' };
}

export function soundResult(
	env: SoundEnv,
	captured: { audioTracks: number; surface?: Surface; requested: boolean }
): { on: boolean; text: string } {
	const no = (reason: string) => ({ on: false, text: `No sound: ${reason}` });
	const { browser, platform } = env;
	const { surface } = captured;

	if (captured.audioTracks > 0) return { on: true, text: 'Sound on' };
	if (env.desktop && !env.desktop.canShareAudio) {
		return no(`sound isn't available on ${OS_NAMES[platform]} yet`);
	}
	if (!env.desktop && (browser.kind === 'firefox' || browser.kind === 'safari')) {
		return no(`${browser.name} can't share sound`);
	}
	if (!captured.requested) return no('you turned sound off');
	if (env.desktop) return no("the PC's sound couldn't be captured");
	if (surface === 'window')
		return no(`${browser.name} only shares sound from a tab or the entire screen`);
	if (surface === 'monitor' && platform !== 'windows') {
		return no(`${browser.name} only shares the entire screen's sound on Windows`);
	}
	if (surface === 'browser' || surface === 'monitor') {
		return no("the box wasn't ticked in the browser's picker");
	}
	return { on: false, text: 'No sound' };
}
