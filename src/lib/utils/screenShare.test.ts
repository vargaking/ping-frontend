import { describe, expect, it } from 'vitest';
import {
	screenPublishOptions,
	screenShareSupported,
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
	}
];

describe('screenPublishOptions', () => {
	it.each(cases)(
		'$preset in $content mode: $degradation, lower layers, top fps $topFps',
		({ preset, content, degradation, lower, topFps }) => {
			const options = screenPublishOptions(preset, content);

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
