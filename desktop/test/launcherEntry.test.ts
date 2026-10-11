import assert from 'node:assert/strict';
import test from 'node:test';
import {
	launcherEntry,
	launcherPaths,
	needsWrite,
	planLauncher,
	quoteExecArg
} from '../src/launcherEntry.ts';

const home = '/home/me';

test('entry points at the AppImage and groups the window under its icon', () => {
	const entry = launcherEntry('/opt/Zet.AppImage');
	assert.deepEqual(entry.split('\n'), [
		'[Desktop Entry]',
		'Type=Application',
		'Name=Zet',
		'Exec="/opt/Zet.AppImage" %U',
		'TryExec=/opt/Zet.AppImage',
		'Icon=zet',
		'StartupWMClass=zet',
		'Categories=Network;Chat;',
		'Terminal=false',
		''
	]);
});

test('paths with spaces stay one quoted Exec argument', () => {
	const entry = launcherEntry('/home/me/My Apps/Zet.AppImage');
	assert.match(entry, /^Exec="\/home\/me\/My Apps\/Zet\.AppImage" %U$/m);
	assert.match(entry, /^TryExec=\/home\/me\/My Apps\/Zet\.AppImage$/m);
});

test('reserved characters in Exec are escaped', () => {
	assert.equal(quoteExecArg('/a"b$c`d%e'), '"/a\\\\"b\\\\$c\\\\`d%%e"');
	assert.equal(quoteExecArg('/a\\b'), '"/a\\\\\\\\b"');
});

test('a newline in the path cannot add keys', () => {
	const entry = launcherEntry('/a\nExec=evil');
	assert.equal(entry.split('\n').filter((line) => line.startsWith('Exec=')).length, 1);
});

test('rewrites when the AppImage moved', () => {
	const old = launcherEntry('/old/Zet.AppImage');
	const plan = planLauncher({ APPIMAGE: '/new/Zet.AppImage' }, home, () => old);
	assert.equal(plan?.entry, launcherEntry('/new/Zet.AppImage'));
	assert.equal(plan?.entryFile, '/home/me/.local/share/applications/zet.desktop');
});

test('writes when no entry exists yet', () => {
	const plan = planLauncher({ APPIMAGE: '/opt/Zet.AppImage' }, home, () => null);
	assert.equal(plan?.entry, launcherEntry('/opt/Zet.AppImage'));
});

test('does not write when nothing changed', () => {
	const current = launcherEntry('/opt/Zet.AppImage');
	assert.equal(
		planLauncher({ APPIMAGE: '/opt/Zet.AppImage' }, home, () => current),
		null
	);
	assert.equal(needsWrite(current, current), false);
	assert.equal(needsWrite(null, current), true);
});

test('writes nothing outside an AppImage', () => {
	const read = () => {
		throw new Error('should not read');
	};
	assert.equal(planLauncher({}, home, read), null);
	assert.equal(planLauncher({ APPIMAGE: '' }, home, read), null);
});

test('XDG_DATA_HOME moves the entry and the icon', () => {
	assert.deepEqual(launcherPaths({ XDG_DATA_HOME: '/data' }, home), {
		entryFile: '/data/applications/zet.desktop',
		iconFile: '/data/icons/hicolor/512x512/apps/zet.png'
	});
	assert.deepEqual(launcherPaths({}, home), {
		entryFile: '/home/me/.local/share/applications/zet.desktop',
		iconFile: '/home/me/.local/share/icons/hicolor/512x512/apps/zet.png'
	});
});
