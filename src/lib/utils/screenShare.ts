import { ScreenSharePresets, VideoPreset, type TrackPublishOptions } from 'livekit-client';
import { mobilePlatform, type MobilePlatform } from './install';
import type { BrowserKind, Surface } from './shareSound';

export type ScreenPresetId = '720p30' | '1080p30' | '1080p60' | '1440p30' | '1440p60';
export type ScreenContent = 'detail' | 'motion';

export const SCREEN_PRESETS: Record<
	ScreenPresetId,
	{ label: string; preset: VideoPreset; upperLayers: VideoPreset[] }
> = {
	'720p30': {
		label: '720p 30fps',
		preset: new VideoPreset(1280, 720, 2_500_000, 30),
		upperLayers: []
	},
	'1080p30': {
		label: '1080p 30fps',
		preset: new VideoPreset(1920, 1080, 4_500_000, 30),
		upperLayers: [ScreenSharePresets.h720fps30]
	},
	'1080p60': {
		label: '1080p 60fps',
		preset: new VideoPreset(1920, 1080, 7_000_000, 60),
		upperLayers: [ScreenSharePresets.h720fps30]
	},
	'1440p30': {
		label: '1440p 30fps',
		preset: new VideoPreset(2560, 1440, 8_000_000, 30),
		upperLayers: [ScreenSharePresets.h720fps30]
	},
	'1440p60': {
		label: '1440p 60fps',
		preset: new VideoPreset(2560, 1440, 12_000_000, 60),
		upperLayers: [ScreenSharePresets.h720fps30]
	}
};

export type ScreenSize = { width: number; height: number };

/** The bitrate cap and the pixel ceiling follow the captured size, within these multiples of the preset's 16:9 size. */
const MIN_PIXEL_SCALE = 0.5;
const MAX_PIXEL_SCALE = 1.5;

function presetPixels(id: ScreenPresetId): number {
	const { width, height } = SCREEN_PRESETS[id].preset;
	return width * height;
}

export function screenBitrateCap(id: ScreenPresetId, captured: ScreenSize): number {
	const scale = (captured.width * captured.height) / presetPixels(id);
	const clamped = Math.min(MAX_PIXEL_SCALE, Math.max(MIN_PIXEL_SCALE, scale));
	return Math.round(SCREEN_PRESETS[id].preset.encoding.maxBitrate * clamped);
}

function pixelCeiling(id: ScreenPresetId): number {
	return presetPixels(id) * MAX_PIXEL_SCALE;
}

function widthMax(id: ScreenPresetId): number {
	return Math.floor(pixelCeiling(id) / SCREEN_PRESETS[id].preset.height);
}

export function screenCeilingTarget(id: ScreenPresetId, captured: ScreenSize): ScreenSize | null {
	const pixels = captured.width * captured.height;
	const ceiling = pixelCeiling(id);
	if (pixels <= ceiling) return null;
	const scale = Math.sqrt(ceiling / pixels);
	const even = (value: number) => Math.floor(value / 2) * 2;
	return { width: even(captured.width * scale), height: even(captured.height * scale) };
}

export function screenCaptureSize(settings: MediaTrackSettings, id: ScreenPresetId): ScreenSize {
	const { width, height } = SCREEN_PRESETS[id].preset;
	return { width: settings.width || width, height: settings.height || height };
}

export type ScreenCaptureConstraints = MediaTrackConstraints & { displaySurface?: Surface };

/** A preset caps the height only, so a source wider than 16:9 keeps its native width up to the ceiling. */
export function screenCaptureConstraints(
	id: ScreenPresetId,
	browser: BrowserKind,
	surface?: Surface
): ScreenCaptureConstraints {
	const { height, encoding } = SCREEN_PRESETS[id].preset;
	const fps = encoding.maxFramerate;
	const displaySurface = surface ? { displaySurface: surface } : {};
	if (browser === 'safari') {
		return {
			height: { max: height },
			width: { max: widthMax(id) },
			frameRate: fps,
			...displaySurface
		};
	}
	return {
		height: { ideal: height },
		width: { max: widthMax(id) },
		frameRate: { ideal: fps },
		...displaySurface
	};
}

export function screenTargetConstraints(
	id: ScreenPresetId,
	target: ScreenSize
): MediaTrackConstraints {
	return {
		width: { max: target.width },
		height: { max: target.height },
		frameRate: { ideal: SCREEN_PRESETS[id].preset.encoding.maxFramerate }
	};
}

export function sourceBelowPreset(id: ScreenPresetId, captured: ScreenSize): number | null {
	const { height } = SCREEN_PRESETS[id].preset;
	// A capture held at the width maximum is short because of the source's shape, not its size.
	if (captured.width >= widthMax(id) - 2) return null;
	return captured.height < height ? height : null;
}

const BOTTOM_LAYER: Record<ScreenContent, VideoPreset> = {
	detail: ScreenSharePresets.h360fps15,
	motion: new VideoPreset(640, 360, 600_000, 30, 'medium')
};

const DEGRADATION: Record<ScreenContent, RTCDegradationPreference> = {
	detail: 'maintain-resolution',
	motion: 'maintain-framerate'
};

export function screenPublishOptions(
	id: ScreenPresetId,
	content: ScreenContent,
	captured: ScreenSize
): TrackPublishOptions {
	const { preset, upperLayers } = SCREEN_PRESETS[id];
	return {
		screenShareEncoding: { ...preset.encoding, maxBitrate: screenBitrateCap(id, captured) },
		screenShareSimulcastLayers: [BOTTOM_LAYER[content], ...upperLayers],
		degradationPreference: DEGRADATION[content],
		simulcast: true
	};
}

export const SCREEN_CONTENT_LABELS: Record<ScreenContent, string> = {
	detail: 'Text and detail',
	motion: 'Motion and games'
};

export const DEFAULT_SCREEN_PRESET: ScreenPresetId = '1080p30';
export const DEFAULT_SCREEN_CONTENT: ScreenContent = 'detail';

/** Phone and tablet browsers can expose getDisplayMedia without being able to capture the screen. */
export function screenShareSupported(
	hasGetDisplayMedia = typeof navigator !== 'undefined' &&
		!!navigator.mediaDevices?.getDisplayMedia,
	platform: MobilePlatform = typeof navigator === 'undefined'
		? null
		: mobilePlatform(navigator.userAgent, navigator.maxTouchPoints)
): boolean {
	return hasGetDisplayMedia && platform === null;
}

/** iPhone Safari has no Fullscreen API for elements; iPad and desktops do. */
export function fullscreenSupported(): boolean {
	return typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

/** The user dismissed the browser's picker, which isn't an error worth a toast. */
export function isPickerCancel(err: unknown): boolean {
	return (
		err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')
	);
}
