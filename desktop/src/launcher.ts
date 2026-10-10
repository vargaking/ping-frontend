import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { assetPath } from './assets';
import { LAUNCHER_ID, launcherPaths, planLauncher } from './launcherEntry';
import { appImagePath } from './login';

function readOrNull(file: string): string | null {
	try {
		return fs.readFileSync(file, 'utf8');
	} catch {
		return null;
	}
}

function writeFile(file: string, write: () => void) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	write();
}

/** Makes the window's WM_CLASS / app_id match the launcher entry so the window groups under its icon. Must run before ready. */
export function nameLauncherWindow() {
	if (appImagePath()) app.setDesktopName(`${LAUNCHER_ID}.desktop`);
}

/** Adds the AppImage to the user's app launcher, and points the entry at the file's current location. */
export function registerLauncher() {
	if (!appImagePath()) return;
	try {
		const home = app.getPath('home');
		const { iconFile } = launcherPaths(process.env, home);
		if (!fs.existsSync(iconFile)) {
			writeFile(iconFile, () => fs.copyFileSync(assetPath('icon.png'), iconFile));
		}
		const plan = planLauncher(process.env, home, readOrNull);
		if (plan) writeFile(plan.entryFile, () => fs.writeFileSync(plan.entryFile, plan.entry));
	} catch (error) {
		console.warn('Could not add Zet to the app launcher', error);
	}
}
