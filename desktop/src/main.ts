import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	session,
	shell,
	type IpcMainEvent,
	type IpcMainInvokeEvent
} from 'electron';
import path from 'node:path';
import { assetPath } from './assets';
import { appUrl } from './config';
import { getLaunchAtLogin, setLaunchAtLogin } from './login';
import { pickSource } from './picker';
import { createTray, rebuildTrayMenu } from './tray';
import { applyUnread, parseUnread } from './unread';

const startUrl = appUrl(process.argv, process.env);
const appOrigin = startUrl.origin;
const startHidden = process.argv.includes('--hidden');

const ALLOWED_PERMISSIONS = new Set([
	'media',
	'notifications',
	'clipboard-sanitized-write',
	'fullscreen',
	'display-capture'
]);

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

let mainWindow: BrowserWindow | null = null;
let quitting = false;

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

	ipcMain.on('shell:retry', (event) => {
		if (fromOfflinePage(event)) void mainWindow?.loadURL(startUrl.href);
	});
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
		const source = await pickSource(mainWindow).catch(() => null);
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

function createWindow() {
	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 940,
		minHeight: 560,
		backgroundColor: '#0d0f11',
		icon: assetPath('icon.png'),
		autoHideMenuBar: true,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			additionalArguments: [`--zet-version=${app.getVersion()}`],
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
	});

	app.on('activate', showWindow);

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') app.quit();
	});

	void app.whenReady().then(() => {
		if (process.platform === 'win32') app.setAppUserModelId('app.zetchat.desktop');
		if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

		registerIpc();
		registerSession();
		createWindow();
		createTray({ showWindow, quit: () => app.quit() });
	});
}
