import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	session,
	shell,
	type DesktopCapturerSource,
	type IpcMainEvent,
	type IpcMainInvokeEvent
} from 'electron';
import path from 'node:path';
import { assetPath } from './assets';
import { appUrl } from './config';
import { nameLauncherWindow, registerLauncher } from './launcher';
import { createLinuxAudio, type AudioStatus } from './linuxAudio';
import { getLaunchAtLogin, setLaunchAtLogin } from './login';
import { pickSource } from './picker';
import { listSources, toScreenSource } from './sources';
import { createTray, rebuildTrayMenu } from './tray';
import { applyUnread, parseUnread } from './unread';

const startUrl = appUrl(process.argv, process.env);
const appOrigin = startUrl.origin;
const startHidden = process.argv.includes('--hidden');

nameLauncherWindow();

const ALLOWED_PERMISSIONS = new Set([
	'media',
	'notifications',
	'clipboard-sanitized-write',
	'fullscreen',
	'display-capture'
]);

/** Zet's own sound is left out of what Linux shares; Windows has no such step. */
const linuxAudio =
	process.platform === 'linux'
		? createLinuxAudio({
				// Optional dependency: absent or unloadable means no sound, not no app.
				load: () => require('@vencord/venmic'),
				processes: () => app.getAppMetrics(),
				appNames: () => [...new Set([app.getName(), 'Zet'])]
			})
		: null;

/** Whether the PC's sound can go with a share, and if not on Linux, why. Null where it never can. */
function shareAudioStatus(): AudioStatus | null {
	if (process.platform === 'win32') return { ok: true };
	return linuxAudio?.status() ?? null;
}

function shareAudioArguments(): string[] {
	const status = shareAudioStatus();
	if (!status) return [];
	return [
		status.ok
			? '--zet-share-audio=1'
			: `--zet-share-audio-reason=${encodeURIComponent(status.reason)}`
	];
}

/** On Wayland the OS chooser opens on every listing and returns only what was picked. */
const SYSTEM_PICKER =
	process.platform === 'linux' &&
	(process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY);

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

let mainWindow: BrowserWindow | null = null;
let quitting = false;

let pageHasPicker = false;
// What the share dialog last listed, so the capture it starts doesn't open the system chooser again.
let keptSources: DesktopCapturerSource[] = [];
let keptGeneration = 0;
let sharePending = false;
let nextRequestId = 1;
let pendingPick: { requestId: number; settle: (result: PickResult) => void } | null = null;

type PickResult = { handled: boolean; id: string | null };

function originOf(url: string | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

const isAppOrigin = (url: string | undefined) => originOf(url) === appOrigin;

function openExternalIfSafe(url: string) {
	try {
		if (SAFE_EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) void shell.openExternal(url);
	} catch {
		// Not a URL: nothing to open.
	}
}

function showWindow() {
	if (!mainWindow) return;
	if (mainWindow.isMinimized()) mainWindow.restore();
	mainWindow.show();
	mainWindow.focus();
}

function fromApp(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
	return event.sender === mainWindow?.webContents && isAppOrigin(event.senderFrame?.url);
}

function fromOfflinePage(event: IpcMainEvent): boolean {
	return event.sender === mainWindow?.webContents && !!event.senderFrame?.url.startsWith('file://');
}

function registerIpc() {
	ipcMain.on('shell:unread', (event, value) => {
		if (!fromApp(event) || !mainWindow) return;
		const state = parseUnread(value);
		if (state) applyUnread(mainWindow, state, showWindow);
	});

	ipcMain.on('shell:show', (event) => {
		if (fromApp(event)) showWindow();
	});

	ipcMain.handle('shell:get-login', (event) => (fromApp(event) ? getLaunchAtLogin() : null));

	ipcMain.handle('shell:set-login', (event, enabled) => {
		if (!fromApp(event) || typeof enabled !== 'boolean') return null;
		const result = setLaunchAtLogin(enabled);
		rebuildTrayMenu();
		return result;
	});

	ipcMain.handle('shell:list-sources', async (event) => {
		if (!fromApp(event) || !mainWindow) return [];
		const generation = keptGeneration;
		const sources = await listSources(mainWindow.getMediaSourceId());
		if (generation === keptGeneration) keptSources = sources;
		return sources.map(toScreenSource);
	});

	ipcMain.handle('shell:system-audio-start', (event): AudioStatus => {
		if (!fromApp(event) || !linuxAudio) return { ok: false, reason: "sound isn't available here" };
		return linuxAudio.start();
	});

	ipcMain.on('shell:system-audio-stop', (event) => {
		if (fromApp(event)) linuxAudio?.stop();
	});

	ipcMain.on('shell:share-dialog-closed', (event) => {
		if (fromApp(event)) clearKeptSources();
	});

	ipcMain.on('shell:picker-handler', (event, registered) => {
		if (fromApp(event) && typeof registered === 'boolean') pageHasPicker = registered;
	});

	ipcMain.on('shell:picked', (event, reply) => {
		if (!fromApp(event) || !pendingPick) return;
		const { requestId, id, handled } = reply ?? {};
		if (requestId !== pendingPick.requestId || typeof handled !== 'boolean') return;
		if (id !== null && typeof id !== 'string') return;
		pendingPick.settle({ handled, id });
	});

	ipcMain.on('shell:retry', (event) => {
		if (fromOfflinePage(event)) void mainWindow?.loadURL(startUrl.href);
	});
}

function clearKeptSources() {
	keptSources = [];
	keptGeneration++;
}

function resetPagePicker() {
	pageHasPicker = false;
	clearKeptSources();
	pendingPick?.settle({ handled: true, id: null });
}

function askPage(win: BrowserWindow, sources: DesktopCapturerSource[]): Promise<PickResult> {
	return new Promise((resolve) => {
		const requestId = nextRequestId++;
		const pick = {
			requestId,
			settle: (result: PickResult) => {
				if (pendingPick !== pick) return;
				pendingPick = null;
				resolve(result);
			}
		};
		pendingPick = pick;
		win.webContents.send('shell:pick-source', { requestId, sources: sources.map(toScreenSource) });
	});
}

async function chooseSource(win: BrowserWindow): Promise<DesktopCapturerSource | null> {
	const kept = keptSources;
	clearKeptSources();
	if (!pageHasPicker) return pickSource(win);
	const sources = kept.length > 0 ? kept : await listSources(win.getMediaSourceId());
	const result = await askPage(win, sources);
	if (!result.handled) return pickSource(win);
	return sources.find((source) => source.id === result.id) ?? null;
}

function registerSession() {
	const ses = session.defaultSession;

	ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
		callback(isAppOrigin(details.requestingUrl) && ALLOWED_PERMISSIONS.has(permission));
	});

	ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
		return isAppOrigin(requestingOrigin) && ALLOWED_PERMISSIONS.has(permission);
	});

	ses.setDisplayMediaRequestHandler(async (request, callback) => {
		if (!mainWindow || !isAppOrigin(request.frame?.url ?? request.securityOrigin)) {
			callback({});
			return;
		}
		if (sharePending) {
			callback({});
			return;
		}
		sharePending = true;
		const source = await chooseSource(mainWindow)
			.catch(() => null)
			.finally(() => {
				sharePending = false;
			});
		if (!source) {
			callback({});
			return;
		}
		callback({
			video: source,
			audio: request.audioRequested && process.platform === 'win32' ? 'loopback' : undefined
		});
	});
}

