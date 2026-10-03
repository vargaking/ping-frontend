import { contextBridge, ipcRenderer } from 'electron';

const versionArg = process.argv.find((arg) => arg.startsWith('--zet-version='));

const bridge = {
	version: versionArg ? versionArg.slice('--zet-version='.length) : '',
	platform: process.platform as 'win32' | 'darwin' | 'linux',
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
	}
};

contextBridge.exposeInMainWorld('zetDesktop', bridge);
