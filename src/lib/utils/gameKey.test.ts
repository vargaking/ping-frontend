import { describe, expect, it } from 'vitest';
import { gameApiUrl, pluginConfig } from './gameKey';

describe('gameApiUrl', () => {
	it.each([
		['', 'https://zeta.example', 'https://zeta.example'],
		['https://api.zeta.example', 'https://zeta.example', 'https://api.zeta.example'],
		['https://api.zeta.example/', 'https://zeta.example', 'https://api.zeta.example'],
		['', 'https://zeta.example/', 'https://zeta.example']
	])('base %j on %s is %s', (base, origin, expected) => {
		expect(gameApiUrl(base, origin)).toBe(expected);
	});
});

describe('pluginConfig', () => {
	it('writes the two config.yml lines', () => {
		expect(pluginConfig('https://api.zeta.example', 'zgk_abc')).toBe(
			'api-url: https://api.zeta.example\napi-key: zgk_abc'
		);
	});
});
