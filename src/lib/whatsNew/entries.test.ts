import { describe, expect, it } from 'vitest';
import { WHATS_NEW_ID } from '$lib/utils/whatsNew';
import { WHATS_NEW } from './entries';

describe('WHATS_NEW', () => {
	it('is not empty', () => {
		expect(WHATS_NEW.length).toBeGreaterThan(0);
	});

	it.each(WHATS_NEW.map((entry) => [entry.id, entry] as const))(
		'%s is well formed',
		(_id, entry) => {
			expect(entry.id).toMatch(WHATS_NEW_ID);
			expect(entry.id.startsWith(entry.date)).toBe(true);
			const parsed = new Date(`${entry.date}T00:00:00Z`);
			expect(parsed.toISOString().slice(0, 10)).toBe(entry.date);

			expect(entry.title.trim()).not.toBe('');
			expect(entry.title.length).toBeLessThanOrEqual(60);

			expect(entry.bullets.length).toBeGreaterThanOrEqual(1);
			expect(entry.bullets.length).toBeLessThanOrEqual(5);
			for (const bullet of entry.bullets) {
				expect(bullet.trim()).not.toBe('');
				expect(bullet.length).toBeLessThanOrEqual(160);
			}

			if (entry.image) {
				expect(entry.image.src.startsWith('/whats-new/')).toBe(true);
				expect(entry.image.alt.trim()).not.toBe('');
			}
		}
	);

	it('has unique ids, newest first', () => {
		const ids = WHATS_NEW.map((entry) => entry.id);
		for (let i = 1; i < ids.length; i++) expect(ids[i - 1] > ids[i]).toBe(true);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
