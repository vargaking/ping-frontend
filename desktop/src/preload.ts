import { contextBridge, ipcRenderer } from 'electron';

const versionArg = process.argv.find((arg) => arg.startsWith('--zet-version='));

type ScreenSource = {
	id: string;
	name: string;
	kind: 'screen' | 'window';
	thumbnail: string;
	icon?: string;
};
type PickHandler = (sources: ScreenSource[]) => Promise<string | null>;

let pickHandler: PickHandler | null = null;

ipcRenderer.on(
	'shell:pick-source',
	async (_event, request: { requestId: number; sources: ScreenSource[] }) => {
		const { requestId, sources } = request;
		const handler = pickHandler;
		if (!handler) {
			ipcRenderer.send('shell:picked', { requestId, id: null, handled: false });
			return;
		}
		const id = await handler(sources).catch(() => null);
		ipcRenderer.send('shell:picked', { requestId, id, handled: true });
	}
);

const bridge = {
	version: versionArg ? versionArg.slice('--zet-version='.length) : '',
	platform: process.platform as 'win32' | 'darwin' | 'linux',
	frameless: true,
	canShareAudio: process.platform === 'win32',
	systemPicker: process.argv.includes('--zet-system-picker'),
	setUnread(state: { count: number; unread: boolean }) {
		ipcRenderer.send('shell:unread', state);
	},
	showWindow() {
		ipcRenderer.send('shell:show');
	},
	getLaunchAtLogin(): Promise<boolean | null> {
		return ipcRenderer.invoke('shell:get-login');
	},
	setLaunchAtLogin(enabled: boolean): Promise<boolean | null> {
		return ipcRenderer.invoke('shell:set-login', enabled);
	},
	retry() {
		ipcRenderer.send('shell:retry');
	},
	listScreenSources(): Promise<ScreenSource[]> {
		return ipcRenderer.invoke('shell:list-sources');
	},
	shareDialogClosed() {
		ipcRenderer.send('shell:share-dialog-closed');
	},
	onPickScreenSource(handler: PickHandler) {
		pickHandler = handler;
		ipcRenderer.send('shell:picker-handler', true);
		return () => {
			if (pickHandler !== handler) return;
			pickHandler = null;
			ipcRenderer.send('shell:picker-handler', false);
		};
	}
};

contextBridge.exposeInMainWorld('zetDesktop', bridge);
