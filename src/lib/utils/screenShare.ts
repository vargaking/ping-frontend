import { ScreenSharePresets, VideoPreset } from 'livekit-client';

export type ScreenPresetId = '720p30' | '1080p30' | '1080p60';
export type ScreenContent = 'detail' | 'motion';

export const SCREEN_PRESETS: Record<ScreenPresetId, { label: string; preset: VideoPreset }> = {
	'720p30': { label: '720p 30fps', preset: new VideoPreset(1280, 720, 2_500_000, 30) },
	'1080p30': { label: '1080p 30fps', preset: new VideoPreset(1920, 1080, 4_500_000, 30) },
	'1080p60': { label: '1080p 60fps', preset: new VideoPreset(1920, 1080, 7_000_000, 60) }
};

/**
 * Every share is published with these encodings, whatever the preset. Sharing again
 * with different ones in the same call leaves viewers without the video, so the
 * preset is applied to the top layer after publishing instead.
 */
export const SCREEN_PUBLISH = {
	encoding: SCREEN_PRESETS['1080p60'].preset.encoding,
	layers: [ScreenSharePresets.h360fps15, ScreenSharePresets.h720fps30]
};

export const SCREEN_CONTENT_LABELS: Record<ScreenContent, string> = {
	detail: 'Text and detail',
	motion: 'Motion and games'
};

export const DEFAULT_SCREEN_PRESET: ScreenPresetId = '1080p30';
export const DEFAULT_SCREEN_CONTENT: ScreenContent = 'detail';

export function screenShareSupported(): boolean {
	return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
}

/** The user dismissed the browser's picker, which isn't an error worth a toast. */
export function isPickerCancel(err: unknown): boolean {
	return (
		err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')
	);
}
