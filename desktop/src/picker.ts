import { BrowserWindow, desktopCapturer, ipcMain, type DesktopCapturerSource } from 'electron';
import path from 'node:path';

let open = false;

function toSource(source: DesktopCapturerSource) {
	return {
		id: source.id,
		name: source.name,
		kind: source.id.startsWith('screen:') ? ('screen' as const) : ('window' as const),
		thumbnail: source.thumbnail.toDataURL(),
		icon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : undefined
	};
}

/** Resolves to the chosen source, or null when cancelled or another picker is already open. */
export async function pickSource(parent: BrowserWindow): Promise<DesktopCapturerSource | null> {
	if (open) return null;
	open = true;
	try {
		const sources = await desktopCapturer.getSources({
			types: ['screen', 'window'],
			thumbnailSize: { width: 320, height: 180 },
			fetchWindowIcons: true
		});

		const win = new BrowserWindow({
			parent,
			modal: true,
			width: 720,
			height: 520,
			resizable: false,
			minimizable: false,
			maximizable: false,
			backgroundColor: '#0d0f11',
			autoHideMenuBar: true,
			show: false,
			webPreferences: {
				preload: path.join(__dirname, 'picker-preload.js'),
				contextIsolation: true,
				sandbox: true,
				nodeIntegration: false
			}
		});
		win.removeMenu();

		return await new Promise<DesktopCapturerSource | null>((resolve) => {
			let settled = false;
			const finish = (source: DesktopCapturerSource | null) => {
				if (settled) return;
				settled = true;
				ipcMain.removeListener('picker:choose', onChoose);
				ipcMain.removeListener('picker:cancel', onCancel);
				resolve(source);
				if (!win.isDestroyed()) win.close();
			};
			const fromPicker = (event: Electron.IpcMainEvent) => event.sender === win.webContents;
			const onChoose = (event: Electron.IpcMainEvent, id: unknown) => {
				if (!fromPicker(event)) return;
				finish(sources.find((source) => source.id === id) ?? null);
			};
			const onCancel = (event: Electron.IpcMainEvent) => {
				if (fromPicker(event)) finish(null);
			};
			ipcMain.on('picker:choose', onChoose);
			ipcMain.on('picker:cancel', onCancel);
			win.on('closed', () => finish(null));

			win.webContents.once('did-finish-load', () => {
				win.webContents.send('picker:sources', sources.map(toSource));
				win.show();
			});
			void win.loadFile(path.join(__dirname, '..', 'static', 'picker.html'));
		});
	} finally {
		open = false;
	}
}
