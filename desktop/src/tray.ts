import { Menu, Tray } from 'electron';
import { image } from './assets';
import { getLaunchAtLogin, setLaunchAtLogin } from './login';

type TrayActions = {
	showWindow: () => void;
	quit: () => void;
};

let tray: Tray | null = null;
let actions: TrayActions;
let unreadCount = 0;
let anyUnread = false;

function unreadLabel(): string {
	return unreadCount > 0 ? `Zet — ${unreadCount} unread` : anyUnread ? 'Zet — unread' : 'Zet';
}

export function rebuildTrayMenu() {
	if (!tray) return;
	const launchAtLogin = getLaunchAtLogin();
	tray.setContextMenu(
		Menu.buildFromTemplate([
			{ label: 'Open Zet', click: actions.showWindow },
			{ type: 'separator' },
			...(launchAtLogin === null
				? []
				: [
						{
							label: 'Launch at login',
							type: 'checkbox' as const,
							checked: launchAtLogin,
							click: (item: Electron.MenuItem) => {
								setLaunchAtLogin(item.checked);
								rebuildTrayMenu();
							}
						},
						{ type: 'separator' as const }
					]),
			{ label: 'Quit Zet', click: actions.quit }
		])
	);
}

export function createTray(trayActions: TrayActions) {
	actions = trayActions;
	tray = new Tray(image('tray.png'));
	tray.setToolTip('Zet');
	tray.on('click', actions.showWindow);
	rebuildTrayMenu();
}

export function setTrayUnread(count: number, unread: boolean) {
	unreadCount = count;
	anyUnread = unread;
	if (!tray) return;
	tray.setImage(image(unread ? 'tray-unread.png' : 'tray.png'));
	tray.setToolTip(unreadLabel());
}