function titleBarOptions(): Electron.BrowserWindowConstructorOptions {
	if (process.platform === 'darwin') return { titleBarStyle: 'hiddenInset' };
	return {
		titleBarStyle: 'hidden',
		// One pixel short of the web top bar so its bottom border stays visible.
		titleBarOverlay: { color: '#0d0f11', symbolColor: '#e6e8ea', height: 43 }
	};
}

function createWindow() {
	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 940,
		minHeight: 560,
		backgroundColor: '#0d0f11',
		icon: assetPath('icon.png'),
		autoHideMenuBar: true,
		...titleBarOptions(),
		show: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			additionalArguments: [
				`--zet-version=${app.getVersion()}`,
				...(SYSTEM_PICKER ? ['--zet-system-picker'] : []),
				...shareAudioArguments()
			],
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			backgroundThrottling: false,
			spellcheck: true
		}
	});
	mainWindow = win;

	win.once('ready-to-show', () => {
		if (!startHidden) win.show();
	});

	win.on('close', (event) => {
		if (quitting) return;
		event.preventDefault();
		win.hide();
	});
	win.on('closed', () => {
		mainWindow = null;
	});

	const { webContents } = win;

	const resetPage = () => {
		resetPagePicker();
		linuxAudio?.stop();
	};
	webContents.on('did-navigate', resetPage);
	webContents.on('render-process-gone', resetPage);

	webContents.on('did-fail-load', (_event, errorCode, _description, validatedUrl, isMainFrame) => {
		if (!isMainFrame || errorCode === -3 || validatedUrl.startsWith('file:')) return;
		void win.loadFile(path.join(__dirname, '..', 'static', 'offline.html'));
	});

	webContents.setWindowOpenHandler(({ url }) => {
		openExternalIfSafe(url);
		return { action: 'deny' };
	});

	const guardNavigation = (event: Electron.Event, url: string) => {
		if (isAppOrigin(url)) return;
		event.preventDefault();
		openExternalIfSafe(url);
	};
	webContents.on('will-navigate', guardNavigation);
	webContents.on('will-redirect', guardNavigation);

	void win.loadURL(startUrl.href);
}

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on('second-instance', showWindow);

	app.on('web-contents-created', (_event, contents) => {
		if (contents === mainWindow?.webContents) return;
		contents.setWindowOpenHandler(() => ({ action: 'deny' }));
	});

	app.on('before-quit', () => {
		quitting = true;
		linuxAudio?.stop();
	});

	app.on('activate', showWindow);

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') app.quit();
	});

	void app.whenReady().then(() => {
		if (process.platform === 'win32') app.setAppUserModelId('app.zetchat.desktop');
		if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
		registerLauncher();

		registerIpc();
		registerSession();
		createWindow();
		createTray({ showWindow, quit: () => app.quit() });
	});
}
