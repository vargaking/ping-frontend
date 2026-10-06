import { afterEach, describe, expect, it } from 'vitest';
import { membersPanelState } from './membersPanelState.svelte';
import { phoneState } from './phoneState.svelte';

afterEach(() => {
	phoneState.phone = false;
	membersPanelState.closeSheet();
	if (!membersPanelState.open) membersPanelState.toggle();
});

describe('membersPanelState', () => {
	it('is open on desktop by default', () => {
		expect(membersPanelState.open).toBe(true);
	});

	it('is closed on a phone whatever the desktop panel is doing', () => {
		phoneState.phone = true;
		expect(membersPanelState.open).toBe(false);
	});

	it('keeps the sheet and the panel apart', () => {
		phoneState.phone = true;
		membersPanelState.toggle();
		expect(membersPanelState.open).toBe(true);
		phoneState.phone = false;
		expect(membersPanelState.open).toBe(true);
		membersPanelState.toggle();
		phoneState.phone = true;
		expect(membersPanelState.open).toBe(true);
		membersPanelState.closeSheet();
		expect(membersPanelState.open).toBe(false);
	});
});
