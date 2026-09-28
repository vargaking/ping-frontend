/**
 * Voice keyboard shortcuts. Ctrl+Shift+M and Ctrl+Shift+D are taken by Chrome
 * and Firefox (profile menu / responsive design mode, bookmark all tabs), and
 * Ctrl+Alt is AltGr on many European layouts, so these use Alt+Shift. Matching
 * on `code` keeps them on the same physical keys across layouts.
 */
export const VOICE_SHORTCUTS = {
	mute: { code: 'KeyM', keys: 'Alt+Shift+M' },
	deafen: { code: 'KeyD', keys: 'Alt+Shift+D' }
} as const;

export type VoiceShortcut = keyof typeof VOICE_SHORTCUTS;

export function matchVoiceShortcut(e: KeyboardEvent): VoiceShortcut | null {
	if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return null;
	if (e.code === VOICE_SHORTCUTS.mute.code) return 'mute';
	if (e.code === VOICE_SHORTCUTS.deafen.code) return 'deafen';
	return null;
}
