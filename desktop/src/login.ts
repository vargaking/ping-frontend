import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { quoteExecArg } from './launcherEntry';

const ARGS = ['--hidden'];

function autostartFile(): string {
	const config = process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config');
	return path.join(config, 'autostart', 'zet.desktop');
}

/** The running binary of an AppImage lives in a temp mount, so autostart must point at the .AppImage file. */
export function appImagePath(): string | null {
	return process.platform === 'linux' ? process.env.APPIMAGE || null : null;
}

/** null where the platform can't launch at login (Linux outside an AppImage). */
export function getLaunchAtLogin(): boolean | null {
	if (process.platform === 'linux') {
		return appImagePath() ? fs.existsSync(autostartFile()) : null;
	}
	return app.getLoginItemSettings({ args: ARGS }).openAtLogin;
}

function setLinuxLaunchAtLogin(appImage: string, enabled: boolean): boolean {
	const file = autostartFile();
	try {
		if (enabled) {
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(
				file,
				[
					'[Desktop Entry]',
					'Type=Application',
					'Name=Zet',
					`Exec=${quoteExecArg(appImage)} ${ARGS.join(' ')}`,
					'X-GNOME-Autostart-enabled=true',
					''
				].join('\n')
			);
		} else {
			fs.rmSync(file, { force: true });
		}
	} catch {
		// keep the current state when the file can't be written
	}
	return fs.existsSync(file);
}

export function setLaunchAtLogin(enabled: boolean): boolean | null {
	if (process.platform === 'linux') {
		const appImage = appImagePath();
		return appImage ? setLinuxLaunchAtLogin(appImage, enabled) : null;
	}
	app.setLoginItemSettings({ openAtLogin: enabled, args: ARGS });
	return getLaunchAtLogin();
}
