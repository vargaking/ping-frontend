import path from 'node:path';

export const LAUNCHER_ID = 'zet';

// Desktop Entry strings escape backslash and newline.
function escapeValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

/** An Exec argument: quoted, with the reserved characters escaped, then escaped again as a string value. */
export function quoteExecArg(arg: string): string {
	const quoted = arg.replace(/[\\"`$]/g, '\\$&').replace(/%/g, '%%');
	return `"${escapeValue(quoted)}"`;
}

export function launcherEntry(appImage: string): string {
	return [
		'[Desktop Entry]',
		'Type=Application',
		'Name=Zet',
		`Exec=${quoteExecArg(appImage)} %U`,
		`TryExec=${escapeValue(appImage)}`,
		`Icon=${LAUNCHER_ID}`,
		`StartupWMClass=${LAUNCHER_ID}`,
		'Categories=Network;Chat;',
		'Terminal=false',
		''
	].join('\n');
}

export function needsWrite(existing: string | null, wanted: string): boolean {
	return existing !== wanted;
}

export function launcherPaths(
	env: Record<string, string | undefined>,
	home: string
): { entryFile: string; iconFile: string } {
	const dataHome = env.XDG_DATA_HOME || path.join(home, '.local', 'share');
	return {
		entryFile: path.join(dataHome, 'applications', `${LAUNCHER_ID}.desktop`),
		// the bundled icon is 512x512
		iconFile: path.join(dataHome, 'icons', 'hicolor', '512x512', 'apps', `${LAUNCHER_ID}.png`)
	};
}

/** The entry to write, or null when this isn't an AppImage or the entry is already current. */
export function planLauncher(
	env: Record<string, string | undefined>,
	home: string,
	read: (file: string) => string | null
): { entryFile: string; entry: string } | null {
	const appImage = env.APPIMAGE;
	if (!appImage) return null;
	const { entryFile } = launcherPaths(env, home);
	const entry = launcherEntry(appImage);
	return needsWrite(read(entryFile), entry) ? { entryFile, entry } : null;
}
