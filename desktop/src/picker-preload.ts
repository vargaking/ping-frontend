import { contextBridge, ipcRenderer } from 'electron';

type PickerSource = {
	id: string;
	name: string;
	kind: 'screen' | 'window';
	thumbnail: string;
	icon?: string;
};

contextBridge.exposeInMainWorld('picker', {
	onSources(callback: (sources: PickerSource[]) => void) {
		ipcRenderer.on('picker:sources', (_event, sources: PickerSource[]) => callback(sources));
	},
	choose(id: string) {
		ipcRenderer.send('picker:choose', id);
	},
	cancel() {
		ipcRenderer.send('picker:cancel');
	}
});
