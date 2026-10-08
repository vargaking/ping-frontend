import { app, BrowserWindow, Notification } from 'electron';
import { assetPath, image } from './assets';
import { setTrayUnread } from './tray';

export type UnreadState = { count: number; unread: boolean };

let summaryPending = process.argv.includes('--hidden');

export function parseUnread(value: unknown): UnreadState | null {
	if (typeof value !== 'object' || value === null) return null;
	const { count, unread } = value as Record<string, unknown>;
	if (typeof count !== 'number' || !Number.isFinite(count) || typeof unread !== 'boolean') {
		return null;
	}
	return { count: Math.min(Math.max(Math.floor(count), 0), 9999), unread };
}

function showStartupSummary(count: number, showWindow: () => void) {
	const noun = count === 1 ? 'message' : 'messages';
	const notification = new Notification({
		title: 'Zet',
		body: `You have ${count} unread ${noun}`,
		icon: assetPath('icon.png')
	});
	notification.on('click', showWindow);
	notification.show();
}

export function applyUnread(win: BrowserWindow, state: UnreadState, showWindow: () => void) {
	const { count, unread } = state;
	setTrayUnread(count, unread);

	if (process.platform === 'win32') {
		win.setOverlayIcon(unread ? image('overlay.png') : null, 'Unread messages');
	} else if (process.platform === 'darwin') {
		app.dock?.setBadge(count > 0 ? String(count) : unread ? '•' : '');
	} else {
		app.setBadgeCount(count);
	}

	// The web app reports zero until login and the first sync finish, so wait for the first real count.
	if (summaryPending && count > 0) {
		summaryPending = false;
		if (!win.isVisible()) showStartupSummary(count, showWindow);
	}
}
