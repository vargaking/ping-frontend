import { describe, expect, it } from 'vitest';
import { screenOutputText, topLayerSample, type ScreenOutput } from './screenOutput';

const output = (over: Partial<ScreenOutput>): ScreenOutput => ({
	width: 2560,
	height: 1440,
	fps: 30,
	limit: null,
	sourceBelow: null,
	...over
});

describe('screenOutputText', () => {
	it.each([
		[{}, 'Sending 2560×1440, 30 fps'],
		[
			{ width: 1920, height: 1080, sourceBelow: 1440 },
			'Sending 1920×1080, 30 fps (your screen is smaller than 1440p)'
		],
		[{ fps: 41, limit: 'cpu' as const }, 'Sending 2560×1440, 41 fps, limited by CPU'],
		[{ limit: 'bandwidth' as const }, 'Sending 2560×1440, 30 fps, limited by bandwidth']
	])('%j reads %s', (over, text) => {
		expect(screenOutputText(output(over))).toBe(text);
	});
});

describe('topLayerSample', () => {
	const layer = (frameWidth: number, framesPerSecond: number, reason = 'none') => ({
		frameWidth,
		frameHeight: Math.round((frameWidth * 9) / 16),
		framesPerSecond,
		qualityLimitationReason: reason
	});

	it('reads the widest layer', () => {
		expect(topLayerSample([layer(640, 15), layer(2560, 29.6, 'cpu'), layer(1280, 30)])).toEqual({
			width: 2560,
			height: 1440,
			fps: 30,
			limit: 'cpu'
		});
	});

	it.each([
		['no layers', []],
		['a top layer that is not sending', [layer(640, 15), layer(2560, 0)]],
		['layers without a size', [{ framesPerSecond: 30 }]]
	])('is null for %s', (_name, layers) => {
		expect(topLayerSample(layers)).toBeNull();
	});

	it('ignores a limit that is not cpu or bandwidth', () => {
		expect(topLayerSample([layer(1920, 30, 'other')])?.limit).toBeNull();
	});
});
