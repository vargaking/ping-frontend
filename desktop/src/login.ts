import { app } from 'electron';

const ARGS = ['--hidden'];

/** null where the platform can't launch at login (Linux). */
export function getLaunchAtLogin(): boolean | null {
	if (process.platform === 'linux') return null;
	return app.getLoginItemSettings({ args: ARGS }).openAtLogin;
}

export function setLaunchAtLogin(enabled: boolean): boolean | null {
	if (process.platform === 'linux') return null;
	app.setLoginItemSettings({ openAtLogin: enabled, args: ARGS });
	return getLaunchAtLogin();
}
