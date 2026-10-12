import { describe, expect, it } from 'vitest';
import {
	SCREEN_PRESETS,
	screenBitrateCap,
	screenCaptureConstraints,
	screenCeilingTarget,
	screenPublishOptions,
	screenShareSupported,
	sourceBelowPreset,
	type ScreenContent,
	type ScreenPresetId
} from './screenShare';

describe('screenShareSupported', () => {
	it('is on for a desktop browser that can capture', () => {
		expect(screenShareSupported(true, null)).toBe(true);
	});

	it('is off when the browser cannot capture', () => {
		expect(screenShareSupported(false, null)).toBe(false);
	});

	it.each(['ios', 'android'] as const)(
		'is off on %s even when the browser exposes capture',
		(platform) => {
			expect(screenShareSupported(true, platform)).toBe(false);
		}
	);
});

type Layer = [width: number, height: number, fps: number];

const cases: {
	preset: ScreenPresetId;
	content: ScreenContent;
	degradation: RTCDegradationPreference;
	lower: Layer[];
	topFps: number;
}[] = [
	{
		preset: '720p30',
		content: 'detail',
		degradation: 'maintain-resolution',
		lower: [[640, 360, 15]],
		topFps: 30
	},
	{
		preset: '720p30',
		content: 'motion',
		degradation: 'maintain-framerate',
		lower: [[640, 360, 30]],
		topFps: 30
	},
	{
		preset: '1080p30',
		content: 'detail',
		degradation: 'maintain-resolution',
		lower: [
			[640, 360, 15],
			[1280, 720, 30]
		],
		topFps: 30
	},
	{
		preset: '1080p30',
		content: 'motion',
		degradation: 'maintain-framerate',
		lower: [
			[640, 360, 30],
			[1280, 720, 30]
		],
		topFps: 30
	},
	{
		preset: '1080p60',
		content: 'detail',
		degradation: 'maintain-resolution',
		lower: [
			[640, 360, 15],
			[1280, 720, 30]
		],
		topFps: 60
	},
	{
		preset: '1080p60',
		content: 'motion',
		degradation: 'maintain-framerate',
		lower: [
			[640, 360, 30],
			[1280, 720, 30]
		],
		topFps: 60
	},
	{
		preset: '1440p30',
		content: 'detail',
		degradation: 'maintain-resolution',
		lower: [
			[640, 360, 15],
			[1280, 720, 30]
		],
		topFps: 30
	},
	{
		preset: '1440p60',
		content: 'motion',
		degradation: 'maintain-framerate',
		lower: [
			[640, 360, 30],
			[1280, 720, 30]
		],
		topFps: 60
	}
];

describe('screenPublishOptions', () => {
	it.each(cases)(
		'$preset in $content mode: $degradation, lower layers, top fps $topFps',
		({ preset, content, degradation, lower, topFps }) => {
			const options = screenPublishOptions(preset, content, SCREEN_PRESETS[preset].preset);

			expect(options.simulcast).toBe(true);
			expect(options.degradationPreference).toBe(degradation);
			expect(
				options.screenShareSimulcastLayers?.map((layer) => [
					layer.width,
					layer.height,
					layer.encoding.maxFramerate
				])
			).toEqual(lower);
			expect(options.screenShareEncoding?.maxFramerate).toBe(topFps);
		}
	);
});

describe('screenBitrateCap', () => {
	it.each([
		['1440p30', 2560, 1440, 8_000_000],
		['1440p30', 3440, 1440, 8_000_000 * ((3440 * 1440) / (2560 * 1440))],
		['1440p30', 3840, 1440, 12_000_000],
		['1440p30', 1920, 1080, 4_500_000],
		['1440p30', 1280, 720, 4_000_000],
		['1080p30', 2580, 1080, 4_500_000 * ((2580 * 1080) / (1920 * 1080))],
		['1080p60', 2880, 1080, 10_500_000],
		['720p30', 640, 360, 1_250_000]
	] as const)('%s at %dx%d caps at %d bps', (id, width, height, expected) => {
		expect(screenBitrateCap(id, { width, height })).toBe(Math.round(expected));
	});

	it('is the preset cap at the preset size', () => {
		const { preset } = SCREEN_PRESETS['1440p60'];
		expect(screenBitrateCap('1440p60', preset)).toBe(12_000_000);
	});
});

describe('screenCeilingTarget', () => {
	it.each([
		['1440p30', 2560, 1440],
		['1440p30', 3440, 1440],
		['1080p30', 1920, 1080],
		['1080p30', 2580, 1080]
	] as const)('lets %s at %dx%d through', (id, width, height) => {
		expect(screenCeilingTarget(id, { width, height })).toBeNull();
	});

	it.each([
		['1440p30', 5120, 1440],
		['1080p60', 3440, 1440]
	] as const)('scales %s at %dx%d down to the ceiling, keeping its shape', (id, width, height) => {
		const target = screenCeilingTarget(id, { width, height })!;
		const { preset } = SCREEN_PRESETS[id];

		expect(target.width * target.height).toBeLessThanOrEqual(preset.width * preset.height * 1.5);
		expect(target.width * target.height).toBeGreaterThan(preset.width * preset.height * 1.45);
		expect(target.width / target.height).toBeCloseTo(width / height, 2);
		expect(target.width % 2).toBe(0);
		expect(target.height % 2).toBe(0);
	});
});

describe('screenCaptureConstraints', () => {
	it.each(['chromium', 'firefox', 'other'] as const)('asks %s for an ideal height', (browser) => {
		expect(screenCaptureConstraints('1440p60', browser, 'monitor')).toEqual({
			height: { ideal: 1440 },
			width: { max: 3840 },
			frameRate: { ideal: 60 },
			displaySurface: 'monitor'
		});
	});

	it('asks Safari for a maximum height and a plain frame rate', () => {
		expect(screenCaptureConstraints('1080p30', 'safari')).toEqual({
			height: { max: 1080 },
			width: { max: 2880 },
			frameRate: 30
		});
	});
});

describe('sourceBelowPreset', () => {
	it.each([
		[1920, 1080, 1440],
		[2560, 1440, null],
		[3440, 1440, null]
	] as const)('%dx%d against 1440p is %s', (width, height, expected) => {
		expect(sourceBelowPreset('1440p30', { width, height })).toBe(expected);
	});
});
